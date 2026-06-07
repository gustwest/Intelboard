"""Experiment #2: parad API-vs-UI — mät ERT EGET grounding-gap.

Deep researchen (2026-06-05) gav sekundära tal (SurferSEO: ~24 % varumärkes-, ~4 %
källöverlapp UI vs API) — citerade inuti ett verifierat påstående, inte hämtade som
primärkälla. Den här harnessen mäter i stället ERT eget gap för ERA branscher: samma
prompts ställs mot (a) det rena API:t med produktions-probeinställningar (temp=0, ingen
grounding) och (b) det riktiga, web-groundade UI:t (ChatGPT/Gemini/Perplexity), och vi
jämför vad de två kanalerna säger om kunden.

Två mått per motor:
  1. Omnämnande-överensstämmelse: nämns kunden i bägge kanaler, eller bara i en?
     "UI nämner er men API inte" (ui_only) är den farliga riktningen — då mäter
     produktionsproben fel verklighet.
  2. Varumärkes-Jaccard (API-lista vs UI-lista): hur stor andel av konkurrent-/
     varumärkesnamnen är gemensamma? Det är ERT motsvarande "24 %"-tal.

Varför det spelar roll: detta är datan som avgör P4a (lägga till grounding ja/nej).
Är gapet stort för era branscher → grounding behövs. Är det litet → API-talet duger
och ni slipper betala för web-sök per anrop.

UI-armen kräver att en `ui_fetch(engine, prompt) -> str` injiceras — runnern kopplar
den till Playwright-MCP (eller manuell klistring). Standard-implementationen kastar med
vägledning, så harnessen aldrig "tyst" mäter ett tomt UI-svar som ett verkligt.

Aggregeringen (`aggregate`) och jämförelse-logiken är rena/testbara — inga nätverksanrop.
Kör: python -m services.api_vs_ui --client-id <id> [--prompts 5]  (kräver UI-runner)
"""
from __future__ import annotations

import argparse
import logging
from typing import Any, Callable

import firestore_client as fs
from services import llm as llm_factory
from services import polling
from services.noise_floor import ASK_TIMEOUT_SEC, ORG_TIMEOUT_SEC, _jaccard, _norm_brands

log = logging.getLogger("services.api_vs_ui")

API = "api"
UI = "ui"


# --- aggregering (ren) --------------------------------------------------------

def aggregate(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Jämför API- mot UI-kanalen per (motor, prompt) och rulla upp per motor.

    Varje rad: {engine, prompt, channel: 'api'|'ui', mentioned: bool, brands: list}.
    Bara (motor, prompt) där BÅDA kanalerna finns jämförs — annars är gapet odefinierat.
    Returnerar per motor: omnämnande-överensstämmelse, ui-only/api-only-andelar och
    medel-varumärkes-Jaccard (API-lista vs UI-lista — ert grounding-gap)."""
    # Indexera: (engine, prompt) -> {channel: row}
    paired: dict[tuple[str, str], dict[str, dict[str, Any]]] = {}
    for r in rows:
        paired.setdefault((r["engine"], r["prompt"]), {})[r["channel"]] = r

    per_engine: dict[str, dict[str, Any]] = {}
    for (engine, _prompt), channels in paired.items():
        if API not in channels or UI not in channels:
            continue  # ofullständigt par — kan inte jämföras
        api_row, ui_row = channels[API], channels[UI]
        cell = per_engine.setdefault(engine, {
            "engine": engine, "n_pairs": 0,
            "both": 0, "neither": 0, "api_only": 0, "ui_only": 0,
            "jaccards": [],
        })
        cell["n_pairs"] += 1
        a_m, u_m = bool(api_row["mentioned"]), bool(ui_row["mentioned"])
        if a_m and u_m:
            cell["both"] += 1
        elif not a_m and not u_m:
            cell["neither"] += 1
        elif a_m and not u_m:
            cell["api_only"] += 1
        else:
            cell["ui_only"] += 1

        a_set = _norm_brands(api_row.get("brands") or [])
        u_set = _norm_brands(ui_row.get("brands") or [])
        if a_set or u_set:  # minst en kanal hittade varumärken (annars vacuöst 1.0)
            cell["jaccards"].append(_jaccard(a_set, u_set))

    by_engine: dict[str, dict[str, Any]] = {}
    for engine, c in per_engine.items():
        n = c["n_pairs"]
        agree = (c["both"] + c["neither"]) / n if n else None
        jacc = round(sum(c["jaccards"]) / len(c["jaccards"]), 3) if c["jaccards"] else None
        by_engine[engine] = {
            "engine": engine, "n_pairs": n,
            "mention_agreement": round(agree, 3) if agree is not None else None,
            "ui_only_rate": round(c["ui_only"] / n, 3) if n else None,
            "api_only_rate": round(c["api_only"] / n, 3) if n else None,
            "mean_brand_jaccard": jacc,
            "both": c["both"], "neither": c["neither"],
            "api_only": c["api_only"], "ui_only": c["ui_only"],
        }
    return {"by_engine": by_engine, "summary": _summary(by_engine)}


def _summary(by_engine: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """Tvärs-motor-medel: ett enda grounding-gap-tal att jämföra mot forskningens ~24 %."""
    cells = list(by_engine.values())
    if not cells:
        return {"engines": 0, "mean_brand_jaccard": None, "mean_mention_agreement": None}
    jaccs = [c["mean_brand_jaccard"] for c in cells if c["mean_brand_jaccard"] is not None]
    agrees = [c["mention_agreement"] for c in cells if c["mention_agreement"] is not None]
    return {
        "engines": len(cells),
        "mean_brand_jaccard": round(sum(jaccs) / len(jaccs), 3) if jaccs else None,
        "mean_mention_agreement": round(sum(agrees) / len(agrees), 3) if agrees else None,
    }


# --- insamling (nätverk / UI) -------------------------------------------------

def _default_ui_fetch(engine: str, prompt: str) -> str:
    raise NotImplementedError(
        "UI-armen kräver en injicerad ui_fetch(engine, prompt) -> str. Koppla den till "
        "Playwright-MCP (navigera till motorns UI, ställ prompten, läs svaret) eller till "
        "manuellt klistrade svar. Utan den kan experimentet inte mäta UI-kanalen — och vi "
        "vägrar tyst mäta ett tomt UI-svar som ett verkligt."
    )


def _build_judge() -> Any | None:
    """Fast temp=0-domare för org-extraktion, gemensam för bägge kanaler så att
    extraktionen inte tillför eget brus i jämförelsen."""
    try:
        models = llm_factory.make_probe_engines(temperature=0)
        return next(iter(models.values())) if models else None
    except Exception as exc:
        log.warning("kunde inte bygga judge: %s", exc)
        return None


def run_experiment(
    client_id: str, *,
    prompts: int | None = None,
    api_models: dict[str, Any] | None = None,
    ui_fetch: Callable[[str, str], str] = _default_ui_fetch,
    ask: Callable[[str, Any], str] = polling._ask,
    judge: Any | None = None,
) -> dict[str, Any]:
    """Ställ samma frågor mot API (produktions-probeinställningar) och UI (groundat),
    extrahera varumärken med en gemensam domare och jämför kanalerna.

    `api_models`/`ui_fetch`/`ask`/`judge` injicerbara för test (inga nätverksanrop).
    Återanvänder polling._build_questions (riktiga prod-prompts) och polling._ask
    (produktionens system-prompt) så API-armen speglar er faktiska mätning."""
    data = fs.client_doc(client_id).get().to_dict() or {}
    name = data.get("company_name") or client_id
    employees = list(fs.iter_employees(client_id))
    employee_names = [emp.get("name", "") for _, emp in employees if emp.get("name")]

    questions = polling._build_questions(data)
    if prompts:
        questions = questions[:prompts]
    if not questions:
        return {"company": name, **aggregate([])}

    api_models = api_models if api_models is not None else llm_factory.make_probe_engines()
    if judge is None:
        judge = _build_judge()

    def _brands(answer: str) -> list[str]:
        if judge is None or not answer or len(answer.strip()) < 20:
            return []
        return polling._call_with_timeout(
            lambda: polling._extract_orgs(judge, answer, name, employee_names),
            timeout=ORG_TIMEOUT_SEC, default=[], what="api_vs_ui.extract_orgs",
        )

    rows: list[dict[str, Any]] = []
    for _category, q in questions:
        for engine, llm in api_models.items():
            # API-arm: produktions-probe (temp=0, ingen grounding). Timeout-skyddad så
            # ett hängande motor-anrop inte stallar experimentet.
            api_ans = polling._call_with_timeout(
                lambda: ask(q, llm),
                timeout=ASK_TIMEOUT_SEC, default="", what=f"api_vs_ui.ask[{engine}]",
            )
            rows.append({"engine": engine, "prompt": q, "channel": API,
                         "mentioned": polling._has_mention(api_ans, name, employee_names),
                         "brands": _brands(api_ans)})
            # UI-arm: groundat UI via injicerad fetch. Ett fel på en motor får inte
            # fälla experimentet — men vi loggar och hoppar paret (jämförs ej).
            try:
                ui_ans = ui_fetch(engine, q)
            except NotImplementedError:
                raise
            except Exception as exc:
                log.warning("UI-fetch misslyckades (%s): %s — paret hoppas", engine, exc)
                continue
            rows.append({"engine": engine, "prompt": q, "channel": UI,
                         "mentioned": polling._has_mention(ui_ans, name, employee_names),
                         "brands": _brands(ui_ans)})

    return {"company": name, **aggregate(rows)}


# --- CLI ----------------------------------------------------------------------

def main() -> None:
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(description="Parad API-vs-UI-experiment (experiment #2)")
    parser.add_argument("--client-id", required=True)
    parser.add_argument("--prompts", type=int, default=None,
                        help="begränsa till de N första polling-frågorna (default: alla)")
    args = parser.parse_args()

    # OBS: utan en kopplad ui_fetch kastar UI-armen avsiktligt. Wire:a Playwright-MCP
    # i en runner och anropa run_experiment(..., ui_fetch=din_fetch) därifrån.
    result = run_experiment(args.client_id, prompts=args.prompts)

    print(f"\nAPI vs UI — {result['company']}\n")
    hdr = f"{'Motor':<22}{'par':>5}{'överens':>9}{'ui_only':>9}{'api_only':>10}{'varum.-Jaccard':>16}"
    print(hdr)
    print("-" * len(hdr))
    for cell in sorted(result["by_engine"].values(), key=lambda c: c["engine"]):
        agr = "—" if cell["mention_agreement"] is None else f"{cell['mention_agreement']:.2f}"
        uo = "—" if cell["ui_only_rate"] is None else f"{cell['ui_only_rate']:.2f}"
        ao = "—" if cell["api_only_rate"] is None else f"{cell['api_only_rate']:.2f}"
        jac = "—" if cell["mean_brand_jaccard"] is None else f"{cell['mean_brand_jaccard']:.2f}"
        print(f"{cell['engine']:<22}{cell['n_pairs']:>5}{agr:>9}{uo:>9}{ao:>10}{jac:>16}")
    s = result["summary"]
    print(f"\nSammantaget ({s['engines']} motorer): varum.-Jaccard "
          f"{s['mean_brand_jaccard']}, omnämnande-överensstämmelse {s['mean_mention_agreement']}")
    print("(jämför mot forskningens ~0.24 varumärkesöverlapp — lågt tal = stort grounding-gap = P4a motiverat)")


if __name__ == "__main__":
    main()
