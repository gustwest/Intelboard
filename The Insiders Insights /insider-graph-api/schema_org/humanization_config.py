"""Humaniseringslager — taxonomi, mappningar och (provisoriska) viktparametrar.

Se docs/humanization-trust-gap-spec.md §5.2 och §8. Centraliserar de sex
värmedimensionerna, predicate→dimension-kopplingen och scoring-konstanterna så att
taxonomin kan justeras utan att röra logiken i schema_org/claims.py (derivering) eller
jobs/compute_trust_gap.py (aggregering).

VIKTIGT: viktparametrarna nedan är PROVISORISKA platshållare. De ska kalibreras mot
riktig kunddata innan trust_gap-poäng visas skarpt för kund (spec §12, task #9).
"""
from __future__ import annotations

# --- De sex värmedimensionerna (spec §5.2) ----------------------------------
# Nyckel = stabil intern slug (lagras på Claim.dimension). Värde = mänsklig
# etikett (svenska) som rendering/översättningslagret (§10.1) utgår från.
DIMENSIONS: dict[str, str] = {
    "inclusion": "mångfald & inkludering",
    "wellbeing": "välmående & arbetsmiljö",
    "transparency": "transparens, kollektivavtal, likalön",
    "ethics": "etik, styrning, uppförande",
    "development": "lärande & utveckling",
    "community": "samhällsengagemang",
}


def is_valid_dimension(dimension: str | None) -> bool:
    """True om dimension är en känd värmedimension (None tillåts — t.ex. slogan)."""
    return dimension is None or dimension in DIMENSIONS


# --- Predicate → dimension (referensmappning, spec §5.2) ---------------------
# Den kanoniska kopplingen mellan ett schema.org-predikat som en culture-claim fyller
# och dess värmedimension, använd vid aggregering. Den auktoritativa källfält-mappningen
# (källfält → predikat + warmth_mode + dimension) bor i claims._CULTURE_PREDICATE_MAP
# (task #4); denna är predikatnivåns uppslag. knowsAbout är kontextberoende och sätts
# av deriveringen — uteslutet här för att inte gissa.
PREDICATE_DIMENSION: dict[str, str] = {
    "ethicsPolicy": "ethics",
    "diversityPolicy": "inclusion",
    "memberOf": "transparency",
    "jobBenefits": "wellbeing",
    "aggregateRating": "wellbeing",
    "hasCredential": "wellbeing",
    "subjectOf": "community",
}

# --- Scoring-parametrar (PROVISORISKA — kalibreras i task #9, spec §8) -------

# Likaviktat över dimensioner tills kalibrerat. Summerar till 1.0.
DIMENSION_WEIGHTS: dict[str, float] = {d: 1.0 / len(DIMENSIONS) for d in DIMENSIONS}

# Bas-vikt per assurance-nivå för demonstrated_d (spec §8 steg 2). self_declared
# kapad nära 0 → bolagets ord ensamt rör aldrig demonstrated.
ASSURANCE_BASE_WEIGHT: dict[str, float] = {
    "self_declared": 0.0,
    "third_party_reviewed": 0.7,
    "independently_assured": 1.0,
}

# Vikt för demonstrated-bevis UTAN manuell verifiering men med självverifierande
# item-källa (jobbannons/publikt register). Lägre än verifierat, högre än bolagets ord.
ITEM_UNVERIFIED_WEIGHT: float = 0.5

# score_d = min(SCORE_W_DECLARED·declared_d, DECLARED_CAP) + SCORE_W_DEMONSTRATED·demonstrated_d
# Perception ingår ALDRIG i poängen (spec §2.4, §8 steg 4).
DECLARED_CAP: float = 0.3          # TAK — påstående ensamt kan ej överstiga detta
SCORE_W_DECLARED: float = 0.3
SCORE_W_DEMONSTRATED: float = 0.7

# Normaliserare i demonstrated_d = min(1.0, Σ(vikt·recency) / TARGET_NORM).
TARGET_NORM: float = 2.0

# Perception får ej beräknas till valens/gap under detta salience-golv (spec §8 steg 5).
SALIENCE_FLOOR: float = 0.25

# polling_results-dok där värme-probarna skriver perception (compute_trust_gap läser det).
WARMTH_PROBE_DOC: str = "warmth-latest"

# Flagg-grindar (spec §8 steg 6) — asymmetriska efter riktning.
FLAG_CONFIDENCE_MIN: float = 0.5   # ingen flagga reses under denna konfidens
GAP_MAGNITUDE_MIN: float = 0.2     # minsta |gap| för att en flagga ska vara meningsfull
# credibility_gap > 0 = anseenderisk → högre ribba + helst korroboration:
OVER_CLAIM_CONFIDENCE_MIN: float = 0.7
OVER_CLAIM_REQUIRES_CORROBORATION: bool = True
