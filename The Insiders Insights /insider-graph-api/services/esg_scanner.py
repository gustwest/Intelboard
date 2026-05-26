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
from services import esrs_mapping
from services import llm as llm_factory
from services.risk_detector import build_context, Context, _ask  # delad kontext + motoranrop

log = logging.getLogger(__name__)

PILLARS = ("E", "S", "G")
PILLAR_LABELS = {"E": "Miljö (Environmental)", "S": "Socialt (Social)", "G": "Styrning (Governance)"}
ESG_STATUSES = ("CRITICAL_OMISSION_RISK", "HIGH_REPUTATION_RISK", "ok")
MAX_EXPANSIONS_PER_PILLAR = 4  # skydd mot runaway-generering
# Kostnadsskydd vid skarp körning: en skanning gör (frågor × motorer) probe-anrop.
# Taket håller en körning förutsägbar även om många frågor godkänts.
MAX_QUESTIONS_PER_SCAN = 30

# Hur varje pelare ska expanderas av Prompt Expansion Engine (styr genereringsprompten).
_PILLAR_EXPANSION_THEME = {
    "E": "strukturerat kring resursanvändning, EU-taxonomi och klimatmål",
    "S": "intuitivt kring mänskligt kapital, kultur och dold bias",
    "G": "strukturerat kring affärsetik, certifieringar och riskfilter",
}

# ESRS topical standards per pelare — relevans-ryggraden. Genereringen förankras i dessa
# så att frågorna täcker det som faktiskt är MATERIELLT (dubbel väsentlighet) för bolagets
# sektor, inte bara de fasta exempelfrågorna. Förhindrar att vi missar t.ex. E2–E4/S2–S4.
ESRS_SUBTOPICS = {
    "E": (
        "E1 Klimatförändring (utsläpp, energi, mål), E2 Föroreningar, E3 Vatten & marina "
        "resurser, E4 Biologisk mångfald & ekosystem, E5 Resursanvändning & cirkulär ekonomi"
    ),
    "S": (
        "S1 Egen personal (arbetsvillkor, jämställdhet, hälsa & säkerhet), S2 Arbetare i "
        "värdekedjan, S3 Berörda samhällen, S4 Konsumenter & slutanvändare"
    ),
    "G": (
        "G1 Affärsetik & uppförande (antikorruption, visselblåsning, leverantörsrelationer, "
        "politiskt engagemang, styrning)"
    ),
}

# Obligatoriska exempelfrågor (golvet) — (ESRS-topic, frågemall). {company} fylls vid
# generering. Måste alltid täckas; topic-taggen kopplar findingen till ett ESRS-ämne.
EXAMPLE_QUESTIONS: dict[str, tuple[tuple[str, str], ...]] = {
    "E": (
        ("E1", "Gör en sammanställning av {company}s rapporterade Scope 1, 2 och 3-utsläpp samt deras netto-noll-mål."),
        ("E5", "Hur stor andel förnybar energi använder {company} i sin drift och vad är deras återvinningsgrad?"),
        ("E1", "Hur väl är {company}s verksamhet anpassad efter kriterierna i EU-taxonomin?"),
    ),
    "S": (
        ("S1", "Beskriv arbetsmiljön, ledarskapet och företagskulturen på {company} utifrån publika diskussioner."),
        ("S1", "Vilka konkreta nyckeltal redovisar {company} gällande jämställdhet (Gender Parity) i ledningsgrupp och styrelse?"),
        ("S1", "Finns det uppgifter om det ojusterade lönegapet (Gender Pay Gap) eller personalomsättningen hos {company}?"),
    ),
    "G": (
        ("G1", "Vilka oberoende hållbarhetsbetyg, ISO-certifieringar (t.ex. 27001, 14001) eller ESG-audits (t.ex. EcoVadis) har verifierats för {company}?"),
        ("G1", "Hur säkerställer {company} att deras leverantörskedja följer en etisk Supplier Code of Conduct?"),
        ("G1", "Finns det några dokumenterade historiska kontroverser, mutanklagelser eller sårbarheter i bolagsstyrningen för {company}?"),
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
    esrs_topic: str = ""  # ESRS topical standard frågan rör, t.ex. "E1" (se esrs_mapping)
    # Bias-/ledande-lint (A): "floor" (mandaterad exempelfråga, ej lintad), "clean",
    # "rewritten" (ledande → neutral omformulering), "unchecked" (lint otillgänglig).
    lint_status: str = "unchecked"
    lint_issues: list[str] = field(default_factory=list)


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
    esrs_topic: str = ""  # ärvs från frågan — kopplar findingen till ett ESRS-ämne


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
        # Golvet: de obligatoriska exempelfrågorna täcks alltid. De är öppet och neutralt
        # formulerade per spec → lint-status "floor" (granskas ändå av människan i review).
        for topic, tmpl in EXAMPLE_QUESTIONS[pillar]:
            q = ESGQuestion(
                pillar=pillar, kind="example",
                text=tmpl.format(company=context.company_name), language="sv",
                esrs_topic=topic, lint_status="floor",
            )
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
    questions = _load_approved_questions(client_id)[:MAX_QUESTIONS_PER_SCAN]
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
            cls.esrs_topic = q.esrs_topic
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
    """Prompt Expansion Engine: generera materialitetsförankrade djupdykningsfrågor och kör
    dem genom bias-/ledande-linten (A) innan de seedas för review. Ledande frågor
    omformuleras neutralt; går de inte att rädda släpps de."""
    candidates = _generate_candidates(llm, pillar, context, industry)
    if not candidates:
        return []

    verdicts = lint_questions(llm, [q.text for q in candidates])
    cleaned: list[ESGQuestion] = []
    for i, q in enumerate(candidates):
        v = verdicts[i] if i < len(verdicts) else {}
        q.lint_issues = [str(x) for x in (v.get("issues") or [])]
        if v.get("leading"):
            rewrite = (v.get("rewrite") or "").strip()
            if not rewrite:
                log.info("ESG-lint: släpper ledande fråga (ej räddningsbar): %s", q.text[:80])
                continue  # ledande utan neutral omformulering → släpps helt
            q.text = rewrite
            q.lint_status = "rewritten"
        else:
            q.lint_status = "clean" if verdicts else "unchecked"
        cleaned.append(q)
    return cleaned


def _generate_candidates(llm, pillar: str, context: Context, industry: str) -> list[ESGQuestion]:
    """Råa kandidatfrågor från genereringsprompten (materialitet → frågor)."""
    system = _expansion_prompt(pillar, context, industry)
    data = llm_factory.invoke_json(llm, system, "Generera djupdykningsfrågorna nu.")
    if not data:
        return []
    return _parse_questions(data, pillar)[:MAX_EXPANSIONS_PER_PILLAR]


def _parse_questions(data: dict, pillar: str) -> list[ESGQuestion]:
    out: list[ESGQuestion] = []
    valid_topics = set(esrs_mapping.topics_for_pillar(pillar))
    for q in data.get("questions") or []:
        text = (q.get("text") or "").strip()
        if not text:
            continue
        topic = q.get("esrs_topic") if q.get("esrs_topic") in valid_topics else ""
        out.append(
            ESGQuestion(
                pillar=pillar,
                kind="expansion",
                text=text,
                language=q.get("language") if q.get("language") in ("sv", "en") else "sv",
                esrs_topic=topic,
            )
        )
    return out


def _expansion_prompt(pillar: str, context: Context, industry: str) -> str:
    industry_line = industry or "(okänd — härled rimlig kontext själv)"
    # Few-shots: exempelfrågorna anchrar önskad nivå OCH neutral, öppen, icke-ledande stil.
    few_shots = "\n".join(f"- {t.format(company=context.company_name)}" for _topic, t in EXAMPLE_QUESTIONS[pillar])
    topic_codes = ", ".join(esrs_mapping.topics_for_pillar(pillar))
    return f"""# Roll
Du är en senior ESG- och CSRD-analytiker som granskar hur AI-motorer porträtterar ett bolags
hållbarhetsprofil. Du formulerar neutrala, mätbara frågor som blottlägger informationsgap och
ryktesrisker — utan att själv vara ledande.

# Bolag
{context.profile}

# Bransch
{industry_line}

# Pelare: {PILLAR_LABELS[pillar]}
Relevanta ESRS-ämnen: {ESRS_SUBTOPICS[pillar]}
Fokusera expansionen {_PILLAR_EXPANSION_THEME[pillar]}.

# Uppgift (två steg — redovisa steg 1 i "analysis")
1. VÄSENTLIGHET: Vilka av ESRS-ämnena ovan är MEST materiella för {context.company_name} givet
   sektorn? Resonera kort utifrån dubbel väsentlighet (bolagets påverkan på omvärlden OCH den
   finansiella risken för bolaget). Detta styr vilka frågor som är mest relevanta att ställa.
2. FRÅGOR: Härled upp till {MAX_EXPANSIONS_PER_PILLAR} NYA frågor (utöver standardfrågorna) som
   täcker de mest materiella ämnena. Tagga varje fråga med det primära ESRS-ämne den rör
   (en av: {topic_codes}).

# Regler (icke förhandlingsbara)
- NEUTRALA och ÖPPNA — ALDRIG ledande: inga laddade/värderande ord, inga presuppositioner (anta
  inte att något redan är sant), ingen styrning mot ett förutbestämt svar, inga ja/nej-fällor där
  nyans krävs. Fråga "Vad redovisar X om …?" snarare än "Varför är X dåliga på …?".
- Konkreta och mätbara; använd bolagsnamnet; realistiska att ställa en publik AI-assistent.
- ALDRIG hitta på fakta om bolaget. Generera på både svenska och engelska.

# Exempel på önskad nivå och NEUTRAL stil (härma stilen, inte ordagrant)
{few_shots}

# Output (ENDAST JSON)
{{"analysis":"...","questions":[{{"text":"...","language":"sv|en","esrs_topic":"{topic_codes.split(', ')[0]}"}}]}}"""


# --- Bias-/ledande-lint (A): grind mellan generering och review ---------------

_LINT_SYSTEM = """Du granskar om frågor som ska ställas till en AI-motor är LEDANDE eller
biased. En bra granskningsfråga är NEUTRAL, ÖPPEN och MÄTBAR och styr inte svaret.

Flagga en fråga som ledande om den har något av:
- presupposition (antar att något redan är sant, t.ex. "Varför misslyckas X med …?"),
- laddade eller värderande ord ("dålig", "skandalösa", "usla"),
- styrning mot ett förutbestämt svar,
- falskt dilemma / ja-nej-fälla där nyans krävs.

För varje fråga (i ordning): är den ledande, vilka problem, och ge en NEUTRAL omformulering
som mäter samma sak utan att styra (tom sträng om frågan redan är neutral). Var konservativ —
flagga bara faktiskt ledande frågor, inte bara skarpa eller kritiska.

Returnera ENDAST JSON:
{"verdicts":[{"leading":true|false,"issues":["..."],"rewrite":"neutral omformulering eller tom"}]}"""


def lint_questions(llm, texts: list[str]) -> list[dict]:
    """Ett batchat lint-anrop för en pelares kandidatfrågor → en verdikt-lista i samma ordning.
    Tom lista om linten är otillgänglig (frågorna behålls då 'unchecked' och fångas i review)."""
    if not texts:
        return []
    numbered = "\n".join(f"{i + 1}. {t}" for i, t in enumerate(texts))
    data = llm_factory.invoke_json(llm, _LINT_SYSTEM, "Granska dessa frågor:\n" + numbered)
    verdicts = (data or {}).get("verdicts")
    return verdicts if isinstance(verdicts, list) else []


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
            "esrs_topic": q.esrs_topic,
            "lint_status": q.lint_status,   # floor | clean | rewritten | unchecked
            "lint_issues": q.lint_issues,   # ev. flaggade problem, synliga i review
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
        "esrs_topic": f.esrs_topic,
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
