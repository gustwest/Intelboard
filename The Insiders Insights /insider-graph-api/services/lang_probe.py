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


def run_experiment(
    client_id: str, *, models: dict[str, Any] | None = None,
    ask: Callable[[str, Any, str], str] = _ask,
) -> dict[str, Any]:
    """Kör sv- och en-frågor mot varje probe-motor och mät omnämnandegrad.
    `models`/`ask` injicerbara för test (inga nätverksanrop)."""
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
                try:
                    answer = ask(q, llm, lang)
                except Exception as exc:  # en motor får inte fälla experimentet
                    log.warning("%s (%s) failed: %s", engine, lang, exc)
                    answer = ""
                rows.append({"engine": engine, "lang": lang, "question": q,
                             "mentioned": polling._has_mention(answer, name, [])})
    return aggregate(rows, name)


def aggregate(rows: list[dict[str, Any]], company: str) -> dict[str, Any]:
    """Ren aggregering: omnämnandegrad per (motor, språk) + vinnande språk per motor."""
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
        sv_r, en_r = langs["sv"]["rate"], langs["en"]["rate"]
        if sv_r is None or en_r is None or sv_r == en_r:
            langs["winner"] = "tie" if sv_r == en_r else "n/a"
        else:
            langs["winner"] = "sv" if sv_r > en_r else "en"
    return {"company": company, "pairs": len({r["question"] for r in rows}),
            "per_engine": per_engine, "rows": rows}


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(description="sv-vs-en probe-experiment (C2)")
    parser.add_argument("--client-id", required=True)
    args = parser.parse_args()
    result = run_experiment(args.client_id)
    print(f"\nSpråkexperiment — {result['company']} ({result['pairs']} frågepar)\n")
    print(f"{'Motor':<24}{'sv-omnämn.':>12}{'en-omnämn.':>12}{'vinnare':>10}")
    for engine, langs in result["per_engine"].items():
        sv = langs["sv"]["rate"]
        en = langs["en"]["rate"]
        print(f"{engine:<24}{str(sv):>12}{str(en):>12}{langs['winner']:>10}")


if __name__ == "__main__":
    main()
