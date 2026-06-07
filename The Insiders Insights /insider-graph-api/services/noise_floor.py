"""Experiment #1: brusgolv (noise floor) — mät ERT EGET run-to-run-brus.

Deep researchen (2026-06-05) gav generiska trösklar (≥7 körningar/prompt, n=30-100)
hämtade ur ANDRAS data (SurferSEO/arXiv). Den här harnessen mäter i stället ert eget
brusgolv: den ställer samma polling-frågor mot samma motorer N gånger SAMMA dag, vid
temp=0 OCH temp>0, och rapporterar två saker per (motor × temperatur):

  1. Hur mycket Share of Voice (omnämnandegrad) varierar mellan körningar
     — binomialt standardfel + andelen frågor där ett enda drag skulle
     etikettera fel (icke-enhälligt utfall över körningarna).
  2. Hur stabil varumärkeslistan är mellan körningar — medel-Jaccard över
     de N org-uppsättningarna (kräver judge-extraktion; stäng av med --no-brands).

Varför det spelar roll för besluten:
  • Kalibrerar P0 — räcker 7 körningar för SE<0.10 i ER data, eller behövs fler/färre?
  • Kalibrerar P1 — ger ett mätt brusband i stället för den env-gissade
    MONTHLY_TREND_MIN_DELTA.
  • Avgör P5 — om temp=0-variansen ≈ temp>0-variansen är temp=0 representativt och
    P5 (temp>0-serie) onödig; om temp=0 döljer mycket motiverar det P5.

Judge-extraktionen körs med en FAST temp=0-domare som återanvänds över alla körningar,
så att variansen vi mäter är motorns — inte domarens.

Kör: python -m services.noise_floor --client-id <id> [--runs 10] [--prompts 5]
                                    [--temps 0,0.7] [--no-brands]

Statistiken (_binom_se, _jaccard, _mean_pairwise_jaccard) och aggregeringen
(aggregate) är rena/testbara — inga nätverksanrop.
"""
from __future__ import annotations

import argparse
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from itertools import combinations
from typing import Any, Callable

import firestore_client as fs
from services import llm as llm_factory
from services import polling

log = logging.getLogger("services.noise_floor")

DEFAULT_RUNS = 10
DEFAULT_TEMPS = (0.0, 0.7)


# --- ren statistik (testbar, inga nätverksanrop) ------------------------------

def _binom_se(k: int, n: int) -> float | None:
    """Binomialt standardfel för en omnämnandegrad p=k/n: sqrt(p(1-p)/n).
    None om n=0. Samma SE-mått som P0 rapporterar för SoV."""
    if not n:
        return None
    p = k / n
    return round((p * (1 - p) / n) ** 0.5, 4)


def _jaccard(a: set[str], b: set[str]) -> float:
    """Jaccard-likhet |A∩B|/|A∪B|. Två tomma uppsättningar = 1.0 (identiska,
    bägge 'inga varumärken'); en tom mot en icke-tom = 0.0."""
    if not a and not b:
        return 1.0
    union = a | b
    if not union:
        return 1.0
    return len(a & b) / len(union)


def _mean_pairwise_jaccard(sets: list[set[str]]) -> float | None:
    """Medel-Jaccard över alla par av uppsättningar. <2 uppsättningar → None
    (ingen variation att mäta). 1.0 = identisk varumärkeslista varje körning;
    lågt = listan kastas om mellan körningar (run-to-run-brus i citeringarna)."""
    if len(sets) < 2:
        return None
    pairs = list(combinations(sets, 2))
    return round(sum(_jaccard(a, b) for a, b in pairs) / len(pairs), 3)


def _norm_brands(brands: list[str]) -> set[str]:
    """Normalisera org-namn för jämförelse mellan körningar (gemener, trim)."""
    return {b.lower().strip() for b in brands if b and b.strip()}


# --- aggregering (ren) --------------------------------------------------------

def aggregate(rows: list[dict[str, Any]], runs: int) -> dict[str, Any]:
    """Bygg brusgolvs-rapporten ur råa körnings-rader.

    Varje rad: {engine, temp, prompt, run_idx, mentioned: bool, brands: list[str]}.
    Returnerar per (motor × temperatur): poolad omnämnandegrad + SE, andelen
    icke-enhälliga frågor (där ett enda drag skulle felklassa), och medel-Jaccard
    för varumärkeslistan över körningar. Plus en temp-jämförelse per motor."""
    # Gruppera per (engine, temp, prompt) för per-fråge-statistik.
    cells: dict[tuple[str, float], dict[str, Any]] = {}
    per_prompt: dict[tuple[str, float, str], list[dict[str, Any]]] = {}
    for r in rows:
        per_prompt.setdefault((r["engine"], r["temp"], r["prompt"]), []).append(r)

    for (engine, temp, _prompt), prompt_rows in per_prompt.items():
        cell = cells.setdefault((engine, temp), {
            "engine": engine, "temp": temp,
            "asks": 0, "mentions": 0,
            "unstable_prompts": 0, "n_prompts": 0,
            "jaccards": [],
        })
        k = sum(1 for r in prompt_rows if r["mentioned"])
        n = len(prompt_rows)
        cell["asks"] += n
        cell["mentions"] += k
        cell["n_prompts"] += 1
        # Icke-enhälligt = ett enda drag hade kunnat ge fel etikett för frågan.
        if 0 < k < n:
            cell["unstable_prompts"] += 1
        # Varumärkesstabilitet: Jaccard över körningarnas org-uppsättningar. Räknas
        # bara när MINST en körning faktiskt hittade varumärken — annars vore "alla
        # tomma" en falsk 1.0 (vacuöst stabil) och skulle dölja celler utan extraktion.
        brand_sets = [_norm_brands(r.get("brands") or []) for r in prompt_rows]
        if any(brand_sets):
            mj = _mean_pairwise_jaccard(brand_sets)
            if mj is not None:
                cell["jaccards"].append(mj)

    by_cell: dict[str, dict[str, Any]] = {}
    for (engine, temp), c in cells.items():
        rate = c["mentions"] / c["asks"] if c["asks"] else None
        jacc = round(sum(c["jaccards"]) / len(c["jaccards"]), 3) if c["jaccards"] else None
        se = _binom_se(c["mentions"], c["asks"])
        by_cell[f"{engine}|{temp}"] = {
            "engine": engine, "temp": temp,
            "mention_rate": round(rate, 3) if rate is not None else None,
            "mention_se": se,
            "ci95": round(1.96 * se, 3) if se is not None else None,
            "unstable_prompt_fraction": round(c["unstable_prompts"] / c["n_prompts"], 3) if c["n_prompts"] else None,
            "mean_brand_jaccard": jacc,
            "n_prompts": c["n_prompts"], "n_asks": c["asks"],
        }

    return {"runs": runs, "by_cell": by_cell, "temp_comparison": _temp_comparison(by_cell)}


def _temp_comparison(by_cell: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """Per motor: ställ temp=0 mot den högsta temperaturen. Visar hur mycket mer
    en riktig (temp>0) användare ser variera än vad en temp=0-probe avslöjar —
    underlaget för P5-beslutet (behövs en temp>0-serie?)."""
    by_engine: dict[str, dict[float, dict[str, Any]]] = {}
    for cell in by_cell.values():
        by_engine.setdefault(cell["engine"], {})[cell["temp"]] = cell

    out: dict[str, Any] = {}
    for engine, temps in by_engine.items():
        if len(temps) < 2:
            continue
        lo = min(temps)
        hi = max(temps)
        c_lo, c_hi = temps[lo], temps[hi]
        se_lo, se_hi = c_lo["mention_se"], c_hi["mention_se"]
        j_lo, j_hi = c_lo["mean_brand_jaccard"], c_hi["mean_brand_jaccard"]
        out[engine] = {
            "temp_low": lo, "temp_high": hi,
            "se_low": se_lo, "se_high": se_hi,
            "se_ratio": round(se_hi / se_lo, 2) if se_lo else None,
            "jaccard_low": j_lo, "jaccard_high": j_hi,
            "jaccard_drop": round(j_lo - j_hi, 3) if (j_lo is not None and j_hi is not None) else None,
        }
    return out


# --- insamling (nätverk) ------------------------------------------------------

def _build_judge() -> Any | None:
    """En fast temp=0-domare för org-extraktion, återanvänd över alla körningar så
    att extraktionen inte tillför egen varians. None om inga motorer kan byggas."""
    try:
        models = llm_factory.make_probe_engines(temperature=0)
        return next(iter(models.values())) if models else None
    except Exception as exc:
        log.warning("kunde inte bygga judge för varumärkesextraktion: %s", exc)
        return None


def run_experiment(
    client_id: str, *,
    runs: int = DEFAULT_RUNS,
    prompts: int | None = None,
    temps: tuple[float, ...] = DEFAULT_TEMPS,
    extract_brands: bool = True,
    models_for_temp: Callable[[float], dict[str, Any]] | None = None,
    ask: Callable[[str, Any], str] = polling._ask,
    judge: Any | None = None,
) -> dict[str, Any]:
    """Kör samma frågor × motorer N gånger per temperatur och samla råa utfall.

    `models_for_temp`/`ask`/`judge` injicerbara för test (inga nätverksanrop).
    Återanvänder polling-frågorna (de RIKTIGA prod-prompterna) och polling._ask
    (samma system-prompt som produktion), så brusgolvet speglar er faktiska mätning."""
    data = fs.client_doc(client_id).get().to_dict() or {}
    name = data.get("company_name") or client_id
    employees = list(fs.iter_employees(client_id))
    employee_names = [emp.get("name", "") for _, emp in employees if emp.get("name")]

    questions = polling._build_questions(data)
    if prompts:
        questions = questions[:prompts]
    if not questions:
        return {"company": name, **aggregate([], runs)}

    models_for_temp = models_for_temp or (lambda t: llm_factory.make_probe_engines(temperature=t))
    if extract_brands and judge is None:
        judge = _build_judge()

    rows: list[dict[str, Any]] = []
    for temp in temps:
        models = models_for_temp(temp)
        if not models:
            log.warning("inga motorer för temp=%s — hoppar", temp)
            continue
        # Bygg alla (fråga × motor × körning)-tasks och kör ask-fasen parallellt.
        tasks = [
            (cat_q[1], engine, llm, run_idx)
            for cat_q in questions
            for engine, llm in models.items()
            for run_idx in range(max(1, runs))
        ]
        answers: dict[tuple[str, str, int], str] = {}
        with ThreadPoolExecutor(max_workers=min(8, len(tasks))) as pool:
            futs = {
                pool.submit(_safe_ask, q, llm, ask): (q, engine, run_idx)
                for q, engine, llm, run_idx in tasks
            }
            for fut in as_completed(futs):
                q, engine, run_idx = futs[fut]
                answers[(q, engine, run_idx)] = fut.result()

        for q, engine, _llm, run_idx in tasks:
            answer = answers.get((q, engine, run_idx), "")
            brands: list[str] = []
            if extract_brands and judge is not None and answer and len(answer.strip()) >= 20:
                try:
                    brands = polling._extract_orgs(judge, answer, name, employee_names)
                except Exception as exc:
                    log.warning("org-extraktion misslyckades (%s): %s", engine, exc)
            rows.append({
                "engine": engine, "temp": temp, "prompt": q, "run_idx": run_idx,
                "mentioned": polling._has_mention(answer, name, employee_names),
                "brands": brands,
            })

    return {"company": name, **aggregate(rows, runs)}


def _safe_ask(question: str, llm: Any, ask: Callable[[str, Any], str]) -> str:
    try:
        return ask(question, llm)
    except Exception as exc:
        log.warning("ask misslyckades: %s", exc)
        return ""


# --- CLI ----------------------------------------------------------------------

def main() -> None:
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(description="Brusgolv-experiment (experiment #1)")
    parser.add_argument("--client-id", required=True)
    parser.add_argument("--runs", type=int, default=DEFAULT_RUNS,
                        help=f"körningar per (fråga × motor × temp), default {DEFAULT_RUNS}")
    parser.add_argument("--prompts", type=int, default=None,
                        help="begränsa till de N första polling-frågorna (default: alla)")
    parser.add_argument("--temps", default="0,0.7",
                        help="kommaseparerade temperaturer att jämföra, default '0,0.7'")
    parser.add_argument("--no-brands", action="store_true",
                        help="hoppa över varumärkes-Jaccard (ingen judge-extraktion — billigare)")
    args = parser.parse_args()

    temps = tuple(float(t) for t in args.temps.split(",") if t.strip() != "")
    result = run_experiment(
        args.client_id, runs=args.runs, prompts=args.prompts,
        temps=temps, extract_brands=not args.no_brands,
    )

    print(f"\nBrusgolv — {result['company']} ({args.runs} körningar/cell)\n")
    hdr = f"{'Motor':<22}{'temp':>6}{'SoV':>8}{'±CI95':>8}{'instabil%':>11}{'varum.-Jaccard':>16}"
    print(hdr)
    print("-" * len(hdr))
    for cell in sorted(result["by_cell"].values(), key=lambda c: (c["engine"], c["temp"])):
        rate = "—" if cell["mention_rate"] is None else f"{cell['mention_rate']:.2f}"
        ci = "—" if cell["ci95"] is None else f"{cell['ci95']:.3f}"
        uns = "—" if cell["unstable_prompt_fraction"] is None else f"{cell['unstable_prompt_fraction']:.2f}"
        jac = "—" if cell["mean_brand_jaccard"] is None else f"{cell['mean_brand_jaccard']:.2f}"
        print(f"{cell['engine']:<22}{cell['temp']:>6}{rate:>8}{ci:>8}{uns:>11}{jac:>16}")

    comp = result["temp_comparison"]
    if comp:
        print("\nTemp-jämförelse (temp>0 vs temp=0 — underlag för P5):")
        for engine, c in comp.items():
            sr = "—" if c["se_ratio"] is None else f"{c['se_ratio']}×"
            jd = "—" if c["jaccard_drop"] is None else f"{c['jaccard_drop']:+.2f}"
            print(f"  {engine:<22} SE {c['se_low']}→{c['se_high']} ({sr})  "
                  f"Jaccard {c['jaccard_low']}→{c['jaccard_high']} ({jd})")


if __name__ == "__main__":
    main()
