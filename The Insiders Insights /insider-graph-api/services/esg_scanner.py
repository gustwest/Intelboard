"""Riskloopens ESG-spår, skiva 1 — blind ESG/CSRD-nollmätning + skadeklassning.

Samma form som services/risk_detector.py (GEO-riskloopen), men mätobjektet är ett
bolags HÅLLBARHETSRYKTE i AI-motorer, uppdelat på de tre ESRS-pelarna E/S/G. Flödet:

  Generering (generate_and_store_esg_questions):
  1. Bygg kontext ur kunskapsgrafen (återanvänder risk_detector.build_context).
  2. Cache per kontext-hash — regenereras inte varje körning (krävs för trend).
  3. Prompt Expansion Engine: för varje pelare seedas de OBLIGATORISKA exempelfrågorna
     (golvet, kind="example") och en validator-LLM (claude-opus via Vertex EU) genererar
     strukturerade/intuitiva djupdykningar (kind="expansion") utifrån branschkontext.
     Allt persisteras i clients/{id}/esg_questions som needs_review (review-grind).

  Detektering (run_esg_scan):
  4. Ställ de GODKÄNDA frågorna blint till probe-motorerna (gpt-4o + gemini, första-parts
     — publik payload: bolagsnamn + generisk fråga, precis som GEO-riskloopen).
  5. Klassa varje svar (validator) mot ESG-skademodellen:
       CRITICAL_OMISSION_RISK — informationsgap/omission (saknad bolagsspecifik data,
                                branschschabloner istället för bolagsdata).
       HIGH_REPUTATION_RISK   — föråldrad negativ data eller stereotyp/negativ inramning.
       ok                     — korrekt och rättvis bild.
  6. Persistera findings (status != ok) i clients/{id}/esg_findings, needs_review, samt
     körningens denominator i esg_runs/latest. AI ESG Risk Score byggs i services/esg_report.

Read-only: korrigering sker i ingestion-flödet (services/esg_ingestion.py, "Borde svaret
varit annorlunda?"). EU-only: full kunddata behandlas av validatorn via Vertex AI EU;
probe-motorerna är avsiktligt första-parts (publik payload). Se services/llm.py.
"""
from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass, field
from typing import Any

from google.cloud import firestore

import firestore_client as fs
from services import llm as llm_factory
from services.risk_detector import build_context, Context, _ask  # delad kontext + motoranrop

log = logging.getLogger(__name__)

PILLARS = ("E", "S", "G")
PILLAR_LABELS = {"E": "Miljö (Environmental)", "S": "Socialt (Social)", "G": "Styrning (Governance)"}
ESG_STATUSES = ("CRITICAL_OMISSION_RISK", "HIGH_REPUTATION_RISK", "ok")
MAX_EXPANSIONS_PER_PILLAR = 4  # skydd mot runaway-generering

# Hur varje pelare ska expanderas av Prompt Expansion Engine (styr genereringsprompten).
_PILLAR_EXPANSION_THEME = {
    "E": "strukturerat kring resursanvändning, EU-taxonomi och klimatmål",
    "S": "intuitivt kring mänskligt kapital, kultur och dold bias",
    "G": "strukturerat kring affärsetik, certifieringar och riskfilter",
}

# Obligatoriska exempelfrågor (golvet). {company} fylls vid generering. Måste alltid täckas.
EXAMPLE_QUESTIONS: dict[str, tuple[str, ...]] = {
    "E": (
        "Gör en sammanställning av {company}s rapporterade Scope 1, 2 och 3-utsläpp samt deras netto-noll-mål.",
        "Hur stor andel förnybar energi använder {company} i sin drift och vad är deras återvinningsgrad?",
        "Hur väl är {company}s verksamhet anpassad efter kriterierna i EU-taxonomin?",
    ),
    "S": (
        "Beskriv arbetsmiljön, ledarskapet och företagskulturen på {company} utifrån publika diskussioner.",
        "Vilka konkreta nyckeltal redovisar {company} gällande jämställdhet (Gender Parity) i ledningsgrupp och styrelse?",
        "Finns det uppgifter om det ojusterade lönegapet (Gender Pay Gap) eller personalomsättningen hos {company}?",
    ),
    "G": (
        "Vilka oberoende hållbarhetsbetyg, ISO-certifieringar (t.ex. 27001, 14001) eller ESG-audits (t.ex. EcoVadis) har verifierats för {company}?",
        "Hur säkerställer {company} att deras leverantörskedja följer en etisk Supplier Code of Conduct?",
        "Finns det några dokumenterade historiska kontroverser, mutanklagelser eller sårbarheter i bolagsstyrningen för {company}?",
    ),
}

_SEVERITY_RANK = {"high": 3, "medium": 2, "low": 1}


# --- Datamodell ---------------------------------------------------------------


@dataclass
class ESGQuestion:
    pillar: str          # "E" | "S" | "G"
    kind: str            # "example" (golvet) | "expansion" (LLM-genererad djupdykning)
    text: str
    language: str        # "sv" | "en"


@dataclass
class ESGFinding:
    pillar: str
    question: str
    engine: str
    status: str          # CRITICAL_OMISSION_RISK | HIGH_REPUTATION_RISK | ok
    severity: str        # high | medium | low (tom för ok)
    sentiment: str       # negative | neutral | positive
    engine_excerpt: str  # kort citat ur svaret (evidens)
    answer_excerpt: str = ""  # längre utdrag — frontend visar det blinda svaret


@dataclass
class ESGScanResult:
    client_id: str
    questions_asked: int
    findings: list[ESGFinding]


# --- Orkestrering -------------------------------------------------------------


def generate_and_store_esg_questions(client_id: str) -> dict | None:
    """Seeda exempelfrågor + generera ESG-djupdykningar (needs_review). Cachas per
    kontext-hash. No-op utan validator-LLM."""
    snap = fs.client_doc(client_id).get()
    if not snap.exists:
        log.warning("ESG-loop: klient %s saknas", client_id)
        return None
    client = snap.to_dict() or {}

    validator = llm_factory.make_validator()
    if validator is None:
        log.warning("ESG-loop: ingen validator-LLM — hoppar över generering %s", client_id)
        return None

    context = build_context(client_id, client)
    ctx_hash = _context_hash(context)
    cached = [
        qid
        for qid, q in fs.iter_esg_questions(client_id)
        if q.get("context_hash") == ctx_hash and q.get("status") != "rejected"
    ]
    if cached:
        log.info("ESG-loop %s: cache-träff (%d frågor) — regenererar inte", client_id, len(cached))
        return {"client_id": client_id, "generated": 0, "cached": len(cached)}

    industry = _industry_hint(client)
    written = 0
    for pillar in PILLARS:
        # Golvet: de obligatoriska exempelfrågorna täcks alltid.
        for tmpl in EXAMPLE_QUESTIONS[pillar]:
            q = ESGQuestion(pillar=pillar, kind="example", text=tmpl.format(company=context.company_name), language="sv")
            _persist_question(client_id, q, ctx_hash)
            written += 1
        # Prompt Expansion Engine: branschanpassade djupdykningar.
        for q in generate_expansions(validator, pillar, context, industry):
            _persist_question(client_id, q, ctx_hash)
            written += 1

    log.info("ESG-loop %s: genererade %d frågor (väntar på review)", client_id, written)
    return {"client_id": client_id, "generated": written, "cached": 0}


def run_esg_scan(client_id: str) -> ESGScanResult | None:
    """Ställ de GODKÄNDA ESG-frågorna blint till motorerna och klassa svaren. Frågor som
    inte granskats körs aldrig skarpt — kör generering + review först."""
    snap = fs.client_doc(client_id).get()
    if not snap.exists:
        log.warning("ESG-loop: klient %s saknas", client_id)
        return None
    client = snap.to_dict() or {}

    validator = llm_factory.make_validator()
    engines = _build_engines()
    if validator is None or not engines:
        log.warning("ESG-loop: ingen LLM konfigurerad — hoppar över %s", client_id)
        return None

    context = build_context(client_id, client)
    questions = _load_approved_questions(client_id)
    if not questions:
        log.info("ESG-loop %s: inga godkända frågor — generera + granska först", client_id)
        return ESGScanResult(client_id, 0, [])

    findings: list[ESGFinding] = []
    answers_by_pillar: dict[str, int] = {p: 0 for p in PILLARS}
    for q in questions:
        for engine_name, engine in engines.items():
            answer = _ask(q.text, engine)
            if not answer:
                continue
            cls = classify_esg(validator, q, answer, context)
            if cls is None:
                continue
            answers_by_pillar[q.pillar] = answers_by_pillar.get(q.pillar, 0) + 1
            if cls.status == "ok":
                continue
            cls.pillar, cls.question, cls.engine = q.pillar, q.text, engine_name
            cls.answer_excerpt = answer.strip()[:1500]
            _persist(client_id, cls)
            findings.append(cls)

    _persist_run_summary(client_id, answers_by_pillar, len(findings))
    log.info("ESG-loop %s: %d frågor → %d findings", client_id, len(questions), len(findings))
    return ESGScanResult(client_id, len(questions), findings)


def _persist_run_summary(client_id: str, answers_by_pillar: dict[str, int], findings_count: int) -> None:
    """Körningens totaler — AI ESG Risk Score (services/esg_report) använder dem som
    denominator per pelare."""
    fs.esg_run_summary_doc(client_id).set(
        {
            "answers_by_pillar": answers_by_pillar,
            "total_answers": sum(answers_by_pillar.values()),
            "findings_count": findings_count,
            "ran_at": firestore.SERVER_TIMESTAMP,
        }
    )


def _load_approved_questions(client_id: str) -> list[ESGQuestion]:
    out: list[ESGQuestion] = []
    for _qid, q in fs.iter_esg_questions(client_id):
        if q.get("status") != "approved" or not q.get("text"):
            continue
        out.append(
            ESGQuestion(
                pillar=q.get("pillar") if q.get("pillar") in PILLARS else "G",
                kind=q.get("kind") if q.get("kind") in ("example", "expansion") else "expansion",
                text=q["text"],
                language=q.get("language") if q.get("language") in ("sv", "en") else "sv",
            )
        )
    return out


def _context_hash(context: Context) -> str:
    return hashlib.sha1(f"esg\n{context.company_name}\n{context.profile}".encode("utf-8")).hexdigest()[:16]


def _industry_hint(client: dict) -> str:
    for key in ("industry", "category", "market"):
        if client.get(key):
            return str(client[key])
    return ""


# --- Prompt Expansion Engine --------------------------------------------------


def generate_expansions(llm, pillar: str, context: Context, industry: str) -> list[ESGQuestion]:
    """LLM-metaklassen genererar branschanpassade djupdykningsfrågor för en pelare."""
    system = _expansion_prompt(pillar, context, industry)
    data = llm_factory.invoke_json(llm, system, "Generera djupdykningsfrågorna nu.")
    if not data:
        return []
    return _parse_questions(data, pillar)[:MAX_EXPANSIONS_PER_PILLAR]


def _parse_questions(data: dict, pillar: str) -> list[ESGQuestion]:
    out: list[ESGQuestion] = []
    for q in data.get("questions") or []:
        text = (q.get("text") or "").strip()
        if not text:
            continue
        out.append(
            ESGQuestion(
                pillar=pillar,
                kind="expansion",
                text=text,
                language=q.get("language") if q.get("language") in ("sv", "en") else "sv",
            )
        )
    return out


def _expansion_prompt(pillar: str, context: Context, industry: str) -> str:
    industry_line = industry or "(okänd — härled rimlig kontext själv)"
    return f"""# Roll
Du är en senior ESG- och CSRD-analytiker som granskar hur AI-motorer porträtterar ett bolags
hållbarhetsprofil. Du formulerar skarpa, mätbara frågor som blottlägger informationsgap och
ryktesrisker.

# Bolag
{context.profile}

# Bransch
{industry_line}

# Pelare att expandera
{PILLAR_LABELS[pillar]} — expandera {_PILLAR_EXPANSION_THEME[pillar]}.

# Uppgift
Generera upp till {MAX_EXPANSIONS_PER_PILLAR} NYA branschanpassade djupdykningsfrågor om
{context.company_name} (utöver standardfrågorna), i den här pelaren. Frågorna ska:
- vara konkreta och mätbara, i en kritisk granskares röst — ALDRIG ledande,
- använda bolagsnamnet, och vara realistiska att ställa en publik AI-assistent,
- ALDRIG hitta på fakta om bolaget.
Generera på både svenska och engelska.

# Output (ENDAST JSON)
{{"questions":[{{"text":"...","language":"sv|en"}}]}}"""


# --- Skadeklassning (ESG-omission + reputationsrisk) --------------------------

_CLASSIFY_SYSTEM = """Du bedömer en AI-motors blinda svar om ett företags HÅLLBARHET (ESG/CSRD)
i pelaren {pillar_label}. Du får företagets verifierade fakta (FACIT), frågan och svaret.

Klassa svaret mot EN av:
CRITICAL_OMISSION_RISK — informationsgap/omission: svaret saknar bolagsspecifik data och
  signalerar det (t.ex. "inga specifika siffror anges", "det saknas offentlig information",
  "inga verifierade uppgifter"), ELLER motorn faller tillbaka på branschschabloner/branschsnitt
  i stället för bolagsspecifik data. Detta är en akut affärsrisk: bolaget är osynligt.
HIGH_REPUTATION_RISK — svaret målar en negativ/orättvis bild: återanvänder FÖRÅLDRAD negativ
  data (gammal nyhet/varsel/tvist återgiven som nutid), eller bygger på stereotyper/negativ
  inramning som motsäger eller saknar stöd i FACIT.
ok — svaret ger en korrekt, rättvis och rimligt konkret bild.

Var konservativ: hellre "ok" än falskt larm. Bedöm även sentimentet i svaret.
Returnera ENDAST JSON:
{{"status":"CRITICAL_OMISSION_RISK|HIGH_REPUTATION_RISK|ok","severity":"high|medium|low",
"sentiment":"negative|neutral|positive","evidence":"kort citat ur svaret"}}"""


def classify_esg(llm, question: ESGQuestion, answer: str, context: Context) -> ESGFinding | None:
    system = _CLASSIFY_SYSTEM.format(pillar_label=PILLAR_LABELS.get(question.pillar, question.pillar))
    user = (
        f"FACIT:\n{context.facit}\n\n"
        f"PELARE: {PILLAR_LABELS.get(question.pillar, question.pillar)}\n"
        f"FRÅGA: {question.text}\n\nSVAR:\n{answer[:4000]}"
    )
    data = llm_factory.invoke_json(llm, system, user)
    if not data:
        return None
    status = data.get("status")
    sentiment = data.get("sentiment") if data.get("sentiment") in ("negative", "neutral", "positive") else "neutral"
    if status == "ok":
        return ESGFinding(question.pillar, question.text, "", "ok", "", sentiment, "")
    if status not in ("CRITICAL_OMISSION_RISK", "HIGH_REPUTATION_RISK"):
        return None
    severity = data.get("severity") if data.get("severity") in ("high", "medium", "low") else "medium"
    return ESGFinding(
        pillar=question.pillar,
        question=question.text,
        engine="",
        status=status,
        severity=severity,
        sentiment=sentiment,
        engine_excerpt=(data.get("evidence") or "").strip()[:500],
    )


# --- Motoranrop (delad EU-routad probe-factory, se services/llm.py) -----------


def _build_engines() -> dict[str, Any]:
    return llm_factory.make_probe_engines()


# --- Persistens ---------------------------------------------------------------


def _persist_question(client_id: str, q: ESGQuestion, ctx_hash: str) -> None:
    # Deterministiskt id ur (pillar|kind|text) → stabilt mellan körningar (trend).
    qid = "esgq-" + hashlib.sha1(f"{q.pillar}|{q.kind}|{q.text}".encode("utf-8")).hexdigest()[:16]
    fs.esg_question_doc(client_id, qid).set(
        {
            "pillar": q.pillar,
            "kind": q.kind,
            "text": q.text,
            "language": q.language,
            "status": "open",
            "needs_review": True,
            "context_hash": ctx_hash,
            "generated_at": firestore.SERVER_TIMESTAMP,
        }
    )


def _finding_id(pillar: str, question: str, engine: str) -> str:
    return hashlib.sha1(f"{pillar}|{question}|{engine}".encode("utf-8")).hexdigest()[:16]


def _persist(client_id: str, f: ESGFinding) -> None:
    ref = fs.esg_finding_doc(client_id, _finding_id(f.pillar, f.question, f.engine))
    snap = ref.get()
    fields = {
        "pillar": f.pillar,
        "question": f.question,
        "engine": f.engine,
        "status": f.status,
        "severity": f.severity,
        "sentiment": f.sentiment,
        "engine_excerpt": f.engine_excerpt,
        "answer_excerpt": f.answer_excerpt,
        "detected_at": firestore.SERVER_TIMESTAMP,
    }
    if not snap.exists:
        ref.set({**fields, "review_status": "open", "needs_review": True})
        return
    # Behåll 'actioned' (kunden har redan matat in data); annars (åter)öppna.
    if (snap.to_dict() or {}).get("review_status") == "actioned":
        ref.update(fields)
    else:
        ref.update({**fields, "review_status": "open", "needs_review": True})
