"""Polling-agent — mäter AI-synlighet veckovis.

För varje kund:
  1. Hämta frågor (per kategori) — kundspecifika eller default.
  2. Skicka till GPT-4o och Gemini parallellt.
  3. Räkna Share of Voice (andel svar där kunden nämns).
  4. För svar med omnämnande: be en LLM-domare bedöma sentiment.
  5. Parity Index: andel kvinnliga personer av alla personer som rekommenderas.
  6. Skriv till clients/{id}/polling_results/{YYYY-Www}.

Utan OPENAI_API_KEY / GEMINI_API_KEY hoppas modellerna över — körningen
slutförs men markeras `skipped`.
"""
from __future__ import annotations

import contextvars
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

# Konkurrent-extraktion via judge-LLM (gemini). Kan stängas av om gRPC-klienten hänger
# i prod — fältet category_competitors blir tomt men polling-jobbet fortsätter.
POLLING_EXTRACT_ORGS = os.environ.get("POLLING_EXTRACT_ORGS", "1") not in ("0", "false", "False", "")
# Per-anrop-timeouter — polling-jobbet får ALDRIG hänga, oavsett LLM-läge. Justera via env.
# 2026-06-03: ORG-timeout höjd 8→20 (Gemini Vertex EU svarar typiskt på 3-4s men 6-8s vid
# cold start, vilket gav timeout-storm i prod), JUDGE-timeout 12→20 av samma skäl.
POLLING_ASK_TIMEOUT_SEC = float(os.environ.get("POLLING_ASK_TIMEOUT_SEC", "30"))
POLLING_JUDGE_TIMEOUT_SEC = float(os.environ.get("POLLING_JUDGE_TIMEOUT_SEC", "20"))
POLLING_ORG_TIMEOUT_SEC = float(os.environ.get("POLLING_ORG_TIMEOUT_SEC", "20"))

T = TypeVar("T")


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
    employee_gender = {emp.get("name", ""): emp.get("gender") for _, emp in employees}

    answers = _collect_answers(questions, models)

    for ans in answers:
        ans.mentioned = _has_mention(ans.answer, company_name, employee_names)
        ans.persons_mentioned = _extract_persons(ans.answer, employee_names)

    judge = next(iter(models.values()))
    for ans in answers:
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

    result = _aggregate(client_id, company_name, answers, employee_gender)
    _write(result)
    return result


def _build_questions(client: dict[str, Any]) -> list[tuple[str, str]]:
    custom = client.get("polling_questions")
    if isinstance(custom, dict) and custom:
        out = []
        for category, qs in custom.items():
            for q in qs:
                out.append((category, q))
        return out

    industry = client.get("industry") or "branschen"
    topic = client.get("topic") or "deras områden"
    service_area = client.get("service_area") or "deras tjänster"
    substitutions = {"industry": industry, "topic": topic, "service_area": service_area}

    out = []
    for category, qs in DEFAULT_QUESTIONS.items():
        for q in qs:
            out.append((category, q.format(**substitutions)))
    return out


def resolve_polling_questions(client: dict[str, Any]) -> dict[str, Any]:
    """Det resolved frågesettet för en kund (custom från config OR default-templates
    med substitutions ifyllda). Drivs av AI-synlighet-flikens "Polling-frågor"-panel
    för transparens: kund/ops ska kunna se EXAKT vad som ställs varje vecka."""
    custom_raw = client.get("polling_questions")
    is_custom = isinstance(custom_raw, dict) and any(custom_raw.values()) if custom_raw else False

    industry = client.get("industry") or "branschen"
    topic = client.get("topic") or "deras områden"
    service_area = client.get("service_area") or "deras tjänster"
    substitutions = {"industry": industry, "topic": topic, "service_area": service_area}

    by_category: dict[str, list[dict[str, Any]]] = {}
    if is_custom:
        for category, qs in custom_raw.items():
            by_category.setdefault(category, [])
            for q in (qs or []):
                by_category[category].append({"text": q, "source": "custom"})
    else:
        for category, qs in DEFAULT_QUESTIONS.items():
            by_category[category] = [
                {"text": q.format(**substitutions), "source": "default"} for q in qs
            ]

    return {
        "is_custom": is_custom,
        "substitutions": substitutions,
        "by_category": by_category,
        "total": sum(len(v) for v in by_category.values()),
    }


def _build_models() -> dict[str, Any]:
    # Delad probe-factory: första-parts gpt-4o + gemini (de publika motorer vi mäter).
    # EU-skyddet ligger på resonemangsmodellerna (Vertex EU), inte här. Se make_probe_engines.
    return llm_factory.make_probe_engines()


def _collect_answers(
    questions: list[tuple[str, str]],
    models: dict[str, Any],
) -> list[QuestionAnswer]:
    """Parallell ask-fas med per-anrop-timeout. Worker-tråden anropar _safe_ask som
    daemon-skyddar den faktiska LLM-anropet — om gpt-4o/gemini hänger kommer worker
    att returnera "" efter POLLING_ASK_TIMEOUT_SEC istället för att blockera hela jobbet."""
    tasks = []
    for category, question in questions:
        for model_name, llm in models.items():
            tasks.append((category, question, model_name, llm))

    results: list[QuestionAnswer] = []
    # Snappa huvudtrådens context EN gång per task (token_meter+cost_budget bunden
    # av record_run) och kör worker:n inom den kopian. Måste snappa i huvudtråden:
    # `copy_context()` i workern skulle kopiera workerns egen TOMMA context, inte
    # huvudtrådens. Och varje task behöver ett EGET snapshot eftersom ett Context-
    # objekt inte kan .run():as parallellt från flera trådar.
    with ThreadPoolExecutor(max_workers=min(8, len(tasks))) as pool:
        futures = {}
        for category, q, model_name, llm in tasks:
            task_ctx = contextvars.copy_context()
            fut = pool.submit(task_ctx.run, _safe_ask, q, llm, model_name)
            futures[fut] = (category, q, model_name)
        for fut in as_completed(futures):
            category, question, model_name = futures[fut]
            try:
                answer = fut.result()
            except Exception as exc:
                log.warning("model %s failed on %r: %s", model_name, question, exc)
                answer = ""
            results.append(
                QuestionAnswer(category=category, question=question, model=model_name, answer=answer)
            )
    return results


def _safe_ask(question: str, llm: Any, model_name: str) -> str:
    """Timeout-skyddat _ask. Returnerar "" om LLM-klienten hänger eller felar."""
    return _call_with_timeout(
        lambda: _ask(question, llm),
        timeout=POLLING_ASK_TIMEOUT_SEC,
        default="",
        what=f"ask[{model_name}]",
    )


def _ask(question: str, llm: Any) -> str:
    msg = [
        SystemMessage(
            content=(
                "Du är en sakkunnig svensk affärsanalytiker. Svara koncist (max 200 ord), "
                "konkret och lista de mest relevanta bolagen och personerna med namn."
            )
        ),
        HumanMessage(content=question),
    ]
    resp = llm.invoke(msg)
    return (resp.content or "").strip() if hasattr(resp, "content") else str(resp).strip()


def _has_mention(answer: str, company_name: str, employee_names: list[str]) -> bool:
    if not answer:
        return False
    haystack = answer.lower()
    if company_name.lower() in haystack:
        return True
    return any(name.lower() in haystack for name in employee_names if name)


def _extract_persons(answer: str, employee_names: list[str]) -> list[str]:
    if not answer:
        return []
    found = []
    haystack = answer.lower()
    for name in employee_names:
        if name and name.lower() in haystack:
            found.append(name)
    return found


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
    employee_gender: dict[str, str | None],
) -> PollingResult:
    total = len(answers)
    with_mention = [a for a in answers if a.mentioned]

    sov = (len(with_mention) / total) if total else 0.0
    sentiments = [a.sentiment for a in with_mention if a.sentiment is not None]
    avg_sentiment = (sum(sentiments) / len(sentiments)) if sentiments else None

    all_persons = [name for a in answers for name in a.persons_mentioned]
    parity = _calculate_parity(all_persons, employee_gender)

    category_results: dict[str, dict[str, float]] = {}
    category_competitors: dict[str, list[dict[str, Any]]] = {}
    for cat in {a.category for a in answers}:
        cat_answers = [a for a in answers if a.category == cat]
        cat_with = [a for a in cat_answers if a.mentioned]
        cat_sov = (len(cat_with) / len(cat_answers)) if cat_answers else 0.0
        cat_sents = [a.sentiment for a in cat_with if a.sentiment is not None]
        cat_sent = (sum(cat_sents) / len(cat_sents)) if cat_sents else None
        category_results[cat] = {
            "share_of_voice": cat_sov,
            "sentiment_score": cat_sent if cat_sent is not None else 0.0,
            "answer_count": float(len(cat_answers)),
            "mention_count": float(len(cat_with)),
        }
        # Konkurrent-aggregat per kategori: vilka andra org nämns mest? Top 5 + share
        # av kategorins svar. Tom lista om ingen extraktion gav träffar — t.ex. vid
        # kort/tomt LLM-svar.
        counts: dict[str, int] = {}
        for a in cat_answers:
            for org in a.orgs_mentioned:
                key = org.strip()
                if key:
                    counts[key] = counts.get(key, 0) + 1
        ordered = sorted(counts.items(), key=lambda x: (-x[1], x[0]))[:5]
        category_competitors[cat] = [
            {
                "name": name,
                "mentions": n,
                "share": (n / len(cat_answers)) if cat_answers else 0.0,
            }
            for name, n in ordered
        ]

    raw_responses = [
        {
            "category": a.category,
            "question": a.question,
            "model": a.model,
            "answer": a.answer,
            "mentioned": a.mentioned,
            "sentiment": a.sentiment,
            "persons_mentioned": a.persons_mentioned,
            "orgs_mentioned": a.orgs_mentioned,
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
    )


def _calculate_parity(persons: list[str], gender_map: dict[str, str | None]) -> float | None:
    counts = {"kvinna": 0, "man": 0}
    for name in persons:
        g = (gender_map.get(name) or "").lower()
        if g in counts:
            counts[g] += 1
    total = counts["kvinna"] + counts["man"]
    if total == 0:
        return None
    return counts["kvinna"] / total


def _current_week_id() -> str:
    now = datetime.now(timezone.utc)
    iso_year, iso_week, _ = now.isocalendar()
    return f"{iso_year}-W{iso_week:02d}"


def _write(result: PollingResult) -> None:
    fs.polling_results_col(result.client_id).document(result.week_id).set(
        {
            "share_of_voice": result.share_of_voice,
            "sentiment_score": result.sentiment_score,
            "parity_index": result.parity_index,
            "category_results": result.category_results,
            "category_competitors": result.category_competitors,
            "models_used": result.models_used,
            "total_answers": result.total_answers,
            "answers_with_mention": result.answers_with_mention,
            "raw_responses": result.raw_responses,
            "run_at": firestore.SERVER_TIMESTAMP,
        }
    )
