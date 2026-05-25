"""GEO-riskloop, skiva 1 — frågegenerering + skadeklassning (read-only).

Se docs/hallucination-loop-spec.md. Flöde per kund:
  1. Bygg kontext ur kunskapsgrafen (facit + profil).
  2. Generera persona-frågebatterier (köpare/kandidat/investerare) i två spår
     (A om bolaget, B om branschen) med en djup expert-prompt — opus, §5.1.
  3. Ställ frågorna till motorerna (gpt-4o + gemini), som i polling.
  4. Klassa varje svar mot skademodell #1–6 (opus, §6). "ok" → ingen risk.
  5. Persistera findings (harm != ok) i clients/{id}/risk_findings, needs_review.

Read-only: vi rör inte den publika grafen här (korrigering = skiva 2). No-op om
ingen LLM är konfigurerad. Skadeklassning och generering kräver högsta kvalitet →
validator-modellen (claude-opus).
"""
from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from google.cloud import firestore

import firestore_client as fs
from schema_org.claims import derive_property_claims
from services import llm as llm_factory

log = logging.getLogger(__name__)

ALL_PERSONAS = ("buyer", "candidate", "investor")
HARM_MODES = {"#1", "#2", "#3", "#4", "#5", "#6"}
MAX_QUESTIONS_PER_PERSONA = 12  # skydd mot runaway-generering

# --- Persona-linser + few-shots (docs/hallucination-loop-spec.md §5.1) --------

_PERSONA_EXPERT = {
    "buyer": "senior B2B-inköpare som utvärderar {company} som leverantör för ett verkligt behov",
    "candidate": "eftertraktad yrkesperson som väger ett jobberbjudande hos {company}",
    "investor": "investerings-/DD-analytiker som granskar {company}",
}

_PERSONA_CRITERIA = {
    "buyer": "trovärdighet, fit för use case, leveransspår/referenser, finansiell "
    "uthållighet, pris/affärsmodell, alternativ, röda flaggor",
    "candidate": "stabilitet/tillväxt vs varsel, kultur/arbetsgivarrykte, ledningens "
    "trovärdighet, finansiell hälsa, CV-värde",
    "investor": "exakt legal entitet & ägande (förväxlingsrisk), finansiell soliditet, "
    "tvister/sanktioner, ledningens track record, marknadsposition",
}

_FEW_SHOTS = {
    "buyer": """Spår A (om {company}):
- "Sammanställ publika kundomdömen, forum och tech-bloggar om {company}. Vad är kunderna mest nöjda med, och vanligaste klagomålen?"
- "Har {company} varit involverade i kända dataläckor, rättsliga tvister eller publika systemhaverier de senaste åren?"
- "{company} eller {competitor} för {use_case} — vilken bör jag välja?"
- "Är {company} seriösa och tillräckligt stabila för ett flerårigt avtal?"
Spår B (om branschen):
- "Vilka är de ledande leverantörerna av {category} i {market}?"
- "Jag ska köpa in {category}. Vilka är de viktigaste tekniska kraven i kravspecen?"
- "Vad är standardprissättningen i branschen, och vilka dolda kostnader missar man?\"""",
    "candidate": """Spår A (om {company}):
- "Vad säger Glassdoor, Reddit och branschnyheter om arbetskultur och ledarskap på {company}?"
- "Hur ser personalomsättning och finansiell trend ut för {company}? Stabil arbetsplats?"
- "Växer {company} eller har de varslat nyligen?"
- "Är {company} ett respekterat namn att ha på CV:t i branschen?"
Spår B (om branschen):
- "Hur ser efterfrågan och löneutveckling ut för en {role} inom {industry} just nu?"
- "Vilka är de mest attraktiva arbetsgivarna för en {role} inom {industry}?"
- "Vilka kompetenser eller certifieringar har blivit nödvändiga i branschen senaste året?\"""",
    "investor": """Spår A (om {company}):
- "Gör en SWOT av {company} utifrån publik marknadsföring, produktutbud och historisk tillväxt."
- "Vilka är {company}:s tre närmaste konkurrenter, och vad är {company}:s USP?"
- "Hur ser ägarstruktur och historiska finansieringsrundor ut för {company}?"
- "Finns det tvister, sanktioner eller regulatoriska åtgärder kopplade till {company}?"
- "Är {company} samma bolag som {homonym}, eller en annan entitet?"
Spår B (om branschen):
- "Hur ser marknadstillväxten (CAGR) ut för {industry} i Europa, och vilka makrotrender driver den?"
- "Vilka är de största regulatoriska riskerna i branschen just nu?"
- "Sker mycket konsolidering i sektorn, eller poppar nya startups upp hela tiden?\"""",
}


# --- Datamodell ---------------------------------------------------------------


@dataclass
class Context:
    company_name: str
    profile: str   # läsbar faktablock för genereringen
    facit: str     # verifierade fakta för klassningen


@dataclass
class Question:
    persona: str
    track: str            # "A" | "B"
    text: str
    language: str         # "sv" | "en"
    decision_criterion: str = ""
    harm_modes: list[str] = field(default_factory=list)
    type: str = "open"


@dataclass
class RiskFinding:
    persona: str
    track: str
    question: str
    engine: str
    harm: str             # "#1".."#6"
    severity: str         # high|medium|low
    sourcing: str         # cites_customer|web|none
    engine_excerpt: str


@dataclass
class RiskRunResult:
    client_id: str
    questions_asked: int
    findings: list[RiskFinding]


# --- Orkestrering -------------------------------------------------------------


def run_for_client(client_id: str) -> RiskRunResult | None:
    snap = fs.client_doc(client_id).get()
    if not snap.exists:
        log.warning("risk loop: klient %s saknas", client_id)
        return None
    client = snap.to_dict() or {}

    validator = llm_factory.make_validator()
    engines = _build_engines()
    if validator is None or not engines:
        log.warning("risk loop: ingen LLM konfigurerad — hoppar över %s", client_id)
        return None

    context = build_context(client_id, client)
    competitors = [c for c in (client.get("competitors") or []) if c]
    homonyms = _find_homonyms(context.company_name, client.get("lei"))

    questions: list[Question] = []
    for persona in _active_personas(client):
        questions.extend(
            generate_questions(validator, persona, context, competitors, homonyms)
        )

    findings: list[RiskFinding] = []
    for q in questions:
        for engine_name, engine in engines.items():
            answer = _ask(q.text, engine)
            if not answer:
                continue
            cls = classify(validator, q, answer, context)
            if cls is None or cls.harm == "ok":
                continue
            cls.persona, cls.track, cls.question, cls.engine = (
                q.persona, q.track, q.text, engine_name,
            )
            _persist(client_id, cls)
            findings.append(cls)

    log.info("risk loop %s: %d frågor → %d findings", client_id, len(questions), len(findings))
    return RiskRunResult(client_id, len(questions), findings)


def _active_personas(client: dict) -> tuple[str, ...]:
    configured = client.get("risk_personas")
    if isinstance(configured, list) and configured:
        return tuple(p for p in configured if p in ALL_PERSONAS) or ALL_PERSONAS
    return ALL_PERSONAS


# --- Kontext ur grafen --------------------------------------------------------


def build_context(client_id: str, client: dict) -> Context:
    name = client.get("company_name") or client_id
    facts = [c.statement for c in derive_property_claims(client_id) if c.statement]
    for _cid, raw in fs.iter_claims(client_id):
        if raw.get("review_status") == "rejected" or not raw.get("included_in_output", True):
            continue
        if raw.get("statement"):
            facts.append(raw["statement"])
    people = [
        f"{emp.get('name')} ({emp.get('title')})" if emp.get("title") else emp.get("name")
        for _eid, emp in fs.iter_employees(client_id)
        if emp.get("name")
    ]

    meta = [f"Bolag: {name}"]
    for key, label in (("industry", "Bransch"), ("category", "Kategori"), ("market", "Marknad")):
        if client.get(key):
            meta.append(f"{label}: {client[key]}")
    if people:
        meta.append("Nyckelpersoner: " + ", ".join(p for p in people if p))

    block = "\n".join(meta + [f"- {f}" for f in facts]) or f"Bolag: {name}"
    facit = "\n".join([f"Bolag: {name}"] + [f"- {f}" for f in facts]) or f"Bolag: {name}"
    return Context(company_name=name, profile=block, facit=facit)


def _find_homonyms(company_name: str, own_lei: str | None) -> list[str]:
    """Bolag med samma/snarlikt legalt namn (GLEIF) — seedar förväxlingsfrågor (#1)."""
    try:
        from connectors.gleif import search_lei

        hits = search_lei(company_name, limit=5)
    except Exception as exc:  # best-effort; nätverk/parsning får inte fälla loopen
        log.info("homonym-sökning misslyckades för %s: %s", company_name, exc)
        return []
    out = []
    for h in hits:
        if h.get("lei") and h["lei"] != own_lei and h.get("name"):
            label = h["name"] + (f" ({h['address']})" if h.get("address") else "")
            out.append(label)
    return out[:3]


# --- Generering ---------------------------------------------------------------


def generate_questions(
    llm, persona: str, context: Context, competitors: list[str], homonyms: list[str]
) -> list[Question]:
    system = _generation_prompt(persona, context, competitors, homonyms)
    data = llm_factory.invoke_json(llm, system, "Generera frågebatteriet nu.")
    if not data:
        return []
    return _parse_questions(data, persona)[:MAX_QUESTIONS_PER_PERSONA]


def _parse_questions(data: dict, persona: str) -> list[Question]:
    out: list[Question] = []
    for q in data.get("questions") or []:
        text = (q.get("text") or "").strip()
        if not text:
            continue
        track = q.get("track") if q.get("track") in ("A", "B") else "A"
        harm_modes = [h for h in (q.get("harm_modes") or []) if h in HARM_MODES]
        out.append(
            Question(
                persona=persona,
                track=track,
                text=text,
                language=q.get("language") if q.get("language") in ("sv", "en") else "sv",
                decision_criterion=(q.get("decision_criterion") or "").strip(),
                harm_modes=harm_modes,
                type=q.get("type") if q.get("type") in ("direct", "comparative", "open") else "open",
            )
        )
    return out


def _generation_prompt(
    persona: str, context: Context, competitors: list[str], homonyms: list[str]
) -> str:
    company = context.company_name
    expert = _PERSONA_EXPERT[persona].format(company=company)
    few_shots = _FEW_SHOTS[persona].format(
        company=company,
        competitor=(competitors[0] if competitors else "en konkurrent"),
        use_case="ert huvudsakliga behov",
        category="kategorin",
        market="marknaden",
        industry="branschen",
        role="nyckelrollen",
        homonym=(homonyms[0] if homonyms else "ett snarlikt bolag"),
    )
    competitor_line = ", ".join(competitors) if competitors else "(inga angivna — härled själv)"
    homonym_line = "; ".join(homonyms) if homonyms else "(inga kända)"
    return f"""# Roll
Du är en {expert}. Du tänker självständigt, kritiskt och obekvämt — som någon vars
affär/karriär/kapital står på spel. Du nöjer dig inte med ytliga frågor.

# Kontext om bolaget (ur kunskapsgrafen)
{context.profile}

# Konkurrenshintar (svaga ledtrådar — övervikta INTE, härled själv landskapet)
{competitor_line}

# Möjliga förväxlingar (för disambiguering, ur GLEIF)
{homonym_line}

# Beslutskriterier att täcka
{_PERSONA_CRITERIA[persona]}

# Uppgift (två steg — redovisa steg 1 i "analysis")
1. ANALYS: Vad behöver en skarp {persona} egentligen veta före beslutet? Lista
   kriterierna OCH de obekväma farhågorna (red flags, alternativ, stabilitet,
   ägande/förväxling, rykte).
2. FRÅGOR: Härled frågorna i BÅDA spåren:
   - Spår A (om {company}): företagsspecifika risk-/screeningfrågor.
   - Spår B (om branschen): kategori-/behovsfrågor där {company} bör surfa.

# Regler
- Naturligt formulerade, i personans egen röst — ALDRIG ledande.
- Täck riskytan brett: #1 förväxling, #2 inaktuellt negativ, #3 hallucinerat negativ,
  #4 konkurrentförskjutning, #5 skadlig tystnad, #6 negativ inramning.
- Blanda direkta, jämförande och öppna frågor; variera registret (även korta/trubbiga).
- Realistiska för kategorin. Hitta ALDRIG på specifika fakta.
- Generera på både svenska och engelska.

# Exempel på önskad nivå (härma spännvidden, inte ordagrant)
{few_shots}

# Output (ENDAST JSON)
{{"analysis":"...","questions":[{{"text":"...","language":"sv|en","track":"A|B",
"decision_criterion":"...","harm_modes":["#1".."#6"],"type":"direct|comparative|open"}}]}}"""


# --- Skadeklassning -----------------------------------------------------------

_CLASSIFY_SYSTEM = """Du bedömer om en AI-motors svar om ett företag skulle SKADA ett
beslut för en {persona}. Du får företagets verifierade fakta (FACIT), frågan och svaret.

Klassa svaret mot EN skademodell, eller "ok" om det inte skadar:
#1 förväxling — blandar ihop bolaget med ett annat (ofta snarlikt namn).
#2 inaktuellt negativ — gammalt varsel/tvist återgivet som nutid.
#3 hallucinerat/okällat negativ — påstår en risk utan grund eller mot FACIT.
#4 konkurrentförskjutning — lyfter konkurrenter, utelämnar bolaget (särskilt spår B).
#5 skadlig tystnad — vet för lite / utelämnar bolaget där det borde nämnas.
#6 negativ inramning — tekniskt sant men nedåtvinklat.

Var konservativ: hellre "ok" än falskt larm. Flagga #2/#3 bara om det motsäger FACIT
eller saknar stöd. Returnera ENDAST JSON:
{{"harm":"#1|#2|#3|#4|#5|#6|ok","severity":"high|medium|low",
"sourcing":"cites_customer|web|none","evidence":"kort citat ur svaret"}}"""


def classify(llm, question: Question, answer: str, context: Context) -> RiskFinding | None:
    system = _CLASSIFY_SYSTEM.format(persona=question.persona)
    user = (
        f"FACIT:\n{context.facit}\n\n"
        f"PERSONA: {question.persona} (spår {question.track})\n"
        f"FRÅGA: {question.text}\n\nSVAR:\n{answer[:4000]}"
    )
    data = llm_factory.invoke_json(llm, system, user)
    if not data:
        return None
    harm = data.get("harm")
    if harm == "ok":
        return RiskFinding(question.persona, question.track, question.text, "", "ok", "", "", "")
    if harm not in HARM_MODES:
        return None
    severity = data.get("severity") if data.get("severity") in ("high", "medium", "low") else "medium"
    sourcing = data.get("sourcing") if data.get("sourcing") in ("cites_customer", "web", "none") else "none"
    return RiskFinding(
        persona=question.persona,
        track=question.track,
        question=question.text,
        engine="",
        harm=harm,
        severity=severity,
        sourcing=sourcing,
        engine_excerpt=(data.get("evidence") or "").strip()[:500],
    )


# --- Persistens ---------------------------------------------------------------


def _persist(client_id: str, f: RiskFinding) -> None:
    fid = hashlib.sha1(f"{f.persona}|{f.question}|{f.engine}".encode("utf-8")).hexdigest()[:16]
    fs.risk_finding_doc(client_id, fid).set(
        {
            "persona": f.persona,
            "track": f.track,
            "question": f.question,
            "engine": f.engine,
            "harm": f.harm,
            "severity": f.severity,
            "sourcing": f.sourcing,
            "engine_excerpt": f.engine_excerpt,
            "status": "open",
            "needs_review": True,
            "detected_at": firestore.SERVER_TIMESTAMP,
        }
    )


# --- Motoranrop (samma mönster som services/polling.py) -----------------------


def _build_engines() -> dict[str, Any]:
    from config import settings

    engines: dict[str, Any] = {}
    if settings.openai_api_key:
        from langchain_openai import ChatOpenAI

        engines["gpt-4o"] = ChatOpenAI(api_key=settings.openai_api_key, model="gpt-4o", temperature=0, timeout=60)
    if settings.gemini_api_key:
        from langchain_google_genai import ChatGoogleGenerativeAI

        engines["gemini-1.5-pro"] = ChatGoogleGenerativeAI(
            google_api_key=settings.gemini_api_key, model="gemini-1.5-pro", temperature=0, timeout=60
        )
    return engines


def _ask(question: str, llm: Any) -> str:
    from langchain_core.messages import HumanMessage, SystemMessage

    try:
        resp = llm.invoke(
            [
                SystemMessage(content="Svara hjälpsamt och konkret, som till en användare."),
                HumanMessage(content=question),
            ]
        )
    except Exception as exc:
        log.warning("motoranrop misslyckades: %s", exc)
        return ""
    return (resp.content or "").strip() if hasattr(resp, "content") else str(resp).strip()
