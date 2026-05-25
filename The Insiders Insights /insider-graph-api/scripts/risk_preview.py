"""Provkör GEO-riskloopens frågegenerering mot ett valfritt företag.

Syfte: inspektera promptkvaliteten innan vi bygger korrigeringen (skiva 2). Fristående
— bygger en Context ur inmatade fakta (ingen Firestore-kund behövs) och kör BARA
genereringen (opus) per persona. Inga motoranrop, inget skrivs till grafen.

Kräver ANTHROPIC_API_KEY (validator-modellen). GLEIF-homonymsökningen körs utan nyckel.

    python scripts/risk_preview.py "Volvo Cars" \\
        --industry "fordonsindustri" --category "elbilar i premiumsegmentet" \\
        --competitors "Polestar,Tesla,BMW" \\
        --facts "Grundat 1927;Säte i Göteborg;Ägs av Geely"
"""
from __future__ import annotations

import argparse
import os
import sys

# Gör att skriptet kan köras direkt (lägg projektroten på sökvägen).
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services import llm as llm_factory  # noqa: E402
from services.risk_detector import (  # noqa: E402
    ALL_PERSONAS,
    Context,
    _find_homonyms,
    generate_questions,
)


def main() -> None:
    ap = argparse.ArgumentParser(description="Provkör riskloopens frågegenerering.")
    ap.add_argument("company", help="Företagsnamn")
    ap.add_argument("--industry", default="")
    ap.add_argument("--category", default="")
    ap.add_argument("--market", default="")
    ap.add_argument("--competitors", default="", help="kommaseparerat")
    ap.add_argument("--facts", default="", help="semikolonseparerade verifierade fakta")
    ap.add_argument("--lei", default=None, help="kundens egen LEI (utesluts ur homonymer)")
    args = ap.parse_args()

    validator = llm_factory.make_validator()
    if validator is None:
        raise SystemExit("Ingen ANTHROPIC_API_KEY konfigurerad — kan inte generera frågor.")

    facts = [f.strip() for f in args.facts.split(";") if f.strip()]
    meta = [f"Bolag: {args.company}"]
    for label, val in (("Bransch", args.industry), ("Kategori", args.category), ("Marknad", args.market)):
        if val:
            meta.append(f"{label}: {val}")
    block = "\n".join(meta + [f"- {f}" for f in facts])
    ctx = Context(company_name=args.company, profile=block, facit=block)

    competitors = [c.strip() for c in args.competitors.split(",") if c.strip()]
    homonyms = _find_homonyms(args.company, args.lei)
    if homonyms:
        print(f"GLEIF-homonymer (förväxlings-seed): {homonyms}\n")

    for persona in ALL_PERSONAS:
        questions = generate_questions(validator, persona, ctx, competitors, homonyms)
        print(f"\n===== {persona.upper()} — {len(questions)} frågor =====")
        for q in questions:
            print(f"[{q.track}/{q.type}/{q.language}] {q.text}")
            tags = ", ".join(q.harm_modes) if q.harm_modes else "—"
            print(f"      harm: {tags}  |  kriterium: {q.decision_criterion or '—'}")


if __name__ == "__main__":
    main()
