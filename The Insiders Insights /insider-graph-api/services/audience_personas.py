"""Kanonisk vokabulär för de tre kärn-målgrupperna som BÅDE GEO-riskloopen och
ICP/output-quality mäter: **customer / employee / investor**.

Bakgrund (städat 2026-06-05): tre system hade divergerat på samma tre målgrupper —
riskloopen använde `buyer`/`candidate`, ICP använde `customer`/`candidate`, och
warmth-paletten (services/persona_registry.py) `customer`/`employee`. Nu drar alla
tre från SAMMA id:n, anpassade till warmth-paletten (störst, källa till sanning).

Lins-metadata bor kvar i respektive system (risk-expertlinser i risk_detector,
ICP-rubric i output_quality) — det är samma målgrupp sedd genom olika lins, inte
olika målgrupper. Den här modulen äger bara id-vokabulären + bakåtkompat.
"""
from __future__ import annotations

# De tre kärn-målgrupperna, i kanonisk ordning. En delmängd av warmth-paletten.
# "talent" = talang-/employer-brand-målgruppen: BÅDE prospektiva kandidater och
# befintlig personal (samma audience, olika livscykelfas — jfr customer = köpare +
# befintlig kund). Neutralt id som inte gynnar någon fas.
CANONICAL: tuple[str, ...] = ("customer", "talent", "investor")

# Bakåtkompat: gammalt id → kanoniskt. Tillämpas vid läsning/ingest så att gammal
# Firestore-data och äldre API-anrop fortsätter funka under avvecklingen.
# buyer→customer; candidate/employee→talent (talang-axeln, båda livscykelfaserna).
_ALIASES = {"buyer": "customer", "candidate": "talent", "employee": "talent"}

# Svenska etiketter — kanoniska, används överallt.
LABEL_SV = {"customer": "Kund", "talent": "Talang", "investor": "Investerare"}


def normalize(persona: str | None) -> str | None:
    """Mappa ett ev. gammalt persona-id till det kanoniska. Okända id passerar oförändrade."""
    if persona is None:
        return None
    return _ALIASES.get(persona, persona)


def normalize_keys(d: dict | None) -> dict:
    """Normalisera persona-NYCKLAR i en dict (t.ex. answers_by_persona). Slår ihop
    värden om både gammalt och nytt id råkar finnas (summerar tal, annars sista vinner)."""
    out: dict = {}
    for k, v in (d or {}).items():
        nk = normalize(k)
        if nk in out and isinstance(v, (int, float)) and isinstance(out[nk], (int, float)):
            out[nk] = out[nk] + v
        else:
            out[nk] = v
    return out
