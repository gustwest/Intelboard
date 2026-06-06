"""P2 — leverans-hälsoverifiering (intern motpart till Spår B).

Spår B lämnar över snutt + profilsida till kunden. P2 är ops-kontrollen som svarar
på frågan "är leveransen FAKTISKT live?" — så att vi inte påstår att ett gap är
stängt (D2) mot en kund vars sida aldrig publicerades.

Kontrollen hämtar kundens publika profilsida (den AI-motorerna kan läsa) och verifierar
fyra saker, från svagast till starkast krav:
  reachable      — sidan svarar 200.
  has_jsonld     — minst ett parsebart JSON-LD-block finns (snutten är installerad).
  identity_match — grafen pekar på rätt entitet (@id == kanoniken, eller bolagsnamnet).
  fresh          — Organization bär dateModified (A5) → inte en stale stub.

Verdikt: live > stale > mismatch > missing. `evaluate()` är REN (testbar utan nät);
`check_live()` gör hämtningen (httpx, injicerbar i test). Best-effort: nätverksfel →
verdict "missing", aldrig ett kastat undantag (ops-vyn ska alltid kunna rendera).
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from typing import Any, Callable

import httpx

from schema_org.urls import canonical_url, served_url

log = logging.getLogger(__name__)

USER_AGENT = "GeogiraphDeliveryHealth/1.0 (+https://geogiraph.com)"
FETCH_TIMEOUT_SEC = 15

_LDJSON_RE = re.compile(
    r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
    re.IGNORECASE | re.DOTALL,
)


def _http_get(url: str) -> tuple[int, str]:
    """GET → (status, text). Nätverksfel → (0, "") (best-effort, fäller aldrig)."""
    try:
        with httpx.Client(timeout=FETCH_TIMEOUT_SEC, follow_redirects=True) as client:
            resp = client.get(url, headers={"User-Agent": USER_AGENT})
        return resp.status_code, resp.text or ""
    except httpx.HTTPError as exc:
        log.info("delivery-health: hämtning misslyckades för %s: %s", url, exc)
        return 0, ""


def _iter_nodes(parsed: Any):
    """Platta ut JSON-LD: lista, {@graph:[...]}, eller en ensam nod → noder en och en."""
    if isinstance(parsed, list):
        for item in parsed:
            yield from _iter_nodes(item)
    elif isinstance(parsed, dict):
        graph = parsed.get("@graph")
        if isinstance(graph, list):
            for item in graph:
                yield from _iter_nodes(item)
        else:
            yield parsed


def _parse_blocks(html: str) -> list[Any]:
    out: list[Any] = []
    for raw in _LDJSON_RE.findall(html or ""):
        try:
            out.append(json.loads(raw.strip()))
        except (ValueError, TypeError):
            continue  # ett trasigt block diskvalificerar inte resten
    return out


def evaluate(*, status: int, html: str, canonical: str, company_name: str) -> dict[str, Any]:
    """Ren utvärdering av en hämtad sida → checks + verdikt. Ingen I/O."""
    reachable = status == 200
    parsed = _parse_blocks(html) if reachable else []
    nodes = [n for block in parsed for n in _iter_nodes(block) if isinstance(n, dict)]
    has_jsonld = bool(nodes)

    canon = (canonical or "").rstrip("/").lower()
    company = (company_name or "").strip().lower()
    identity_match = False
    fresh = False
    for n in nodes:
        nid = str(n.get("@id") or "").rstrip("/").lower()
        name = str(n.get("name") or "").strip().lower()
        if (canon and nid == canon) or (company and name == company):
            identity_match = True
        if n.get("dateModified"):
            fresh = True

    if not reachable or not has_jsonld:
        verdict = "missing"
    elif not identity_match:
        verdict = "mismatch"
    elif not fresh:
        verdict = "stale"
    else:
        verdict = "live"

    return {
        "reachable": reachable,
        "has_jsonld": has_jsonld,
        "identity_match": identity_match,
        "fresh": fresh,
        "jsonld_blocks": len(parsed),
        "verdict": verdict,
        "is_live": verdict == "live",
    }


def check_live(
    client_id: str,
    client: dict[str, Any] | None = None,
    *,
    fetch: Callable[[str], tuple[int, str]] = _http_get,
) -> dict[str, Any]:
    """Hämta kundens profilsida och verifiera leveransen. `fetch` injicerbar i test.

    URL-val: den faktiskt publicerade `profile_url` (satt av compile-schema vid
    uppladdning) om den finns — annars den serverade adressen. Premium-kund med
    egen domän speglas i kanoniken."""
    client = client or {}
    url = client.get("profile_url") or served_url(client_id)
    canonical = canonical_url(client_id, client.get("profile_base_url"))
    company = client.get("company_name") or client_id

    status, html = fetch(url)
    checks = evaluate(status=status, html=html, canonical=canonical, company_name=company)
    return {
        "client_id": client_id,
        "url": url,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        **checks,
    }
