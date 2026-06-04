"""Auto-härled audience_priorities (customer/candidate/investor) ur befintlig kunddata.

ICP för en Geogiraph-kund spänner över tre audience-typer — köpare, kandidater,
investerare ([[project_icp_multi_audience]]). Vi härleder dem ur två primära källor
som redan finns i pipelinen:

  * **Hemsidan** (website-connectorn, `raw_items_company`) — about, case studies,
    services-sidor signalerar customer-ICP.
  * **Jobbannonser** (jobfeed-connectorn, samma collection, items med
    `extra.source_label="jobfeed"` eller schema_type="JobPosting") — direkta signaler
    för candidate-ICP (roller, krav, employer brand-budskap).

LinkedIn-företagsdata och redan publicerade claims skulle kunna komplettera senare
(svagare signaler), men hålls utanför MVP för att hålla prompten ren.

Det här är en **suggestions-tjänst** — den persisterar ingenting. Användaren
granskar förslaget i kundkortet och sparar via PUT /api/clients/{id}/config om
hen vill behålla det. Det möjliggör "pinning" utan att vi behöver track:a
last-edited-by-fält: derive returnerar bara nya förslag, save styrs av användaren.

EU-only: använder `services.llm.make_validator()` (Gemini 2.5 Pro via Vertex EU).
None vid saknat GCP-projekt → endpoint returnerar 503-style fel till callern.
"""
from __future__ import annotations

import logging
from typing import Any

from pydantic import BaseModel, Field

import firestore_client as fs
from services.llm import invoke_json, make_validator
from services.output_quality import AudiencePriority, PersonaTarget

log = logging.getLogger(__name__)

# Budgetar för LLM-prompten — vi vill ha tillräckligt kontext men inte spränga
# kontextfönstret eller LLM-kostnaden. Plockar mest informationsrika items först.
MAX_WEBSITE_ITEMS = 20
MAX_JOB_ITEMS = 10
SNIPPET_CHARS = 400


class DerivationResult(BaseModel):
    """Resultat från derive_audience_priorities + diagnostik för UI:t."""

    audience_priorities: list[AudiencePriority] = Field(default_factory=list)
    # Källor som faktiskt användes — så UI kan visa "härlett från X website-sidor + Y jobbannonser"
    source_counts: dict[str, int] = Field(default_factory=dict)
    # True om vi inte hade tillräckligt med data för att härleda — UI visar tom-state
    insufficient_data: bool = False
    # True om LLM:n inte är tillgänglig (saknad GCP-projekt eller anropsfel)
    llm_unavailable: bool = False


def derive_audience_priorities(client_id: str, company_name: str | None = None) -> DerivationResult:
    """Läs befintlig hemsidedata + jobbannonser, härled audience_priorities via LLM.

    Persisterar ingenting. Caller (routern) returnerar förslaget till UI:t som
    sedan låter användaren välja att spara via PUT /config eller kasta."""
    website_items = _collect_website_items(client_id)
    job_items = _collect_job_items(client_id)
    source_counts = {"website": len(website_items), "jobfeed": len(job_items)}

    if not website_items and not job_items:
        return DerivationResult(source_counts=source_counts, insufficient_data=True)

    suggested = _derive_with_llm(website_items, job_items, company_name)
    if suggested is None:
        return DerivationResult(source_counts=source_counts, llm_unavailable=True)
    return DerivationResult(audience_priorities=suggested, source_counts=source_counts)


# --- Datainsamling ur Firestore -----------------------------------------------


def _collect_website_items(client_id: str) -> list[dict[str, Any]]:
    """Hämta website-items ur raw_items_company. Filtrerar bort jobfeed-items
    (samma collection) och dedupar per URL — website-connectorn skriver MÅNGA
    chunks per sida (upp till 300 totalt), vi vill inte spränga prompten med
    20 chunks från samma about-sida. Tar mest informativa chunken per URL."""
    by_url: dict[str, dict[str, Any]] = {}
    for snap in fs.raw_items_company_col(client_id).stream():
        data = snap.to_dict() or {}
        if _is_job_item(data):
            continue
        content = data.get("content") or data.get("text") or data.get("body") or ""
        if not content:
            continue
        url = data.get("url") or (data.get("extra") or {}).get("doc_url") or ""
        title = (data.get("extra") or {}).get("name") or data.get("title") or ""
        # Per URL: behåll chunken med längst content (= mest signal)
        existing = by_url.get(url)
        if existing is None or len(content) > len(existing["content"]):
            by_url[url] = {
                "url": url,
                "title": title,
                "content": content,
                "schema_type": data.get("schema_type"),
            }
    items = list(by_url.values())
    # Längst innehåll först → mer signal per slot
    items.sort(key=lambda it: len(it["content"]), reverse=True)
    return items[:MAX_WEBSITE_ITEMS]


def _collect_job_items(client_id: str) -> list[dict[str, Any]]:
    """Hämta jobfeed-items (samma collection som website, men taggade). Färskast först."""
    items: list[dict[str, Any]] = []
    for snap in fs.raw_items_company_col(client_id).stream():
        data = snap.to_dict() or {}
        if not _is_job_item(data):
            continue
        content = data.get("content") or data.get("text") or data.get("body") or ""
        extra = data.get("extra") or {}
        items.append({
            "title": extra.get("name") or data.get("title") or "",
            "content": content,
            "location": extra.get("jobLocation") or extra.get("location"),
            "published_at": data.get("published_at") or data.get("fetched_at") or "",
        })
    items.sort(key=lambda it: str(it.get("published_at") or ""), reverse=True)
    return items[:MAX_JOB_ITEMS]


def _is_job_item(data: dict[str, Any]) -> bool:
    """Heuristik: jobfeed-items har antingen schema_type=JobPosting, source=jobfeed
    eller en job_id i extra. (Den faktiska RawItem-modellen sätter alla tre.)"""
    if (data.get("schema_type") or "").lower() == "jobposting":
        return True
    if (data.get("source") or "").lower() == "jobfeed":
        return True
    extra = data.get("extra") or {}
    if extra.get("job_id"):
        return True
    return False


# --- LLM-pass -----------------------------------------------------------------


def _derive_with_llm(
    website_items: list[dict[str, Any]],
    job_items: list[dict[str, Any]],
    company_name: str | None,
) -> list[AudiencePriority] | None:
    """Anropa validator-LLM:n. None vid otillgänglighet/trasigt svar (söm för test)."""
    llm = make_validator()
    if llm is None:
        return None

    system = _build_system_prompt()
    user = _build_user_prompt(website_items, job_items, company_name)
    raw = invoke_json(llm, system, user)
    if not raw:
        log.warning("persona derivation: LLM returned no JSON")
        return None
    try:
        return _parse_llm_output(raw)
    except ValueError as exc:
        log.warning("persona derivation: failed to parse LLM output: %s", exc)
        return None


def _build_system_prompt() -> str:
    return (
        "Du analyserar källdata för ett bolag och identifierar bolagets ICP — vilka målgrupper "
        "de vill bli citerade av i AI-motorer.\n\n"
        "Det finns tre möjliga audience-typer (välj 1–3 baserat på vad datan visar):\n"
        "- customer: prospekt/köpare av tjänsten\n"
        "- candidate: talanger bolaget vill rekrytera (employer brand)\n"
        "- investor: kapital/börspublik (oftast bara för noterade eller growth-stage)\n\n"
        "För VARJE audience-typ bolaget verkar prioritera, ange:\n"
        "- audience_type: 'customer' | 'candidate' | 'investor'\n"
        "- weight: 0.0–1.0 (relativ prioritet — summan av alla weights ska vara ~1.0)\n"
        "- personas: 1–3 specifika personor med role, industry (om relevant), "
        "company_size (om relevant), description (en mening)\n"
        "- narrative_axes: 3–5 saker bolaget vill bli känt för INOM den audiencen, "
        "i korta fraser (3–8 ord vardera)\n\n"
        "Heuristiker:\n"
        "- Många jobbannonser och tydlig karriär-pitch → candidate har hög weight\n"
        "- Bara hemsida med kund-case → customer dominerar\n"
        "- IR-sektion eller börsdokument → investor finns med (annars utelämna)\n"
        "- B2B-konsulter / rekryteringsbyråer prioriterar ofta customer + candidate lika\n\n"
        "Returnera ENDAST ett JSON-objekt: {\"audience_priorities\": [{...}, ...]}. "
        "Inga andra fält, ingen text utanför JSON:en."
    )


def _build_user_prompt(
    website_items: list[dict[str, Any]],
    job_items: list[dict[str, Any]],
    company_name: str | None,
) -> str:
    parts: list[str] = [f"Bolag: {company_name or '(okänt)'}"]

    if website_items:
        parts.append(f"\n[WEBSITE — {len(website_items)} sidor]")
        for it in website_items:
            content = it.get("content", "")
            snippet = content[:SNIPPET_CHARS]
            if len(content) > SNIPPET_CHARS:
                snippet += "…"
            parts.append(f"URL: {it['url']}\nTitel: {it['title']}\nText: {snippet}\n")
    else:
        parts.append("\n[WEBSITE] (inga sidor — bolaget har ingen indexerad hemsida)")

    if job_items:
        parts.append(f"\n[JOBBANNONSER — {len(job_items)} aktuella]")
        for it in job_items:
            content = it.get("content", "")
            snippet = content[:SNIPPET_CHARS]
            if len(content) > SNIPPET_CHARS:
                snippet += "…"
            loc = f" ({it['location']})" if it.get("location") else ""
            parts.append(f"Roll: {it['title']}{loc}\nBeskrivning: {snippet}\n")
    else:
        parts.append("\n[JOBBANNONSER] (inga aktiva — candidate-signal saknas)")

    parts.append("\nHärled audience_priorities.")
    return "\n".join(parts)


def _parse_llm_output(raw: dict[str, Any]) -> list[AudiencePriority]:
    items = raw.get("audience_priorities")
    if not isinstance(items, list):
        raise ValueError("missing audience_priorities array")

    result: list[AudiencePriority] = []
    for it in items:
        if not isinstance(it, dict):
            continue
        audience_type = it.get("audience_type")
        if audience_type not in ("customer", "candidate", "investor"):
            continue
        try:
            weight = float(it.get("weight", 0.0))
        except (TypeError, ValueError):
            weight = 0.0

        personas_raw = it.get("personas") or []
        personas: list[PersonaTarget] = []
        for p in personas_raw:
            if not isinstance(p, dict):
                continue
            role = p.get("role")
            if not role:
                continue
            personas.append(PersonaTarget(
                role=str(role),
                industry=_str_or_none(p.get("industry")),
                company_size=_str_or_none(p.get("company_size")),
                description=_str_or_none(p.get("description")),
            ))

        narrative_axes = [
            str(a).strip()
            for a in (it.get("narrative_axes") or [])
            if isinstance(a, str) and a.strip()
        ]

        result.append(AudiencePriority(
            audience_type=audience_type,
            weight=max(0.0, min(1.0, weight)),
            personas=personas,
            narrative_axes=narrative_axes,
        ))
    return result


def _str_or_none(v: Any) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


# --- Claim audience-taggning (Fas 2.1b, docs/persona-model.md §4.2) ---------
# Härleder vilka personor ett claim är *särskilt* relevant för. Default-strategin
# är **regelbaserad** — dimension + warmth_mode + (förvalt) claim-typ → personor.
# Det är deterministiskt, gratis och snabbt. LLM-augmenterad taggning (för att
# fånga subtila signaler i statement-texten) kan läggas till som ett andra pass
# senare om vi ser i UI:t att default-mappningen missar relevanta claims.
#
# Returnerar bara personor som ÄR aktiva för kunden — vi taggar inte med personor
# som operatören inte spårar.


def derive_claim_audience(
    claim_data: dict[str, Any], active_personas: list[str] | None = None,
) -> list[str]:
    """Härled audience-taggar för ett claim baserat på dimension + facet.

    claim_data: dict med (minst) `facet`, `dimension`, `claim_kind`-fälten — kan vara
    en pydantic-model-dump eller en rå Firestore-payload.
    active_personas: personor som kunden faktiskt spårar (från clients/{id}.personas).
    None → använd hela paletten (för standalone-användning, t.ex. tester).

    Tom lista som returvärde = "evergreen" — claim är relevant för ALLA personor,
    schema.org-compilern emitterar inget Audience-objekt. Det är defaultens default.

    Designval: vi favoriserar precision över recall. En claim som taggas med en
    persona ska *verkligen* tala till den personan, annars förlorar audience-
    sektioneringen i llms.txt sitt värde. Bättre att en relevant claim är evergreen
    än att en irrelevant claim får fel tagg.
    """
    # Sen-import för att undvika cirkulär (persona_registry importerar inget från
    # services-laget men låt oss vara säkra).
    from services import persona_registry as pr

    facet = claim_data.get("facet") or "operational"
    dimension = claim_data.get("dimension")

    # Operational claims (företagsfakta, produkter, tjänster) är default evergreen.
    # Värme-claims är de som har persona-relevans genom dimensionen.
    if facet != "culture":
        return []
    if not dimension or dimension not in pr.DIMENSION_PERSONA_RELEVANCE:
        return []

    relevant = pr.DIMENSION_PERSONA_RELEVANCE[dimension]

    # Begränsa till kundens aktiva personor. None = ingen begränsning (testläge).
    if active_personas is not None:
        active = {p for p in active_personas if pr.is_valid(p)}
        if not active:
            return []
        relevant = relevant & active

    if not relevant:
        return []

    # Returnera i registry-ordning för UI-stabilitet (samma som validate_active_set).
    order = {p.id: i for i, p in enumerate(pr.all_personas())}
    return sorted(relevant, key=lambda pid: order.get(pid, 999))


def get_active_personas(client_id: str) -> list[str]:
    """Hämta clients/{id}.personas.active. Faller till persona_registry-defaults
    om kunden aldrig konfigurerat något. Best-effort — Firestore-fel → defaults."""
    from services import persona_registry as pr
    try:
        snap = fs.client_doc(client_id).get()
        if not getattr(snap, "exists", False):
            return list(pr.default_persona_ids())
        data = snap.to_dict() or {}
        personas = (data.get("personas") or {}).get("active") or []
        if isinstance(personas, list) and personas:
            return pr.validate_active_set(personas)
        return list(pr.default_persona_ids())
    except Exception as exc:  # noqa: BLE001 — audience-lookup får aldrig fälla skrivpath
        log.warning("get_active_personas failed for %s: %s", client_id, exc)
        return list(pr.default_persona_ids())
