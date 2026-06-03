"""Cloud Run Job: model-availability-check.

Dagligt health-test mot varje LIVE modell i services/model_registry: gör en
trivial `.invoke()` med en kort prompt och loggar resultat. Fångar:

  * **Regions-glapp** — modellen finns i providerns katalog men inte i den region
    vi pekar på (`vertex_location`). Driver typiskt en flytt eller en av-aktivering.
  * **ToS-brist** — Claude på Vertex Model Garden kräver att Anthropic-ToS:en är
    accepterad PER projekt. Saknas det får vi PermissionDenied här innan det syns
    i polling-loopen.
  * **Quota / kvot** — billing/quota-fel rapporteras innan kund-trafiken träffar dem.

**Två lägen**:

  - Default (cron): skriver findings till `model_drift_findings` med kind
    `model_unavailable`. Inboxen plockar upp dem. Failar aldrig som process.

  - `--dry-run`: returnerar non-zero exit-kod vid fel. Används som CI-grind i
    `cloudbuild.yaml` så en deploy med en otillgänglig modell stoppas FÖRE den når
    prod. Det är enda stället där policyn faktiskt blockerar — drift-scannens
    "alltid senaste" är mild, men "modellen finns inte" är hård.

Policy om providers vi inte kan nå (`provider="claude_code_cli"`): hoppas över
— admin-agenten bor i en annan tjänst och dess tillgänglighet styrs separat.
"""
from __future__ import annotations

import argparse
import hashlib
import logging
import sys
from datetime import datetime, timezone
from typing import Iterable

from langchain_core.messages import HumanMessage, SystemMessage

import firestore_client as fs
from jobs._run_tracker import record_run
from services import model_registry

log = logging.getLogger("jobs.model_availability_check")

# Providers vars klienter vi kan konstruera och anropa här. Andra (t.ex.
# claude_code_cli som driver admin-agentens dropdown) lever utanför denna tjänst.
_TESTABLE_PROVIDERS = frozenset({
    "vertex_gemini",
    "vertex_anthropic",
    "vertex_mistral",
    "google_genai",
    "google_genai_vertex",
    "openai",
    "perplexity",
})

# Kort prompt — räcker för att tvinga ett genuint anrop utan att slösa tokens.
_PROBE_SYSTEM = "Answer with the single word 'OK'."
_PROBE_USER = "ping"


def run(dry_run: bool = False) -> int:
    """Returnerar antal otillgängliga modeller. dry_run=True → exit non-zero om >0
    (CI-grind). dry_run=False → skriver findings, returnerar antal men exitar 0."""
    with record_run("model_availability_check", client_id=None) as r:
        results = list(_probe_all())
        unavailable = [res for res in results if not res["available"]]
        if not dry_run:
            _persist(unavailable)
        summary = {
            "total_tested": len(results),
            "unavailable": len(unavailable),
            "skipped": sum(1 for res in results if res.get("skipped")),
        }
        r.summary = summary
        log.info("model_availability_check finished: %s", summary)
        return len(unavailable)


def _probe_all() -> Iterable[dict]:
    """Yield ett resultat-dict per testbar entry. Saknad SDK / saknad GCP-config
    → skipped=True (informativt, inte ett fel)."""
    for entry in model_registry.all_entries():
        if entry.provider not in _TESTABLE_PROVIDERS:
            yield {
                "role": entry.role, "model_id": entry.model_id,
                "provider": entry.provider, "available": True, "skipped": True,
                "reason": "provider testas inte i denna tjänst (t.ex. claude_code_cli)",
            }
            continue

        try:
            client = _build_client(entry)
        except Exception as exc:  # noqa: BLE001
            yield _unavailable(entry, "init_failed", str(exc))
            continue

        if client is None:
            yield {
                "role": entry.role, "model_id": entry.model_id,
                "provider": entry.provider, "available": True, "skipped": True,
                "reason": "ingen klient (saknat GCP-projekt / nyckel) — kontrollera lokalt",
            }
            continue

        try:
            client.invoke([SystemMessage(content=_PROBE_SYSTEM), HumanMessage(content=_PROBE_USER)])
        except Exception as exc:  # noqa: BLE001
            yield _unavailable(entry, _classify_error(exc), str(exc)[:300])
            continue

        yield {
            "role": entry.role, "model_id": entry.model_id,
            "provider": entry.provider, "available": True, "skipped": False,
            "reason": None,
        }


def _build_client(entry: model_registry.ModelEntry):
    """Konstruera en LLM-klient för rollen. Återanvänd llm.py:s sömmar där det går
    så vi testar EXAKT samma kodväg som prod använder."""
    # Lazy import — sätter inte sidoeffekter när modulen importeras (för testbarhet).
    from services import llm

    role = entry.role
    if role == "geo_generator":
        return llm.make_generator()
    if role == "geo_validator":
        return llm.make_validator()
    if role == "esg_reasoner":
        return llm.make_esg_reasoner()
    if role in ("probe_claude", "probe_gemini", "probe_mistral", "probe_openai", "probe_perplexity"):
        engines = llm.make_probe_engines()
        return engines.get(entry.model_id)

    # Övriga (email_extractor_*, dataset_summarizer) — bygg direkt utifrån provider.
    return _build_by_provider(entry)


def _build_by_provider(entry: model_registry.ModelEntry):
    from config import settings

    if entry.provider == "openai":
        if not settings.openai_api_key:
            return None
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(api_key=settings.openai_api_key, model=entry.model_id,
                          temperature=0, timeout=30)
    if entry.provider == "google_genai":
        if not settings.gemini_api_key:
            return None
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(google_api_key=settings.gemini_api_key,
                                      model=entry.model_id, temperature=0, timeout=30)
    if entry.provider in ("vertex_gemini", "google_genai_vertex"):
        if not settings.gcp_project:
            return None
        from langchain_google_vertexai import ChatVertexAI
        return ChatVertexAI(model=entry.model_id, project=settings.gcp_project,
                            location=settings.vertex_location, temperature=0)
    if entry.provider == "vertex_anthropic":
        if not settings.gcp_project:
            return None
        from langchain_google_vertexai.model_garden import ChatAnthropicVertex
        location = entry.vertex_location or settings.vertex_location
        return ChatAnthropicVertex(model_name=entry.model_id, project=settings.gcp_project,
                                   location=location, temperature=0)
    if entry.provider == "vertex_mistral":
        if not settings.gcp_project:
            return None
        # Återanvänd llm._vertex_mistral så availability-checken testar EXAKT samma kodväg
        # som prod (samma auth-flöde, samma base_url-konstruktion).
        from services import llm
        return llm._vertex_mistral(entry.model_id, location=entry.vertex_location or None)
    if entry.provider == "perplexity":
        if not settings.perplexity_api_key:
            return None
        from services import llm
        return llm._perplexity_chat(entry.model_id)
    return None


def _classify_error(exc: Exception) -> str:
    """Grovklassificera felet så ops vet vart de ska titta."""
    msg = (str(exc) or "").lower()
    if "permission" in msg or "403" in msg or "tos" in msg:
        return "permission_denied"  # ToS / IAM
    if "not found" in msg or "404" in msg:
        return "model_not_found"     # regions-glapp eller felstavat id
    if "quota" in msg or "429" in msg or "resource_exhausted" in msg:
        return "quota_exceeded"
    if "unauthenticated" in msg or "401" in msg:
        return "unauthenticated"
    return "invoke_failed"


def _unavailable(entry: model_registry.ModelEntry, error_kind: str, detail: str) -> dict:
    return {
        "role": entry.role, "model_id": entry.model_id, "provider": entry.provider,
        "available": False, "skipped": False,
        "reason": f"{error_kind}: {detail}",
        "error_kind": error_kind,
    }


def _persist(unavailable: list[dict]) -> None:
    """Skriv finding-docs i samma `model_drift_findings`-collection som drift-scan
    använder, så inboxen visar en enad lista. Idempotent — samma roll + felkind
    skriver över samma doc."""
    try:
        col = fs.model_drift_col()
    except Exception:  # noqa: BLE001
        log.exception("model_availability_check: kunde inte hämta firestore-collection")
        return

    now = datetime.now(timezone.utc)
    current_ids: set[str] = set()
    for u in unavailable:
        fid = _finding_id(u)
        current_ids.add(fid)
        title = f"{u['role']}: {u['model_id']} otillgänglig ({u['error_kind']})"
        try:
            col.document(fid).set(
                {
                    "id": fid,
                    "kind": "model_unavailable",
                    "severity": "warning",
                    "role": u["role"],
                    "model_id": u["model_id"],
                    "provider": u["provider"],
                    "title": title,
                    "details": u["reason"],
                    "status": "open",
                    "last_seen_at": now,
                },
                merge=True,
            )
        except Exception:  # noqa: BLE001
            log.exception("model_availability_check: kunde inte skriva finding %s", fid)

    # Städa: stäng (resolve) tidigare model_unavailable-findings som inte längre slår.
    try:
        for snap in col.where("kind", "==", "model_unavailable").stream():
            if snap.id not in current_ids:
                col.document(snap.id).set({"status": "resolved", "last_seen_at": now}, merge=True)
    except Exception:  # noqa: BLE001
        log.exception("model_availability_check: kunde inte städa gamla findings")


def _finding_id(u: dict) -> str:
    key = f"availability|{u['role']}|{u['model_id']}|{u['error_kind']}"
    return hashlib.sha1(key.encode("utf-8")).hexdigest()[:24]


def main() -> int:
    parser = argparse.ArgumentParser(description="Modell-tillgänglighetscheck")
    parser.add_argument("--dry-run", action="store_true",
                        help="Skriv INGA findings; exit non-zero om något är otillgängligt (CI-grind)")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    n_unavailable = run(dry_run=args.dry_run)
    if args.dry_run:
        return 0 if n_unavailable == 0 else 2  # 2 = "gate stoppade deploy"
    return 0


if __name__ == "__main__":
    sys.exit(main())
