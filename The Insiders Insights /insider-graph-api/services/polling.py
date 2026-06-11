"""Polling-agent — mäter AI-synlighet veckovis.

För varje kund:
  1. Hämta frågor (per kategori) — kundspecifika eller default.
  2. Skicka till GPT-4o och Gemini parallellt.
  3. Räkna Share of Voice (andel svar där kunden nämns).
  4. För svar med omnämnande: be en LLM-domare bedöma sentiment.
  5. Parity Index v2: sannolikhetsvägd andel kvinnor bland personer motorerna
     själva namnger (öppen person-NER på Vertex EU + SCB-namnestimering, se
     docs/parity-index-spec.md), jämfört mot kundens ledningsbaseline → gap.
  6. Skriv till clients/{id}/polling_results/{YYYY-Www}.

Utan OPENAI_API_KEY / GEMINI_API_KEY hoppas modellerna över — körningen
slutförs men markeras `skipped`.
"""
from __future__ import annotations

import contextvars
import hashlib
import json
import logging
import os
import re
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, TypeVar

from google.cloud import firestore
from langchain_core.messages import HumanMessage, SystemMessage

import firestore_client as fs
from config import settings
from services import llm as llm_factory
from services import model_registry
from services import name_gender
from services import probe_guard

# Konkurrent-extraktion via judge-LLM (gemini). Kan stängas av om gRPC-klienten hänger
# i prod — fältet category_competitors blir tomt men polling-jobbet fortsätter.
POLLING_EXTRACT_ORGS = os.environ.get("POLLING_EXTRACT_ORGS", "1") not in ("0", "false", "False", "")
# Person-NER för Parity Index v2. Körs på Vertex EU-motorn (generator), ALDRIG på
# judge/probe-motorerna — svarstexten kan innehålla personnamn (personuppgift) och
# får inte efterbehandlas utanför EU/EES (DPA §6.1, docs/parity-index-spec.md).
POLLING_EXTRACT_PERSONS = os.environ.get("POLLING_EXTRACT_PERSONS", "1") not in ("0", "false", "False", "")
# Per-anrop-timeouter — polling-jobbet får ALDRIG hänga, oavsett LLM-läge. Justera via env.
# 2026-06-03: ORG-timeout höjd 8→20 (Gemini Vertex EU svarar typiskt på 3-4s men 6-8s vid
# cold start, vilket gav timeout-storm i prod), JUDGE-timeout 12→20 av samma skäl.
POLLING_ASK_TIMEOUT_SEC = float(os.environ.get("POLLING_ASK_TIMEOUT_SEC", "30"))
POLLING_JUDGE_TIMEOUT_SEC = float(os.environ.get("POLLING_JUDGE_TIMEOUT_SEC", "20"))
POLLING_ORG_TIMEOUT_SEC = float(os.environ.get("POLLING_ORG_TIMEOUT_SEC", "20"))
POLLING_PERSON_TIMEOUT_SEC = float(os.environ.get("POLLING_PERSON_TIMEOUT_SEC", "20"))

T = TypeVar("T")


def _runs_per_query() -> int:
    """Antal gånger varje (fråga × motor) ställs per körning (P0 — upprepad sampling).

    En enskild körning är ETT slumpdrag ur motorns svarsfördelning (motorn är
    icke-deterministisk även vid temp=0). Share of Voice blir därför en
    mention-RATE över N körningar med ett standardfel, i stället för en brusig
    on/off-mätning. Bara de billiga ask-anropen multipliceras — sentiment och
    org-extraktion körs 1× per (fråga × motor) på ett representativt svar
    (run_idx 0), så cost-taket respekteras (jfr warmth_probes._probe_runs_per_query).

    Default 7 (SE<0.10 på per-motor detektionsrate, docs/api-vs-ui-research).
    Env POLLING_RUNS_PER_QUERY=1 → gammalt n=1-beteende. Clampas till [1, 7]."""
    try:
        n = int(os.getenv("POLLING_RUNS_PER_QUERY", "7"))
    except ValueError:
        return 7
    return max(1, min(7, n))


def sov_change_significance(
    curr_sov: float | None, curr_se: float | None,
    prev_sov: float | None, prev_se: float | None,
    z_crit: float = 1.96,
) -> dict[str, Any]:
    """Är veckans SoV-förändring verklig signal eller run-to-run-brus? (P1 — brusband.)

    Skillnad mellan två andelar: SE_diff = sqrt(se_curr² + se_prev²), z = Δ/SE_diff.
    `significant` är True bara om |z| ≥ z_crit (default 1.96 ≈ 95 %). Cockpiten ska
    grå-tona ▲/▼ när detta är False — annars tolkas brus som rörelse (forskningen:
    enpunktsdeltan är meningslösa utan brusband). Saknas data → significant=False."""
    if curr_sov is None or prev_sov is None:
        return {"delta": None, "significant": False, "z": None}
    delta = curr_sov - prev_sov
    se_diff = ((curr_se or 0.0) ** 2 + (prev_se or 0.0) ** 2) ** 0.5
    if se_diff <= 0:
        # Ingen uppmätt varians (t.ex. historik före P0) → kan inte skilja från brus.
        return {"delta": round(delta, 4), "significant": False, "z": None}
    z = delta / se_diff
    return {"delta": round(delta, 4), "significant": abs(z) >= z_crit, "z": round(z, 2)}


def _proportion_se(successes: int, n: int) -> float:
    """Binomialt standardfel för en andel (mention-rate). 0.0 om n=0.

    SE = sqrt(p(1-p)/n) — den pragmatiska brusuppskattningen för en detektionsrate
    samplad över n oberoende körningar. CI95 ≈ 1.96·SE. Ej en formell hypotesprövning
    mot UI, men ger trenden i cockpiten ett brusband (P1 grindar pilar mot detta)."""
    if n <= 0:
        return 0.0
    p = successes / n
    return (p * (1.0 - p) / n) ** 0.5


def _runtorun_se(answers: list["QuestionAnswer"]) -> float:
    """Prompt-klustrat standardfel för poolad SoV (P1-förfining, kalibrerat 2026-06-07).

    Trenden jämförs vecka-mot-vecka på SAMMA cachade frågor, så den enda bruskällan
    som kan flytta talet spuriöst är run-to-run-variationen INOM varje (fråga × motor)-
    cell — mellan-fråge-heterogeniteten är identisk båda veckorna och tar ut sig. Den
    naiva poolade binomialen (_proportion_se över alla körningar) blandar in den
    heterogeniteten och ÖVERSKATTAR därför bruset; en fråga som aldrig flippar (p=0/1)
    ska bidra med noll brus.

    Korrekt design: cellen = (fråga, motor) med r_c körningar och rate p_c. Poolad
    SoV = Σm_c/Σr_c, så Var(SoV) = Σ_c r_c·p_c(1−p_c) / N²  (N = Σr_c). Celler vid
    extremerna bidrar 0. Detta är (per Jensen) ≤ den naiva binomialen — alltså ett
    tightare, korrekt brusband, så färre verkliga trender felaktigt grå-tonas."""
    cells: dict[tuple[str, str], list["QuestionAnswer"]] = {}
    for a in answers:
        cells.setdefault((a.question, a.model), []).append(a)
    total = len(answers)
    if total <= 0 or not cells:
        return 0.0
    var_sum = 0.0
    for cell in cells.values():
        r = len(cell)
        if r <= 0:
            continue
        p = sum(1 for a in cell if a.mentioned) / r
        var_sum += r * p * (1.0 - p)
    return (var_sum / (total * total)) ** 0.5


def _call_with_timeout(fn: Callable[[], T], timeout: float, default: T, what: str) -> T:
    """Daemon-tråd + join(timeout): vi väntar max `timeout` på fn() och returnerar default
    om den hänger. Tråden fortsätter köra i bakgrunden tills den dör naturligt eller
    containern skalas ner — men polling-jobbet kommer ALDRIG att blockeras.

    Detta är det enda pålitliga mönstret för att skydda mot blockerande IO i Python
    (signal-baserad timeout funkar bara på huvudtråden; futures.result(timeout) friar
    inte upp den underliggande tråden).

    Kopierar anropande trådens context (ContextVars) in i daemon-tråden så att
    services/token_meter:s `_current` + `_current_client_id` följer med — annars
    skulle LLM-anrop som routas hit tappa både token-mätning och budget-enforce."""
    result: list[T] = [default]
    err: list[BaseException | None] = [None]
    ctx = contextvars.copy_context()

    def target() -> None:
        try:
            result[0] = fn()
        except BaseException as exc:  # log + svälj — försök ska aldrig fälla jobbet
            err[0] = exc

    t = threading.Thread(target=ctx.run, args=(target,), daemon=True, name=f"polling-{what}")
    t.start()
    t.join(timeout)
    if t.is_alive():
        log.warning("%s timed out after %ss — using default", what, timeout)
        return default
    if err[0] is not None:
        log.warning("%s failed: %s", what, err[0])
        return default
    return result[0]

log = logging.getLogger(__name__)

DEFAULT_QUESTIONS: dict[str, list[str]] = {
    "affar": [
        "Vilka är de ledande svenska bolagen inom {industry}?",
        "Vilka företag rekommenderar du för {service_area}?",
        "Vilka är experterna att lyssna på inom {topic} i Sverige?",
    ],
    "finans": [
        "Vilka är de bästa investeringsobjekten inom {industry} i Sverige just nu?",
        "Vilka svenska bolag har starkast tillväxt inom {topic}?",
        "Vilka företag inom {industry} är värda att följa ur ett finansiellt perspektiv?",
    ],
    "innovation": [
        "Vilka är pionjärerna inom {topic} i Sverige?",
        "Vilka företag driver utvecklingen inom {industry}?",
        "Vilka svenska startups eller bolag arbetar med {topic}?",
    ],
    "hr": [
        "Vilka är de mest attraktiva arbetsgivarna inom {industry} i Sverige?",
        "Vilka företag erbjuder bäst karriärmöjligheter inom {topic}?",
        "Vilka svenska bolag inom {industry} är kända för stark företagskultur?",
    ],
}

# F2 — Kontrollfrågor (inflations-A/B). De ordinarie battericellerna är ledande-inramade
# ("de *ledande*/*bästa*/*mest attraktiva* …") — superlativ/ranking primar motorn på
# konkurrenslandskapet och kan blåsa upp Share of Voice. Kontrollfrågorna ställer SAMMA
# domän neutralt ("vilka företag *finns*", "berätta om", "beskriv") utan ledande inramning.
# Skillnaden i nämn-frekvens mot batteriet = den del av synligheten som drivs av
# frågekonstruktionen snarare än verklig synlighet. Frågorna mäts varje vecka men poolas
# ALDRIG in i rubrik-SoV:t (skulle bryta trendkontinuiteten) — de lever i en egen kategori
# och jämförs över ≥4 veckor (services/sov_inflation.py). Avsiktligt formulerade så att de
# INTE triggar question_quality:s superlativ-flagga, till skillnad från batteriet.
CONTROL_CATEGORY = "kontroll"
CONTROL_QUESTIONS: list[str] = [
    "Vilka företag finns inom {industry} i Sverige?",
    "Vad kan du berätta om {topic} i Sverige?",
    "Beskriv marknaden för {service_area} i Sverige.",
]

# F4 — engelska frågespår. Citerbarhet är motor- och språkspecifik (GEO-evidensen):
# samma kund kan ge en annan synlighetsbild på engelska. Geografin ("Swedish") behålls
# så att det är SAMMA marknad mätt på ett annat språk. Resultaten taggas med språk och
# medeltalas ALDRIG över språk (samma princip som bas-kunskap vs live-signal). Custom-
# frågor är språkagnostiska (kund-författade) och påverkas inte av språkvalet.
DEFAULT_QUESTIONS_EN: dict[str, list[str]] = {
    "affar": [
        "Which are the leading Swedish companies in {industry}?",
        "Which companies would you recommend for {service_area}?",
        "Who are the experts to follow within {topic} in Sweden?",
    ],
    "finans": [
        "Which are the best investment opportunities in {industry} in Sweden right now?",
        "Which Swedish companies have the strongest growth within {topic}?",
        "Which companies in {industry} are worth following from a financial perspective?",
    ],
    "innovation": [
        "Who are the pioneers within {topic} in Sweden?",
        "Which companies are driving development within {industry}?",
        "Which Swedish startups or companies work with {topic}?",
    ],
    "hr": [
        "Which are the most attractive employers in {industry} in Sweden?",
        "Which companies offer the best career opportunities within {topic}?",
        "Which Swedish companies in {industry} are known for a strong company culture?",
    ],
}
CONTROL_QUESTIONS_EN: list[str] = [
    "Which companies operate within {industry} in Sweden?",
    "What can you tell me about {topic} in Sweden?",
    "Describe the market for {service_area} in Sweden.",
]

SUPPORTED_MEASUREMENT_LANGUAGES = ("sv", "en")


def _measurement_language(client: dict[str, Any]) -> str:
    """Kundens mätspråk för polling (sv default). Skilt från profilspråket (identitet)."""
    lang = client.get("measurement_language")
    return lang if lang in SUPPORTED_MEASUREMENT_LANGUAGES else "sv"


@dataclass
class QuestionAnswer:
    category: str
    question: str
    model: str
    answer: str
    mentioned: bool = False
    sentiment: float | None = None
    persons_mentioned: list[str] = field(default_factory=list)
    orgs_mentioned: list[str] = field(default_factory=list)
    run_idx: int = 0   # P0: vilken sampling-körning (0 = representativ; sentiment/org körs bara på den)


@dataclass
class PollingResult:
    client_id: str
    week_id: str
    share_of_voice: float
    sentiment_score: float | None
    parity_index: float | None
    category_results: dict[str, dict[str, float]]
    category_competitors: dict[str, list[dict[str, Any]]]
    models_used: list[str]
    total_answers: int
    answers_with_mention: int
    raw_responses: list[dict[str, Any]]
    # P0 — sampling-osäkerhet på Share of Voice (binomialt SE + CI95 över alla körningar).
    sov_se: float = 0.0
    sov_ci95: float = 0.0
    runs_per_query: int = 1
    # P2 — SoV uppdelat per knowledge_source (training = "AI Base Knowledge",
    # web_rag = "AI Live Signal"). De mäter olika fördelningar och får aldrig
    # medeltalas; det poolade share_of_voice ovan behålls bara för trend-kontinuitet.
    sov_by_source: dict[str, dict[str, Any]] = field(default_factory=dict)
    # Parity v2 (docs/parity-index-spec.md): porträtterad paritet ur öppen person-NER
    # + SCB-namnestimering. parity_index ovan behålls som alias = parity_portrayed
    # (trend-kontinuitet). Endast aggregat — aldrig namn eller per-person-kön.
    parity_portrayed: float | None = None
    parity_n: int = 0                      # antal namn som kunde estimeras
    parity_unknown_share: float = 0.0      # andel AI-nämnda namn utan estimat
    parity_ci95: list[float] | None = None # Wilson-intervall [lo, hi] — grindar trendpilar
    parity_baseline: dict[str, Any] | None = None  # snapshot {value, source, as_of}
    parity_gap: float | None = None        # portrayed − baseline.value
    # F3 (frågedesign): fingerprint av det resolved frågesettet — ändras mallarna,
    # substitutionerna eller custom-frågorna bryts trendjämförbarheten, och UI:t
    # markerar bytet (samma princip som modellbyten via models_used).
    questions_fingerprint: str | None = None
    # F2 (frågedesign): synlighetsinflation denna vecka — {framed_sov, control_sov, delta,
    # framed_n, control_n}. Batteri-SoV mot neutralt kontroll-SoV; summeras över ≥4 veckor
    # i services/sov_inflation.py till en läsanvisning. None för veckor före omläggningen.
    framing_inflation: dict[str, Any] | None = None
    # F6 (frågedesign): anonymt NER-/könsestimat-kvalitetsaggregat (inga namn) — recognized,
    # low_confidence, low_confidence_share, unknown_share, names_seen. Audit-signal för paritet.
    parity_ner_quality: dict[str, Any] | None = None
    # F4 (frågedesign): mätspråk (sv/en) frågorna ställdes på. Resultat medeltalas ALDRIG
    # över språk — språkbyte bryter jämförbarheten (ingår i questions_fingerprint).
    language: str = "sv"


def run_for_client(client_id: str) -> PollingResult | None:
    client_snap = fs.client_doc(client_id).get()
    if not client_snap.exists:
        log.warning("client %s not found, skipping polling", client_id)
        return None
    client = client_snap.to_dict() or {}

    questions = _build_questions(client)
    if not questions:
        log.info("no questions for %s", client_id)
        return None

    models = _build_models()
    if not models:
        log.warning("no LLMs configured — polling skipped for %s", client_id)
        return None

    company_name = client.get("company_name") or client_id
    employees = list(fs.iter_employees(client_id))
    employee_names = [emp.get("name", "") for _, emp in employees if emp.get("name")]

    language = _measurement_language(client)
    runs = _runs_per_query()
    answers = _collect_answers(questions, models, runs, language)

    for ans in answers:
        ans.mentioned = _has_mention(ans.answer, company_name, employee_names)

    # Dyra anrop (sentiment + org-NER) körs 1× per (fråga × motor) på det
    # representativa svaret (run_idx 0) — P0 multiplicerar bara de billiga ask-anropen.
    # Mention-detektering (gratis substring) körs däremot på ALLA körningar ovan, så att
    # Share of Voice blir en samplad rate med standardfel.
    judge = next(iter(models.values()))
    # Person-NER på EU-motorn (Vertex EU-generator) — ALDRIG judge/probe-motorn, som kan
    # vara US-routad. Svarstexten kan innehålla personnamn = personuppgift (DPA §6.1).
    # None (GCP ej konfigurerat) → paritet hoppas över, ingen US-väg finns.
    eu_ner = llm_factory.make_generator() if POLLING_EXTRACT_PERSONS else None
    for ans in answers:
        if ans.run_idx != 0:
            continue
        if ans.mentioned:
            ans.sentiment = _safe_judge_sentiment(judge, ans.answer, company_name)
        # Konkurrent-kontext: vilka andra org nämns? Alla svar, inte bara där vi nämns
        # — för det är just "AI nämner X, inte oss" som ger den starkaste signalen.
        if POLLING_EXTRACT_ORGS and ans.answer and len(ans.answer.strip()) >= 20:
            ans.orgs_mentioned = _call_with_timeout(
                lambda: _extract_orgs(judge, ans.answer, company_name, employee_names),
                timeout=POLLING_ORG_TIMEOUT_SEC,
                default=[],
                what="extract_orgs",
            )
        # Parity v2: vilka PERSONER lyfter motorn fram? Öppen NER (inte uppslag mot
        # uppladdade anställda) — namnen lever bara i minnet tills aggregatet räknats.
        if eu_ner is not None and ans.answer and len(ans.answer.strip()) >= 20:
            ans.persons_mentioned = _call_with_timeout(
                lambda: _extract_persons(eu_ner, ans.answer),
                timeout=POLLING_PERSON_TIMEOUT_SEC,
                default=[],
                what="extract_persons",
            )

    result = _aggregate(client_id, company_name, answers, client.get("parity_baseline"), runs)
    result.language = language
    result.questions_fingerprint = _questions_fingerprint(questions, language)
    _write(result)
    return result


def _questions_fingerprint(questions: list[tuple[str, str]], language: str = "sv") -> str:
    """F3: stabil hash av det resolved frågesettet (kategori|text, sorterat) + språk (F4).
    Ändras frågorna ELLER språket mellan veckor markerar UI:t ett jämförbarhetsbrott."""
    joined = "\n".join(f"{cat}|{text}" for cat, text in sorted(questions))
    return hashlib.sha1(f"{language}\n{joined}".encode("utf-8")).hexdigest()[:16]


def _build_questions(client: dict[str, Any]) -> list[tuple[str, str]]:
    custom = client.get("polling_questions")
    if isinstance(custom, dict) and custom:
        company_name = client.get("company_name") or ""
        out = []
        for category, qs in custom.items():
            for q in qs:
                # Subjekt-grind: flagga (men behåll — kund-författat) frågor som tilltalar
                # bolaget i andra person utan att namnge det. Motorn kan då svara om sig
                # själv i stället för mätobjektet. Vi droppar inte kundens egna frågor;
                # varningen surfar i ops-loggen så formuleringen kan rättas.
                if probe_guard.addresses_subject_in_second_person(q, company_name):
                    log.warning(
                        "polling: kund-fråga är subjekt-osäker (andra person utan "
                        "bolagsnamn) — motorn kan svara om sig själv: %r",
                        q,
                    )
                out.append((category, q))
        # F2: lägg ALLTID till de neutrala kontrollfrågorna — även för custom-kunder mäts
        # inflationen (custom-inramning vs neutral kontroll), annars vet vi inte hur mycket
        # av synligheten som är frågekonstruktion. Substitutionerna nedan gäller även här.
        out.extend(_control_questions(client))
        return out

    lang = _measurement_language(client)
    substitutions = _substitutions(client)

    templates = DEFAULT_QUESTIONS_EN if lang == "en" else DEFAULT_QUESTIONS
    out = []
    for category, qs in templates.items():
        for q in qs:
            out.append((category, q.format(**substitutions)))
    out.extend(_control_questions(client))
    return out


def _substitutions(client: dict[str, Any]) -> dict[str, str]:
    """Substitutionsvärden för frågemallarna, med språkanpassade fallbacks (F4)."""
    if _measurement_language(client) == "en":
        return {
            "industry": client.get("industry") or "their industry",
            "topic": client.get("topic") or "their areas",
            "service_area": client.get("service_area") or "their services",
        }
    return {
        "industry": client.get("industry") or "branschen",
        "topic": client.get("topic") or "deras områden",
        "service_area": client.get("service_area") or "deras tjänster",
    }


def _control_questions(client: dict[str, Any]) -> list[tuple[str, str]]:
    """F2: de neutralt inramade kontrollfrågorna med substitutioner ifyllda (F4: språkval)."""
    substitutions = _substitutions(client)
    templates = CONTROL_QUESTIONS_EN if _measurement_language(client) == "en" else CONTROL_QUESTIONS
    return [(CONTROL_CATEGORY, q.format(**substitutions)) for q in templates]


def resolve_polling_questions(client: dict[str, Any]) -> dict[str, Any]:
    """Det resolved frågesettet för en kund (custom från config OR default-templates
    med substitutions ifyllda). Drivs av AI-synlighet-flikens "Polling-frågor"-panel
    för transparens: kund/ops ska kunna se EXAKT vad som ställs varje vecka."""
    custom_raw = client.get("polling_questions")
    is_custom = isinstance(custom_raw, dict) and any(custom_raw.values()) if custom_raw else False

    lang = _measurement_language(client)
    substitutions = _substitutions(client)
    default_templates = DEFAULT_QUESTIONS_EN if lang == "en" else DEFAULT_QUESTIONS
    control_templates = CONTROL_QUESTIONS_EN if lang == "en" else CONTROL_QUESTIONS

    by_category: dict[str, list[dict[str, Any]]] = {}
    if is_custom:
        for category, qs in custom_raw.items():
            by_category.setdefault(category, [])
            for q in (qs or []):
                by_category[category].append({"text": q, "source": "custom"})
    else:
        for category, qs in default_templates.items():
            by_category[category] = [
                {"text": q.format(**substitutions), "source": "default"} for q in qs
            ]

    # F2: kontrollfrågorna mäts alltid (egen kategori, källa "control") — visas i panelen
    # så ops ser att inflationen mäts och med vilka neutrala frågor.
    by_category[CONTROL_CATEGORY] = [
        {"text": q.format(**substitutions), "source": "control"} for q in control_templates
    ]

    return {
        "is_custom": is_custom,
        "substitutions": substitutions,
        "by_category": by_category,
        "total": sum(len(v) for v in by_category.values()),
        # F3: när mätkontexten senast sågs över (None = aldrig sedan fältet infördes)
        # — driver staleness-flaggan i frågepanelen.
        "config_updated_at": client.get("measurement_config_updated_at"),
        # F4: mätspråk (sv/en) — visas i panelen; custom-frågor är språkagnostiska.
        "language": lang,
    }


def _build_models() -> dict[str, Any]:
    # Delad probe-factory: första-parts gpt-4o + gemini (de publika motorer vi mäter).
    # EU-skyddet ligger på resonemangsmodellerna (Vertex EU), inte här. Se make_probe_engines.
    models = llm_factory.make_probe_engines()
    # P4a (opt-in): slå på groundade varianter (web-sök PÅ) som en separat "AI Live
    # Signal"-serie bortom Perplexity. Default AV — grounding kostar sök-avgift per anrop,
    # så det är ett medvetet ops-val. De taggas web_rag av knowledge_source_for() och
    # poolas aldrig med training-talet (P2). Experiment #2 (2026-06-07) visade att det
    # rena API:t bara överlappar ~13–15 % med vad en groundad användare ser.
    if os.environ.get("POLLING_GROUNDED", "").lower() in ("1", "true", "yes"):
        models.update(llm_factory.make_grounded_probe_engines())
    return models


def _collect_answers(
    questions: list[tuple[str, str]],
    models: dict[str, Any],
    runs: int = 1,
    language: str = "sv",
) -> list[QuestionAnswer]:
    """Parallell ask-fas med per-anrop-timeout. Worker-tråden anropar _safe_ask som
    daemon-skyddar den faktiska LLM-anropet — om gpt-4o/gemini hänger kommer worker
    att returnera "" efter POLLING_ASK_TIMEOUT_SEC istället för att blockera hela jobbet.

    P0: varje (fråga × motor) ställs `runs` gånger; varje körning är ett eget task
    (run_idx) så ThreadPool-parallelismen utnyttjas fullt. Mention-rate beräknas sedan
    över alla körningar (samplad Share of Voice med standardfel)."""
    tasks = []
    for category, question in questions:
        for model_name, llm in models.items():
            for run_idx in range(max(1, runs)):
                tasks.append((category, question, model_name, llm, run_idx))

    results: list[QuestionAnswer] = []
    # Snappa huvudtrådens context EN gång per task (token_meter+cost_budget bunden
    # av record_run) och kör worker:n inom den kopian. Måste snappa i huvudtråden:
    # `copy_context()` i workern skulle kopiera workerns egen TOMMA context, inte
    # huvudtrådens. Och varje task behöver ett EGET snapshot eftersom ett Context-
    # objekt inte kan .run():as parallellt från flera trådar.
    with ThreadPoolExecutor(max_workers=min(8, len(tasks))) as pool:
        futures = {}
        for category, q, model_name, llm, run_idx in tasks:
            task_ctx = contextvars.copy_context()
            fut = pool.submit(task_ctx.run, _safe_ask, q, llm, model_name, language)
            futures[fut] = (category, q, model_name, run_idx)
        for fut in as_completed(futures):
            category, question, model_name, run_idx = futures[fut]
            try:
                answer = fut.result()
            except Exception as exc:
                log.warning("model %s failed on %r: %s", model_name, question, exc)
                answer = ""
            results.append(
                QuestionAnswer(
                    category=category, question=question, model=model_name,
                    answer=answer, run_idx=run_idx,
                )
            )
    return results


def _safe_ask(question: str, llm: Any, model_name: str, language: str = "sv") -> str:
    """Timeout-skyddat _ask. Returnerar "" om LLM-klienten hänger eller felar."""
    return _call_with_timeout(
        lambda: _ask(question, llm, language),
        timeout=POLLING_ASK_TIMEOUT_SEC,
        default="",
        what=f"ask[{model_name}]",
    )


# F4: systemramen på mätspråket. Geografin ("Swedish/svensk") behålls så att en engelsk
# mätning gäller samma marknad, bara på ett annat språk (citerbarhet är språkspecifik).
_ASK_SYSTEM = {
    "sv": (
        "Du är en sakkunnig svensk affärsanalytiker. Svara koncist (max 200 ord), "
        "konkret och lista de mest relevanta bolagen och personerna med namn."
    ),
    "en": (
        "You are a knowledgeable business analyst covering the Swedish market. Answer "
        "concisely (max 200 words), concretely, and list the most relevant companies and "
        "people by name."
    ),
}


def _ask(question: str, llm: Any, language: str = "sv") -> str:
    msg = [
        SystemMessage(content=_ASK_SYSTEM.get(language, _ASK_SYSTEM["sv"])),
        HumanMessage(content=question),
    ]
    resp = llm.invoke(msg)
    return (resp.content or "").strip() if hasattr(resp, "content") else str(resp).strip()


def _has_mention(answer: str, company_name: str, employee_names: list[str]) -> bool:
    # P8: ordgräns-matchning (probe_guard.text_mentions) i stället för rå delsträng —
    # bolaget matchas på distinktivt token (split_tokens), personer på helt namn.
    if not answer:
        return False
    if probe_guard.text_mentions(answer, company_name, split_tokens=True):
        return True
    return any(probe_guard.text_mentions(answer, name) for name in employee_names if name)


def _extract_persons(llm: Any, answer: str) -> list[str]:
    """Öppen person-NER för Parity v2: vilka personer namnger motorn — oavsett om
    de är uppladdade anställda eller inte? (Det gamla uppslaget mot employee_names
    kunde per konstruktion inte se personer vi inte laddat upp.)

    KÖRS ENDAST PÅ EU-MOTOR (Vertex EU) — personnamn är personuppgift och får inte
    efterbehandlas utanför EU/EES (DPA §6.1). Namnen persisteras aldrig; de
    konsumeras av name_gender.aggregate i _aggregate och slängs (DPA §6.2/§7.2).

    Soft-signal: robust mot icke-JSON-utgångar, tom lista vid fel/kort text."""
    if not answer or len(answer.strip()) < 20:
        return []
    prompt = [
        SystemMessage(
            content=(
                "Du är NER-extraktor. Returnera ETT JSON-objekt med formatet "
                '{"persons": ["Förnamn Efternamn", ...]} — bara namn på verkliga '
                "personer som faktiskt nämns i texten, med det namn texten använder. "
                "INTE företagsnamn. INTE produkter. INTE roller utan namn ('vd:n', "
                "'grundaren'). Tom lista om inga finns. Returnera bara JSON."
            )
        ),
        HumanMessage(content=f"Text:\n{answer[:2200]}"),
    ]
    try:
        resp = llm.invoke(prompt)
        raw = resp.content if hasattr(resp, "content") else str(resp)
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if not match:
            return []
        data = json.loads(match.group(0))
        persons = data.get("persons") or []
        return [str(p).strip() for p in persons if str(p).strip()][:25]
    except Exception as exc:
        log.warning("person extraction failed: %s", exc)
        return []


def _safe_judge_sentiment(llm: Any, answer: str, company_name: str) -> float | None:
    """Timeout-skyddat _judge_sentiment. None om LLM-klienten hänger eller felar."""
    return _call_with_timeout(
        lambda: _judge_sentiment(llm, answer, company_name),
        timeout=POLLING_JUDGE_TIMEOUT_SEC,
        default=None,
        what="judge_sentiment",
    )


def _extract_orgs(llm: Any, answer: str, own_company: str, employee_names: list[str]) -> list[str]:
    """LLM-NER för organisationsnamn i ett AI-svar. Egen org + medarbetar­namn filtreras bort
    så att aggregatet i UI:t blir konkurrent-kontext: 'vilka andra nämns när vi inte gör det'.

    Bara öppna svar med substans tas igenom (kort/tom text → tom lista).
    Robust mot icke-JSON-utgångar — det är ett soft-signal-fält, inte beslutspåverkande."""
    if not answer or len(answer.strip()) < 20:
        return []
    prompt = [
        SystemMessage(
            content=(
                "Du är NER-extraktor. Returnera ETT JSON-objekt med formatet "
                '{"orgs": ["Företag A", "Företag B"]} — bara namn på företag, byråer, '
                "leverantörer eller organisationer som faktiskt nämns i texten. "
                "INTE personnamn. INTE produkter. INTE allmänna ord ('konsultbyrå', 'företag'). "
                "Tom lista om inga finns. Returnera bara JSON."
            )
        ),
        HumanMessage(content=f"Text:\n{answer[:2200]}"),
    ]
    try:
        resp = llm.invoke(prompt)
        raw = resp.content if hasattr(resp, "content") else str(resp)
        match = re.search(r"\{[\s\S]*?\}", raw)
        if not match:
            return []
        data = json.loads(match.group(0))
        orgs = data.get("orgs") or []
        own_lower = (own_company or "").lower().strip()
        emp_lower = {n.lower().strip() for n in employee_names if n}
        out: list[str] = []
        seen: set[str] = set()
        for o in orgs:
            if not isinstance(o, str):
                continue
            s = o.strip()
            if not s or len(s) > 80:
                continue
            sl = s.lower()
            if sl == own_lower or sl in emp_lower or sl in seen:
                continue
            seen.add(sl)
            out.append(s)
        return out[:8]
    except Exception as exc:
        log.warning("org extraction failed: %s", exc)
        return []


def _judge_sentiment(llm: Any, answer: str, company_name: str) -> float | None:
    prompt = [
        SystemMessage(
            content=(
                "Du är en sentimentbedömare. Returnera ett enskilt JSON-objekt "
                'med formatet {"score": <-1.0 till 1.0>} där -1 är mycket negativt '
                "om bolaget, 0 är neutralt och 1 är mycket positivt. Returnera bara JSON."
            )
        ),
        HumanMessage(content=f"Bolag: {company_name}\n\nText:\n{answer}"),
    ]
    try:
        resp = llm.invoke(prompt)
        raw = resp.content if hasattr(resp, "content") else str(resp)
        match = re.search(r"\{[^{}]*\}", raw, re.DOTALL)
        if not match:
            return None
        data = json.loads(match.group(0))
        score = float(data.get("score"))
        return max(-1.0, min(1.0, score))
    except Exception as exc:
        log.warning("sentiment judge failed: %s", exc)
        return None


def _aggregate(
    client_id: str,
    company_name: str,
    answers: list[QuestionAnswer],
    parity_baseline: dict[str, Any] | None = None,
    runs: int = 1,
) -> PollingResult:
    # F2: kontrollfrågorna är ett separat mätinstrument (inflations-A/B) och poolas ALDRIG
    # in i rubrik-SoV:t eller något annat huvudmått — bara batteriet (framed) driver dem,
    # exakt som historiken (som saknade kontrollfrågor) så trendkontinuiteten hålls intakt.
    control = [a for a in answers if a.category == CONTROL_CATEGORY]
    framed = [a for a in answers if a.category != CONTROL_CATEGORY]

    total = len(framed)                                    # alla sampling-körningar (batteriet)
    with_mention = [a for a in framed if a.mentioned]

    sov = (len(with_mention) / total) if total else 0.0
    # P1-förfining: prompt-klustrat brusband (run-to-run inom (fråga×motor)), inte naiv
    # binomial över alla körningar — den senare överskattar bruset på fixerade frågor.
    sov_se = _runtorun_se(framed)
    sov_ci95 = round(1.96 * sov_se, 4)

    # F2: synlighetsinflation — andel batteri-svar som nämner kunden mot andel neutrala
    # kontroll-svar som gör det. Skillnaden = den del av SoV:t som drivs av ledande
    # frågeinramning. En vecka är brusig; services/sov_inflation.py summerar över ≥4 veckor.
    c_total = len(control)
    c_with = sum(1 for a in control if a.mentioned)
    control_sov = (c_with / c_total) if c_total else 0.0
    framing_inflation = {
        "framed_sov": round(sov, 4),
        "control_sov": round(control_sov, 4),
        "delta": round(sov - control_sov, 4),
        "framed_n": total,
        "control_n": c_total,
    }

    # P2: separera "AI Base Knowledge" (training) från "AI Live Signal" (web_rag).
    # Ett poolat SoV blandar parametriskt minne med live-webb-RAG — olika fördelningar
    # som inte ska medeltalas, och som dessutom skiftar om en motors tillgänglighet ändras.
    by_source: dict[str, list[QuestionAnswer]] = {}
    for a in framed:
        by_source.setdefault(model_registry.knowledge_source_for(a.model), []).append(a)
    sov_by_source: dict[str, dict[str, Any]] = {}
    for src, src_answers in by_source.items():
        n = len(src_answers)
        m = sum(1 for a in src_answers if a.mentioned)
        sov_by_source[src] = {
            "share_of_voice": (m / n) if n else 0.0,
            "se": round(_runtorun_se(src_answers), 4),  # P1-förfining: prompt-klustrat
            "n_runs": n,
            "engines": sorted({a.model for a in src_answers}),
        }

    # Representativa svar (run_idx 0) — ett per (fråga × motor). Sentiment, paritet och
    # konkurrent-NER körs bara på dessa (P0: dyra anrop multipliceras inte), så deras
    # nämnare är stabila och identiska med det gamla n=1-beteendet. F2: kontrollfrågorna
    # exkluderas även här — de ska inte rubba sentiment/paritet, bara mäta inflationen.
    reps = [a for a in framed if a.run_idx == 0]

    sentiments = [a.sentiment for a in reps if a.mentioned and a.sentiment is not None]
    avg_sentiment = (sum(sentiments) / len(sentiments)) if sentiments else None

    # Parity v2: namnen konsumeras här och persisteras ALDRIG (DPA §6.2/§7.2) —
    # bara det anonyma aggregatet + osäkerhet skrivs.
    all_persons = [name for a in reps for name in a.persons_mentioned]
    parity_agg = name_gender.aggregate(all_persons)
    parity = parity_agg["parity"]
    parity_n = int(parity_agg["n"])
    parity_ci = _wilson_ci95(parity, parity_n)

    # F6 — anonymt NER-/estimat-kvalitetsstickprov (inga namn): hur stor andel av de
    # AI-nämnda namnen som matchade SCB, var lågkonfidenta (utanför pariteten) resp.
    # var helt okända. En spik i unknown_share signalerar NER-brus eller många icke-
    # svenska namn → trigger för audit. Bara aggregat — namnen är redan släppta.
    parity_ner_quality = {
        "recognized": int(parity_agg.get("recognized", parity_n)),
        "low_confidence": int(parity_agg.get("low_confidence", 0)),
        "low_confidence_share": round(float(parity_agg.get("low_confidence_share", 0.0)), 4),
        "unknown_share": round(float(parity_agg.get("unknown_share", 0.0)), 4),
        "names_seen": len(all_persons),
    }
    if parity_ner_quality["unknown_share"] > 0.5 and len(all_persons) >= 5:
        log.warning(
            "polling %s: hög andel okända person-namn (%.0f%% av %d) — NER-kvalitet bör auditeras",
            client_id, parity_ner_quality["unknown_share"] * 100, len(all_persons),
        )

    baseline = parity_baseline if isinstance(parity_baseline, dict) else None
    baseline_value = baseline.get("value") if baseline else None
    if not isinstance(baseline_value, (int, float)) or not (0.0 <= float(baseline_value) <= 1.0):
        baseline_value = None
    gap = (parity - float(baseline_value)) if (parity is not None and baseline_value is not None) else None

    category_results: dict[str, dict[str, float]] = {}
    category_competitors: dict[str, list[dict[str, Any]]] = {}
    for cat in {a.category for a in answers}:
        cat_answers = [a for a in answers if a.category == cat]      # alla körningar
        cat_with = [a for a in cat_answers if a.mentioned]
        cat_sov = (len(cat_with) / len(cat_answers)) if cat_answers else 0.0
        cat_reps = [a for a in cat_answers if a.run_idx == 0]        # representativa
        cat_sents = [a.sentiment for a in cat_reps if a.mentioned and a.sentiment is not None]
        cat_sent = (sum(cat_sents) / len(cat_sents)) if cat_sents else None
        category_results[cat] = {
            "share_of_voice": cat_sov,
            "sentiment_score": cat_sent if cat_sent is not None else 0.0,
            "answer_count": float(len(cat_answers)),
            "mention_count": float(len(cat_with)),
            "se": round(_proportion_se(len(cat_with), len(cat_answers)), 4),
        }
        # Konkurrent-aggregat per kategori: vilka andra org nämns mest? Top 5 + share.
        # Räknas över de representativa svaren (org-NER körs bara på run_idx 0), så share-
        # nämnaren är antalet (fråga × motor)-par i kategorin, inte alla körningar.
        counts: dict[str, int] = {}
        for a in cat_reps:
            for org in a.orgs_mentioned:
                key = org.strip()
                if key:
                    counts[key] = counts.get(key, 0) + 1
        ordered = sorted(counts.items(), key=lambda x: (-x[1], x[0]))[:5]
        denom = len(cat_reps)
        category_competitors[cat] = [
            {
                "name": name,
                "mentions": n,
                "share": (n / denom) if denom else 0.0,
            }
            for name, n in ordered
        ]

    # raw_responses behåller ALLA körningar (så routerns per-motor-SoV också blir samplad),
    # men den stora svarstexten + sentiment/orgs bärs bara av run_idx 0 — övriga körningar
    # lagras kompakt (bara mention-flaggan) för att hålla Firestore-dokumentet under 1 MB.
    # OBS: persons_mentioned skrivs MEDVETET inte — öppna NER-namn (inkl. tredje part)
    # i Firestore vore persisterad personuppgift (DPA §6.2/§7.2, parity-index-spec).
    raw_responses = [
        {
            "category": a.category,
            "question": a.question,
            "model": a.model,
            "answer": a.answer if a.run_idx == 0 else "",
            "mentioned": a.mentioned,
            "sentiment": a.sentiment if a.run_idx == 0 else None,
            "orgs_mentioned": a.orgs_mentioned if a.run_idx == 0 else [],
            "run_idx": a.run_idx,
        }
        for a in answers
    ]

    return PollingResult(
        client_id=client_id,
        week_id=_current_week_id(),
        share_of_voice=sov,
        sentiment_score=avg_sentiment,
        parity_index=parity,
        category_results=category_results,
        category_competitors=category_competitors,
        models_used=sorted({a.model for a in answers}),
        total_answers=total,
        answers_with_mention=len(with_mention),
        raw_responses=raw_responses,
        sov_se=round(sov_se, 4),
        sov_ci95=sov_ci95,
        runs_per_query=max(1, runs),
        sov_by_source=sov_by_source,
        parity_portrayed=parity,
        parity_n=parity_n,
        parity_unknown_share=round(float(parity_agg["unknown_share"]), 4),
        parity_ci95=parity_ci,
        parity_baseline=baseline,
        parity_gap=gap,
        framing_inflation=framing_inflation,
        parity_ner_quality=parity_ner_quality,
    )


def _wilson_ci95(p: float | None, n: int, z: float = 1.96) -> list[float] | None:
    """Wilson-konfidensintervall [lo, hi] för en andel — paritetens motsvarighet
    till sov_ci95. Tre nämnda personer ska inte ge en tvärsäker trendpil: vid små
    n blir intervallet brett och UI/rapport grindar på det. None om underlag saknas.

    Wilson i stället för normalapproximation: beter sig korrekt nära 0/1 och vid
    små n (det vanliga läget — AI namnger ofta bara en handfull personer)."""
    if p is None or n <= 0:
        return None
    z2 = z * z
    denom = 1 + z2 / n
    center = (p + z2 / (2 * n)) / denom
    half = z * ((p * (1 - p) / n + z2 / (4 * n * n)) ** 0.5) / denom
    return [round(max(0.0, center - half), 4), round(min(1.0, center + half), 4)]


def _current_week_id() -> str:
    now = datetime.now(timezone.utc)
    iso_year, iso_week, _ = now.isocalendar()
    return f"{iso_year}-W{iso_week:02d}"


def _write(result: PollingResult) -> None:
    fs.polling_results_col(result.client_id).document(result.week_id).set(
        {
            "share_of_voice": result.share_of_voice,
            "sentiment_score": result.sentiment_score,
            "parity_index": result.parity_index,  # alias = parity_portrayed (trend-kontinuitet)
            # Parity v2 — enbart anonyma aggregat; namn/kön per person skrivs aldrig (DPA).
            "parity_portrayed": result.parity_portrayed,
            "parity_n": result.parity_n,
            "parity_unknown_share": result.parity_unknown_share,
            "parity_ci95": result.parity_ci95,
            "parity_baseline": result.parity_baseline,
            "parity_gap": result.parity_gap,
            "category_results": result.category_results,
            "category_competitors": result.category_competitors,
            "models_used": result.models_used,
            "total_answers": result.total_answers,
            "answers_with_mention": result.answers_with_mention,
            "raw_responses": result.raw_responses,
            # P0 — sampling-osäkerhet (grindar trendpilar i P1)
            "sov_se": result.sov_se,
            "sov_ci95": result.sov_ci95,
            "runs_per_query": result.runs_per_query,
            "sov_by_source": result.sov_by_source,  # P2: training vs web_rag, aldrig poolat
            # F3 — frågesettets fingerprint: jämförbarhetsbrott markeras i UI vid byte
            "questions_fingerprint": result.questions_fingerprint,
            # F2 — synlighetsinflation (batteri vs neutral kontroll) denna vecka
            "framing_inflation": result.framing_inflation,
            # F6 — anonymt NER-/könsestimat-kvalitetsaggregat (audit-signal, inga namn)
            "parity_ner_quality": result.parity_ner_quality,
            # F4 — mätspråk frågorna ställdes på (sv/en); aldrig poolat över språk
            "language": result.language,
            "run_at": firestore.SERVER_TIMESTAMP,
        }
    )
