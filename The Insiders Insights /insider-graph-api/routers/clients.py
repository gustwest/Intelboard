"""Endpoints för Graph-kunder och deras medarbetare.

Läsning (lista/hämta) + skrivning: opt-out per medarbetare, GDPR-radering av
en medarbetare (employee-doc + raw_items + claims som refererar hen) samt
radering av en hel kund (alla subcollections via recursive_delete).
"""
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import firestore_client as fs
import ttl_cache
from config import settings
from routers.inbox import _count_client  # samma "väntar på människa"-räkning som inkorgen
from schema_org import urls
from services import audience_personas, blob_storage, contacts as contacts_svc, persona_derivation, persona_registry
from services.discovery import _normalize_org_number
from services.identity_enrichment import apply_identity_metadata
from services.output_quality import AudiencePriority

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/clients", tags=["clients"])

# Mätkonfiguration — kanonisk persona-vokabulär (services/audience_personas.py),
# delad med risk_detector + monthly_report + output_quality.
MEASUREMENT_PERSONAS = audience_personas.CANONICAL  # customer / employee / investor
POLLING_CATEGORIES = ("affar", "finans", "innovation", "hr")
# Profilsidans språk (BCP 47-bas). Default sv; utbyggbart när C3-språkbeslutet tas.
SUPPORTED_LANGUAGES = ("sv", "en")
DEFAULT_LANGUAGE = "sv"


class EmployeePatch(BaseModel):
    opted_out: bool | None = None


class ContactInput(BaseModel):
    """En kundkontakt (N2). `is_primary` markerar huvudkontakten — exakt en sådan
    upprätthålls vid spara. `role` är valfri fritext (t.ex. "webbansvarig") som senare
    kan styra cc-routing av kit/utskick."""
    email: str
    name: str | None = None
    role: str | None = None
    is_primary: bool = False


class ClientConfigUpdate(BaseModel):
    """Per-kund mätkonfiguration (AI-synlighet). Alla fält valfria — utelämnade rörs ej.

    industry/topic/service_area fyller default-frågornas platshållare ({industry} m.fl.).
    risk_personas väljer vilka personas riskloopen genererar/mäter. polling_questions
    ersätter default-frågebatteriet per kategori (tomt = återgå till defaults).
    audience_priorities driver output-kvalitets-rubric:en ([[project_icp_multi_audience]])
    och sätts antingen manuellt eller via /derive-personas-endpointen."""

    industry: str | None = None
    topic: str | None = None
    service_area: str | None = None
    risk_personas: list[str] | None = None
    polling_questions: dict[str, list[str]] | None = None
    audience_priorities: list[AudiencePriority] | None = None
    # Aktiva warmth-probe-personor (Fas 2.1g). Lista av persona-id från
    # services/persona_registry. Saniteras via validate_active_set (kapar till
    # MAX_ACTIVE_PERSONAS_PER_CLIENT, dedupar, faller till defaults om tom/ogiltig).
    personas: list[str] | None = None
    # Identitetsmetadata som lyfts till Organization.logo + Organization.identifier
    # på compiler-grafen och i delivery-snippeten. Manuell input vinner alltid över
    # auto-extraherade värden (ops-redigering är sanning).
    logo_url: str | None = None
    org_number: str | None = None
    # Konkurrenter (GEO-riskloop §5.1): SVAGA ledtrådar till frågegenereringen +
    # disambiguering. Risk_detector läser client.get("competitors"); prompten
    # överviktar dem aldrig (härleder landskapet självständigt). Tom lista = rensa.
    competitors: list[str] | None = None
    # Kundkontakt för leverans-utskick (installationskit + månadsmejl, Spår B).
    # Felnotiser går ALDRIG hit — de stannar internt hos ops. Tom sträng = rensa.
    contact_email: str | None = None
    contact_name: str | None = None
    # Flera kontaktpersoner med en huvudkontakt (N2). När satt driver den
    # contact_email/contact_name (huvudkontakten speglas dit) så alla befintliga läsare
    # (kit, månadsmejl, reports) fungerar oförändrat. None = rör inte kontakterna.
    contacts: list[ContactInput] | None = None
    # Profilsidans språk (BCP 47-bas). Default sv. Driver i18n + inLanguage på
    # profilsida/JSON-LD. Tom sträng = återgå till default (sv).
    language: str | None = None


@router.get("")
def list_clients() -> dict[str, Any]:
    clients = []
    for client_id, data in fs.iter_clients():
        employee_count = sum(1 for _ in fs.iter_employees(client_id))
        clients.append(
            {
                "client_id": client_id,
                "company_name": data.get("company_name"),
                "company_linkedin_url": data.get("company_linkedin_url"),
                "active_connectors": data.get("active_connectors", []),
                "employee_count": employee_count,
                "tier": data.get("tier", "default"),
                "cdn_url": data.get("cdn_url"),
                "profile_url": data.get("profile_url"),
                "last_compiled": _iso(data.get("last_compiled")),
                "created_at": _iso(data.get("created_at")),
            }
        )
    clients.sort(key=lambda c: c.get("created_at") or "", reverse=True)
    return {"clients": clients}


@router.get("/{client_id}")
def get_client(client_id: str) -> dict[str, Any]:
    snap = fs.client_doc(client_id).get()
    if not snap.exists:
        raise HTTPException(404, f"client not found: {client_id}")
    data = snap.to_dict() or {}

    employees = []
    for emp_id, emp in fs.iter_employees(client_id):
        employees.append(
            {
                "employee_id": emp_id,
                "name": emp.get("name"),
                "title": emp.get("title"),
                "linkedin_url": emp.get("linkedin_url"),
                "gender": emp.get("gender"),
                "opted_out": bool(emp.get("opted_out")),
            }
        )
    employees.sort(key=lambda e: e.get("name") or "")

    return {
        "client_id": client_id,
        "company_name": data.get("company_name"),
        "company_linkedin_url": data.get("company_linkedin_url"),
        "active_connectors": data.get("active_connectors", []),
        "cdn_url": data.get("cdn_url"),
        "profile_url": data.get("profile_url"),
        "tier": data.get("tier", "default"),
        "profile_base_url": data.get("profile_base_url"),
        "last_compiled": _iso(data.get("last_compiled")),
        # Identitetsmetadata (driver Organization.logo + Organization.identifier).
        # Provenance per fält → UI:t kan visa "manuellt satt 2026-05-27" eller
        # "auto-fyllt från website 2026-05-26" så ops aldrig undrar varifrån värdet kom.
        "logo_url": data.get("logo_url"),
        "logo_url_source": data.get("logo_url_source"),
        "logo_url_set_at": data.get("logo_url_set_at"),
        "org_number": data.get("org_number"),
        "org_number_source": data.get("org_number_source"),
        "org_number_set_at": data.get("org_number_set_at"),
        # Mätkonfiguration (AI-synlighet) — driver MeasurementConfigEditor.
        "industry": data.get("industry"),
        "topic": data.get("topic"),
        "service_area": data.get("service_area"),
        "risk_personas": data.get("risk_personas") or list(MEASUREMENT_PERSONAS),
        "polling_questions": data.get("polling_questions") or {},
        # Konkurrenter (GEO-riskloop §5.1 svaga ledtrådar). [] om aldrig satt.
        "competitors": data.get("competitors") or [],
        # Kundkontakt för leverans-utskick (Spår B). None om aldrig satt.
        # contact_email/contact_name = legacy-spegling av huvudkontakten (bakåtkompat).
        "contact_email": data.get("contact_email"),
        "contact_name": data.get("contact_name"),
        # Flera kontakter med huvudkontakt (N2). Migreras-on-read ur legacy om contacts[] saknas.
        "contacts": contacts_svc.all_contacts(data),
        # Profilsidans språk — default sv om aldrig satt.
        "language": data.get("language") or DEFAULT_LANGUAGE,
        # Output-kvalitets-personor (audience_priorities). Sätt av användaren eller
        # härlett via /derive-personas. None om aldrig satt (UI visar tom-state).
        "audience_priorities": data.get("audience_priorities"),
        "audience_priorities_set_at": _iso(data.get("audience_priorities_set_at")),
        # Aktiva warmth-probe-personor (Fas 2.1g). Default = registry-defaults om aldrig satt.
        "personas": (data.get("personas") or {}).get("active") or list(persona_registry.default_persona_ids()),
        "employees": employees,
    }


@router.put("/{client_id}/config")
def update_client_config(client_id: str, payload: ClientConfigUpdate) -> dict[str, Any]:
    """Spara per-kund mätkonfiguration. Top-level-fält på client-doc (så polling.py +
    risk_detector.py läser dem direkt). Validerar personas och frågekategorier."""
    ref = fs.client_doc(client_id)
    existing_snap = ref.get()
    if not existing_snap.exists:
        raise HTTPException(404, f"client not found: {client_id}")
    existing = existing_snap.to_dict() or {}

    update: dict[str, Any] = {}
    # N2: (ny_huvudkontakt, gammal_huvudkontakt) sätts om huvudkontakten byts → bekräftelse.
    contact_change: tuple[str, str | None] | None = None
    for field in ("industry", "topic", "service_area"):
        val = getattr(payload, field)
        if val is not None:
            update[field] = val.strip()

    if payload.risk_personas is not None:
        # Normalisera ev. gammalt id (buyer/candidate) → kanoniskt före validering.
        incoming = [audience_personas.normalize(p) for p in payload.risk_personas]
        unknown = [p for p in incoming if p not in MEASUREMENT_PERSONAS]
        if unknown:
            raise HTTPException(400, f"unknown personas: {unknown}")
        # Bevara kanonisk ordning, dedupa.
        update["risk_personas"] = [p for p in MEASUREMENT_PERSONAS if p in incoming]

    if payload.polling_questions is not None:
        cleaned: dict[str, list[str]] = {}
        for cat, qs in payload.polling_questions.items():
            if cat not in POLLING_CATEGORIES:
                raise HTTPException(400, f"unknown polling category: {cat}")
            kept = [q.strip() for q in qs if q and q.strip()]
            if kept:
                cleaned[cat] = kept
        update["polling_questions"] = cleaned  # tomt dict = återgå till defaults

    if payload.audience_priorities is not None:
        # Spara som dict-lista (Firestore hanterar inte Pydantic-modeller direkt).
        update["audience_priorities"] = [a.model_dump() for a in payload.audience_priorities]
        update["audience_priorities_set_at"] = datetime.now(timezone.utc).isoformat()

    if payload.personas is not None:
        # Sanitera via registret: kapar till max-cap, dedupar, filtrerar okända,
        # faller till defaults om allt rensas bort. Aldrig en tom aktiv-lista.
        update["personas"] = {
            "active": persona_registry.validate_active_set(payload.personas),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

    now_iso = datetime.now(timezone.utc).isoformat()
    if payload.logo_url is not None:
        # Tom sträng → rensa fältet OCH provenance (släpper tillbaka platsen till
        # auto-enrichment vid nästa scrape-körning).
        logo = payload.logo_url.strip() or None
        # Validera vid källan: avvisa startsides-/icke-bild-URL:er (vanligaste felet är
        # att kundens startsida klistras in) så de aldrig sparas och renderas trasiga.
        if logo and urls.clean_logo_url(logo, (ref.get().to_dict() or {}).get("website")) is None:
            raise HTTPException(
                400,
                "logo_url ser inte ut som en bild-URL (eller är kundens startsida). "
                "Ange en direktlänk till en bildfil, t.ex. https://kund.se/logo.svg.",
            )
        update["logo_url"] = logo
        update["logo_url_source"] = "manual" if logo else None
        update["logo_url_set_at"] = now_iso if logo else None

    if payload.org_number is not None:
        org_nr = _normalize_org_number(payload.org_number)
        update["org_number"] = org_nr
        update["org_number_source"] = "manual" if org_nr else None
        update["org_number_set_at"] = now_iso if org_nr else None

    if payload.competitors is not None:
        # Strippa, dedupa (bevara ordning), släng tomma. Tom lista = rensa fältet.
        seen: set[str] = set()
        cleaned_comp: list[str] = []
        for c in payload.competitors:
            name = (c or "").strip()
            if name and name.lower() not in seen:
                seen.add(name.lower())
                cleaned_comp.append(name)
        update["competitors"] = cleaned_comp

    if payload.contact_email is not None:
        email = payload.contact_email.strip()
        if email and "@" not in email:
            raise HTTPException(400, "ogiltig contact_email")
        update["contact_email"] = email or None  # tom = rensa

    if payload.contact_name is not None:
        update["contact_name"] = payload.contact_name.strip() or None

    if payload.contacts is not None:
        # N2: flera kontakter med exakt en huvudkontakt. Spegla huvudkontakten till
        # legacy contact_email/contact_name så kit/månadsmejl/reports fungerar oförändrat.
        cleaned_contacts = _normalize_contacts(payload.contacts)
        update["contacts"] = cleaned_contacts
        update["contacts_updated_at"] = now_iso  # byte loggas (vem-fältet kan tillkomma)
        primary = next((c for c in cleaned_contacts if c["is_primary"]), None)
        new_primary_email = primary["email"] if primary else None
        update["contact_email"] = new_primary_email
        update["contact_name"] = primary["name"] if primary else None
        old_primary_email = existing.get("contact_email")
        if new_primary_email and new_primary_email != old_primary_email:
            contact_change = (new_primary_email, old_primary_email)

    if payload.language is not None:
        lang = payload.language.strip().lower()
        if lang and lang not in SUPPORTED_LANGUAGES:
            raise HTTPException(400, f"unsupported language: {lang}")
        update["language"] = lang or None  # tom = återgå till default (sv)

    if update:
        ref.update(update)
    if contact_change:
        _send_contact_confirmation(client_id, existing, update, *contact_change)
    return {"status": "ok", **update}


def _send_contact_confirmation(client_id: str, existing: dict[str, Any],
                               update: dict[str, Any], new_primary: str,
                               old_primary: str | None) -> None:
    """N2: best-effort-bekräftelse till en ny huvudkontakt (cc gamla) så fel-adresser
    fångas direkt. Ett fel/utebliven mejlkonfig fäller ALDRIG spara (samma mönster som
    övriga kundutskick). Lazy import undviker cykel clients↔services."""
    try:
        from services import notifications
        from services.monthly_report import render_contact_confirmation_email

        company = existing.get("company_name") or client_id
        lang = update.get("language") or existing.get("language")
        subject, html_body, text_body = render_contact_confirmation_email(company, lang)
        cc = [old_primary] if old_primary and old_primary != new_primary else None
        notifications.send_customer_email(new_primary, subject, html_body, text_body, cc=cc)
    except Exception:  # noqa: BLE001 — bekräftelse är aldrig kritisk
        log.debug("kontakt-bekräftelse kunde inte skickas för %s", client_id, exc_info=True)


@router.post("/{client_id}/enrich-identity")
def enrich_identity(client_id: str) -> dict[str, Any]:
    """Lift-only: kör apply_identity_metadata på BEFINTLIG rådata och rapportera vad
    som hände — fyller manuellt-tomma fält från senaste scrape, rör inget annat.

    UI:t (IdentityMetadataEditor "Hämta automatiskt"-knappen) anropar denna. Tunga
    om-scrapes (för fältfärsk data) sker fortfarande via "Uppdatera profil"
    (extract_claims-jobbet) eller cron — denna endpoint körs i request-tråden och
    ska vara billig.

    Returnerar:
      updates: {fält: {value, source, set_at}} — vad som FAKTISKT skrevs
      no_data_for: [fält] — vi försökte, men ingen kandidat i raw_items_company

    Fält som redan är satta listas inte i nått av fälten (rörs ej, inget att säga).
    """
    if not fs.client_doc(client_id).get().exists:
        raise HTTPException(404, f"client not found: {client_id}")
    result = apply_identity_metadata(client_id)
    return {"client_id": client_id, **result}


@router.post("/{client_id}/derive-personas")
def derive_personas(client_id: str) -> dict[str, Any]:
    """Auto-härled audience_priorities ur befintlig hemsidedata + jobbannonser.

    Persisterar ingenting — returnerar bara förslag som UI:t visar för granskning.
    Användaren väljer sedan att spara via PUT /config eller kasta. Det möjliggör
    "pinning" utan att vi behöver track:a last-edited-by-fält i Firestore.

    Returnerar 503 om LLM:n inte är tillgänglig (Vertex AI EU saknas) och 422
    om vi inte har tillräckligt med källdata för att kunna härleda något.
    """
    snap = fs.client_doc(client_id).get()
    if not snap.exists:
        raise HTTPException(404, f"client not found: {client_id}")
    data = snap.to_dict() or {}

    result = persona_derivation.derive_audience_priorities(
        client_id, company_name=data.get("company_name")
    )
    if result.llm_unavailable:
        raise HTTPException(503, "persona-derivation LLM otillgänglig (Vertex AI EU ej konfigurerad)")
    if result.insufficient_data:
        raise HTTPException(
            422,
            "för lite källdata för att härleda audience_priorities — kör website-/jobfeed-connectorn först",
        )

    return {
        "client_id": client_id,
        "audience_priorities": [a.model_dump() for a in result.audience_priorities],
        "source_counts": result.source_counts,
        "derived_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/{client_id}/pipeline")
def get_pipeline(client_id: str) -> dict[str, Any]:
    """Kundens läge i pipelinen, steg för steg, ur befintlig data.

    Driver pipeline-stegen i UI:t (kunddetalj + kundlista). Tillstånd per steg:
    done (klart), attention (kräver en människa) eller todo (ej påbörjat).
    Resultatet cachas kort (tungt anrop som väver ihop flera collections).
    """
    if not fs.client_doc(client_id).get().exists:
        raise HTTPException(404, f"client not found: {client_id}")
    return ttl_cache.cached(f"pipeline:{client_id}", 20, lambda: _build_pipeline(client_id))


def _build_pipeline(client_id: str) -> dict[str, Any]:
    data = fs.client_doc(client_id).get().to_dict() or {}
    connectors = data.get("active_connectors", [])
    counts = _count_client(client_id, data)
    pending = sum(counts.values())
    last_compiled = data.get("last_compiled")
    cdn_url = data.get("cdn_url")
    polling_week = _latest_polling_week(client_id)
    raw_count = _raw_count(client_id)
    run_at = _latest_run_times(client_id)

    # Data-steget: senaste av de datahämtande jobben.
    data_at = _max_iso(run_at.get(j) for j in ("scrape_active", "scrape_website", "xml_sync"))
    has_data = raw_count is None and _has_any_raw(client_id) or bool(raw_count)

    steps = [
        {"key": "onboarded", "label": "Onboardad", "state": "done", "at": _iso(data.get("created_at")), "detail": None},
        {
            "key": "connectors",
            "label": "Connectors",
            "state": "done" if connectors else "todo",
            "detail": f"{len(connectors)} aktiva" if connectors else "Inga valda",
            "at": None,
        },
        {
            "key": "data",
            "label": "Data inkommen",
            "state": "done" if has_data else "todo",
            "detail": f"{raw_count} källposter" if raw_count else None,
            "at": data_at,
        },
        {
            "key": "review",
            "label": "Granskad",
            "state": "attention" if pending else "done",
            "detail": f"{pending} att granska" if pending else "Inget väntar",
            "at": None,
        },
        {
            "key": "compiled",
            "label": "Kompilerad",
            "state": "done" if last_compiled else "todo",
            "detail": None,
            "at": _iso(last_compiled) or run_at.get("compile_schema"),
        },
        {
            "key": "delivered",
            "label": "Levererad",
            "state": "done" if cdn_url else "todo",
            "detail": "CDN live" if cdn_url else None,
            "at": None,
        },
        {
            "key": "polling",
            "label": "AI-synlighet",
            "state": "done" if polling_week else "todo",
            "detail": polling_week or "Ej mätt",
            "at": run_at.get("polling"),
        },
    ]
    next_action = next((s["label"] for s in steps if s["state"] in ("attention", "todo")), None)
    return {"client_id": client_id, "steps": steps, "next_action": next_action, "pending": pending}


def _has_any_raw(client_id: str) -> bool:
    """Har någon data hämtats in (bolagsnivå eller per medarbetare)?"""
    for _ in fs.raw_items_company_col(client_id).limit(1).stream():
        return True
    for emp_id, _ in fs.iter_employees(client_id):
        for _ in fs.raw_items_col(client_id, emp_id).limit(1).stream():
            return True
    return False


def _raw_count(client_id: str) -> int | None:
    """Antal insamlade källposter (bolag + medarbetare) via count-aggregering.
    None om aggregeringen inte stöds → anroparen faller tillbaka till presence."""
    try:
        total = fs.raw_items_company_col(client_id).count().get()[0][0].value
        for emp_id, _ in fs.iter_employees(client_id):
            total += fs.raw_items_col(client_id, emp_id).count().get()[0][0].value
        return int(total)
    except Exception:  # noqa: BLE001
        return None


def _latest_run_times(client_id: str) -> dict[str, str | None]:
    """job_type → senaste körningens start (iso) för kunden, ur job_runs."""
    latest: dict[str, Any] = {}
    try:
        for snap in fs.job_runs_col().where("client_id", "==", client_id).stream():
            d = snap.to_dict() or {}
            jt, st = d.get("job_type"), d.get("started_at")
            if not jt or st is None:
                continue
            if jt not in latest or st > latest[jt]:
                latest[jt] = st
    except Exception:  # noqa: BLE001
        return {}
    return {k: _iso(v) for k, v in latest.items()}


def _max_iso(values) -> str | None:
    present = [v for v in values if v]
    return max(present) if present else None


def _latest_polling_week(client_id: str) -> str | None:
    """Senaste vecko-id i polling_results (hoppar över warmth-probe-dokumentet)."""
    weeks = [doc.id for doc in fs.polling_results_col(client_id).stream() if "warmth" not in doc.id]
    return max(weeks) if weeks else None


@router.patch("/{client_id}/employees/{employee_id}")
def patch_employee(client_id: str, employee_id: str, payload: EmployeePatch) -> dict[str, Any]:
    """Uppdatera en medarbetare. Idag: opt-out-toggle.

    opt-out stoppar bara framtida hämtning (scrape-jobben hoppar över hen) —
    redan insamlad data ligger kvar tills den raderas explicit.
    """
    ref = fs.employee_doc(client_id, employee_id)
    if not ref.get().exists:
        raise HTTPException(404, f"employee not found: {employee_id}")
    update: dict[str, Any] = {}
    if payload.opted_out is not None:
        update["opted_out"] = payload.opted_out
    if update:
        ref.update(update)
    return {"status": "ok", "employee_id": employee_id, **update}


@router.delete("/{client_id}/employees/{employee_id}")
def delete_employee(client_id: str, employee_id: str) -> dict[str, Any]:
    """Radera all data om en medarbetare (GDPR).

    1. employee-dokument + raw_items-subcollection (recursive_delete)
    2. claims där personen är subjekt (subject_ref == employee_id) → raderas
    3. claims som citerar personen som källa → källan dras bort; blir claimet
       källlöst raderas det (spec: ett claim utan källa skrivs aldrig).
    """
    ref = fs.employee_doc(client_id, employee_id)
    if not ref.get().exists:
        raise HTTPException(404, f"employee not found: {employee_id}")

    claims_removed, sources_pruned = _purge_employee_from_claims(client_id, employee_id)
    fs.db().recursive_delete(ref)
    return {
        "status": "deleted",
        "employee_id": employee_id,
        "claims_removed": claims_removed,
        "claim_sources_pruned": sources_pruned,
    }


@router.delete("/{client_id}")
def delete_client(client_id: str) -> dict[str, Any]:
    """Radera en hel kund: Firestore, publicerade CDN-objekt, privat underlag, körningsspår.

    Fyra steg, i ordning:
      1. recursive_delete på client-doc: tar samtliga subcollections (employees +
         raw_items, raw_items_company, claims, polling_results, risk_*, esg_*,
         monthly_reports, trust_gap*, verifications, todos m.fl.).
      2. CDN-bucket: schema.json, index.html, llms.txt — annars sitter den
         publika profilsidan kvar även efter att kunden tagits bort.
      3. Upload-bucket: linkedin/ + verifications/ — privat underlag (no-op om
         UPLOAD_BUCKET inte är konfigurerad).
      4. job_runs (root): kundens körningsspår, så historiken inte ligger kvar
         i 90 dagar tills TTL:n släpper den.

    Stegen 2-4 är best-effort: fel loggas men fäller inte raderingen (Firestore-
    datat är borta i steg 1, och vi vill inte att en transient GCS-strul ska
    lämna 200 OK omöjlig att få).
    """
    ref = fs.client_doc(client_id)
    if not ref.get().exists:
        raise HTTPException(404, f"client not found: {client_id}")

    fs.db().recursive_delete(ref)

    cleanup = {
        "cdn_objects_deleted": _delete_cdn_objects(client_id),
        "upload_objects_deleted": blob_storage.purge_client(client_id),
        "job_runs_deleted": _delete_job_runs(client_id),
    }
    return {"status": "deleted", "client_id": client_id, "cleanup": cleanup}


def _delete_cdn_objects(client_id: str) -> int:
    """Radera de publicerade artefakterna (schema.json/index.html/llms.txt)."""
    if not settings.cdn_bucket:
        return 0
    deleted = 0
    try:
        from google.cloud import storage

        bucket = storage.Client().bucket(settings.cdn_bucket)
        for object_name in (
            urls.schema_object(client_id),
            urls.page_object(client_id),
            urls.llms_object(client_id),
        ):
            blob = bucket.blob(object_name)
            if blob.exists():
                blob.delete()
                deleted += 1
    except Exception as exc:  # noqa: BLE001
        log.warning("CDN cleanup failed for %s: %s", client_id, exc)
    return deleted


def _delete_job_runs(client_id: str) -> int:
    """Radera samtliga körningsspår för en kund ur root-collectionen job_runs."""
    deleted = 0
    try:
        for snap in fs.job_runs_col().where("client_id", "==", client_id).stream():
            snap.reference.delete()
            deleted += 1
    except Exception as exc:  # noqa: BLE001
        log.warning("job_runs cleanup failed for %s: %s", client_id, exc)
    return deleted


def _purge_employee_from_claims(client_id: str, employee_id: str) -> tuple[int, int]:
    """Ta bort spår av en medarbetare ur klientens claims. Returnerar
    (antal raderade claims, antal claims där en källa drogs bort)."""
    claims_removed = 0
    sources_pruned = 0
    for claim_id, data in fs.iter_claims(client_id):
        if data.get("subject_ref") == employee_id:
            fs.claim_doc(client_id, claim_id).delete()
            claims_removed += 1
            continue
        sources = data.get("source") or []
        kept = [s for s in sources if s.get("employee_id") != employee_id]
        if len(kept) == len(sources):
            continue
        if not kept:
            fs.claim_doc(client_id, claim_id).delete()
            claims_removed += 1
        else:
            fs.claim_doc(client_id, claim_id).update({"source": kept})
            sources_pruned += 1
    return claims_removed, sources_pruned


def _normalize_contacts(contacts: list[ContactInput]) -> list[dict[str, Any]]:
    """Sanera kontaktlistan (N2): strippa, kräv giltig e-post, dedupa på e-post (skiftläges-
    okänsligt, bevara ordning), och upprätthåll EXAKT en huvudkontakt (markerad → den;
    ingen markerad → första; flera → första vinner). Tom lista = inga kontakter."""
    cleaned: list[dict[str, Any]] = []
    seen: set[str] = set()
    for c in contacts:
        email = (c.email or "").strip()
        if not email:
            continue
        if "@" not in email:
            raise HTTPException(400, f"ogiltig kontakt-epost: {email}")
        key = email.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append({
            "email": email,
            "name": (c.name or "").strip() or None,
            "role": (c.role or "").strip() or None,
            "is_primary": bool(c.is_primary),
        })
    if not cleaned:
        return []
    primary_idx = next((i for i, c in enumerate(cleaned) if c["is_primary"]), 0)
    for i, c in enumerate(cleaned):
        c["is_primary"] = (i == primary_idx)
    return cleaned


def _iso(value: Any) -> str | None:
    if not value:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)
