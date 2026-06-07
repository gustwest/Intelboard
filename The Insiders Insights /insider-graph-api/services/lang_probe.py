"""C2: sv-vs-en probe-experiment — datadrivet underlag för språkbeslutet (C3).

Deep researchen (2026-06-05) visade att motorers språk-preferens är MOTORSPECIFIK och
att INGEN studie mätte svenska / ChatGPT / Claude. Den här harnessen kör samma
beslutskritiska frågor på svenska OCH engelska mot probe-motorerna och mäter
omnämnandegrad per motor × språk — så valet sv/en/båda blir mätt, inte antaget.

Återanvänder polling-internals (`_build_models`, `_has_mention`) men med SPRÅKMATCHADE
system-prompter — en svensk system-prompt biasar annars svaren mot svenska oavsett
frågespråk, vilket skulle förorena jämförelsen.

Kör: `python -m services.lang_probe --client-id <id>` (kräver probe-motor-nycklar).
Aggregeringen (`aggregate`) och fråge-paren (`question_pairs`) är rena/testbara.
"""
from __future__ import annotations

import argparse
import logging
from typing import Any, Callable

import firestore_client as fs
from services import polling

log = logging.getLogger("services.lang_probe")

# Parallella (sv, en) fråge-mallar. Platshållare fylls ur kund-konfigen; ett par
# hoppas över om dess platshållare saknas (så experimentet funkar även för en kund
# utan industry/topic — då återstår de {name}-baserade frågorna).
_PAIRS: list[tuple[str, str]] = [
    ("Vilka är de ledande svenska bolagen inom {industry}?",
     "What are the leading companies in {industry} in Sweden?"),
    ("Vilka företag rekommenderar du för {service_area}?",
     "Which companies do you recommend for {service_area}?"),
    ("Vilka är de mest attraktiva arbetsgivarna inom {industry} i Sverige?",
     "Who are the most attractive employers in {industry} in Sweden?"),
    ("Vad är {name} känt för?",
     "What is {name} known for?"),
]

_SYSTEM = {
    "sv": ("Du är en sakkunnig affärsanalytiker. Svara koncist (max 200 ord), konkret "
           "och lista de mest relevanta bolagen och personerna med namn."),
    "en": ("You are a knowledgeable business analyst. Answer concisely (max 200 words), "
           "concretely, and list the most relevant companies and people by name."),
}


def _fill(template: str, ctx: dict[str, str]) -> str | None:
    """Fyll en mall; None om någon platshållare saknar värde (paret hoppas då över)."""
    try:
        return template.format(**ctx)
    except KeyError:
        return None


def question_pairs(client: dict[str, Any]) -> list[tuple[str, str]]:
    """Bygg parallella (sv, en)-frågor ur kund-konfigen. Bägge språken fylls ur SAMMA
    kontext så jämförelsen är rättvis. Saknad platshållare → paret utelämnas."""
    ctx = {
        "name": client.get("company_name") or "",
        "industry": (client.get("industry") or "").strip(),
        "topic": (client.get("topic") or "").strip(),
        "service_area": (client.get("service_area") or "").strip(),
    }
    # Tomma värden → behandla platshållaren som saknad (KeyError-likvärdigt).
    ctx_present = {k: v for k, v in ctx.items() if v}
    out: list[tuple[str, str]] = []
    for sv_t, en_t in _PAIRS:
        sv_q, en_q = _fill(sv_t, ctx_present), _fill(en_t, ctx_present)
        if sv_q and en_q:
            out.append((sv_q, en_q))
    return out


def _ask(question: str, llm: Any, lang: str) -> str:
    from langchain_core.messages import HumanMessage, SystemMessage

    resp = llm.invoke([SystemMessage(content=_SYSTEM[lang]), HumanMessage(content=question)])
    return (resp.content or "").strip() if hasattr(resp, "content") else str(resp).strip()


def _two_proportion_sig(m_sv: int, n_sv: int, m_en: int, n_en: int, z_crit: float = 1.96) -> dict[str, Any]:
    """Pooled 2-proportion z-test (P7): är sv-vs-en-skillnaden i omnämnandegrad större
    än run-to-run-bruset? delta = p_sv − p_en; `significant` först när |z| ≥ z_crit
    (≈95 %). Den poolade SE:n hanterar ren separation (0/N vs N/N) korrekt vid stort N."""
    if not n_sv or not n_en:
        return {"delta": None, "z": None, "significant": False}
    p_sv, p_en = m_sv / n_sv, m_en / n_en
    delta = round(p_sv - p_en, 3)
    p_pool = (m_sv + m_en) / (n_sv + n_en)
    se = (p_pool * (1 - p_pool) * (1 / n_sv + 1 / n_en)) ** 0.5
    if se <= 0:  # p_pool är 0 eller 1 → ingen skillnad → ej signifikant
        return {"delta": delta, "z": None, "significant": False}
    z = (p_sv - p_en) / se
    return {"delta": delta, "z": round(z, 2), "significant": abs(z) >= z_crit}


def run_experiment(
    client_id: str, *, models: dict[str, Any] | None = None,
    ask: Callable[[str, Any, str], str] = _ask, runs: int = 5,
) -> dict[str, Any]:
    """Kör sv- och en-frågor mot varje probe-motor och mät omnämnandegrad.

    P7: varje (fråga × språk × motor) ställs `runs` gånger så omnämnandegraden bygger
    på tillräckligt många dragningar för att ett sv/en-utslag ska kunna skiljas från
    bruset (gammalt n=1 utsåg vinnare på rena slumpen). `models`/`ask` injicerbara för test."""
    data = fs.client_doc(client_id).get().to_dict() or {}
    name = data.get("company_name") or client_id
    pairs = question_pairs(data)
    if not pairs:
        return {"company": name, "pairs": 0, "per_engine": {}, "rows": []}

    models = models or polling._build_models()
    rows: list[dict[str, Any]] = []
    for sv_q, en_q in pairs:
        for lang, q in (("sv", sv_q), ("en", en_q)):
            for engine, llm in models.items():
                for _ in range(max(1, runs)):
                    try:
                        answer = ask(q, llm, lang)
                    except Exception as exc:  # en motor får inte fälla experimentet
                        log.warning("%s (%s) failed: %s", engine, lang, exc)
                        answer = ""
                    rows.append({"engine": engine, "lang": lang, "question": q,
                                 "mentioned": polling._has_mention(answer, name, [])})
    return aggregate(rows, name)


def aggregate(rows: list[dict[str, Any]], company: str) -> dict[str, Any]:
    """Ren aggregering: omnämnandegrad per (motor, språk) + vinnande språk per motor.
    Vinnare utses bara när sv/en-skillnaden är statistiskt signifikant (P7); annars
    'inconclusive' — annars blir 'vinnaren' run-to-run-brus."""
    per_engine: dict[str, dict[str, Any]] = {}
    for r in rows:
        bucket = per_engine.setdefault(r["engine"], {"sv": {"asked": 0, "mentioned": 0},
                                                     "en": {"asked": 0, "mentioned": 0}})
        b = bucket[r["lang"]]
        b["asked"] += 1
        if r["mentioned"]:
            b["mentioned"] += 1

    for engine, langs in per_engine.items():
        for lang in ("sv", "en"):
            a = langs[lang]["asked"]
            langs[lang]["rate"] = round(langs[lang]["mentioned"] / a, 3) if a else None
        sv, en = langs["sv"], langs["en"]
        sig = _two_proportion_sig(sv["mentioned"], sv["asked"], en["mentioned"], en["asked"])
        langs["delta"], langs["z"], langs["significant"] = sig["delta"], sig["z"], sig["significant"]
        sv_r, en_r = sv["rate"], en["rate"]
        if sv_r is None or en_r is None:
            langs["winner"] = "n/a"
        elif not sig["significant"]:
            langs["winner"] = "inconclusive"   # skillnaden ryms i bruset
        else:
            langs["winner"] = "sv" if sv_r > en_r else "en"
    return {"company": company, "pairs": len({r["question"] for r in rows}),
            "per_engine": per_engine, "rows": rows}


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(description="sv-vs-en probe-experiment (C2)")
    parser.add_argument("--client-id", required=True)
    parser.add_argument("--runs", type=int, default=5,
                        help="antal sampling-körningar per (fråga × språk × motor), default 5")
    args = parser.parse_args()
    result = run_experiment(args.client_id, runs=args.runs)
    print(f"\nSpråkexperiment — {result['company']} ({result['pairs']} frågepar × {args.runs} körningar)\n")
    print(f"{'Motor':<24}{'sv-omnämn.':>12}{'en-omnämn.':>12}{'vinnare':>14}")
    for engine, langs in result["per_engine"].items():
        sv = langs["sv"]["rate"]
        en = langs["en"]["rate"]
        print(f"{engine:<24}{str(sv):>12}{str(en):>12}{langs['winner']:>14}")


if __name__ == "__main__":
    main()
