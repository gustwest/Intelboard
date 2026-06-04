"""Humaniseringslager — taxonomi, mappningar och (provisoriska) viktparametrar.

Se docs/humanization-trust-gap-spec.md §5.2 och §8. Centraliserar de sex
värmedimensionerna, predicate→dimension-kopplingen och scoring-konstanterna så att
taxonomin kan justeras utan att röra logiken i schema_org/claims.py (derivering) eller
jobs/compute_trust_gap.py (aggregering).

KALIBRERING (spec §12): de numeriska NIVÅERNA nedan är defaultvärden med dokumenterat
resonemang (se per-konstant-kommentarerna). De ska finjusteras mot fältdata innan
perceptions-tal visas skarpt — men de STRUKTURELLA invarianterna som gör en poäng/flagga
meningsfull (declared kapat, demonstrated kräver oberoende underlag, perception aldrig i
poängen, salience-golv, asymmetrisk flagg-grind) är låsta av tests/test_compute_trust_gap.py
och får inte drifta när nivåerna justeras.
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

# --- Utökad gap-taxonomi (Fas 1.1) --------------------------------------------
# Sju typer; fem aktiva nu, två stubbade tills förutsättningarna finns. Recept-motorn
# (Fas 1.3) känner till hela taxonomin så Fas 2/4 kan aktivera utan refactor.
GAP_TAXONOMY: tuple[str, ...] = (
    "over_claim",                # AI varmare än underlaget (anseenderisk) — perception > evidens
    "opportunity",               # underlaget varmare än AI — perception < evidens
    "missing_evidence",          # deklarerat men ej belagt; perception-oberoende
    "contradiction",             # motorerna är oense; spread mellan engines över tröskel
    "factual_drift",             # AI:s bild har svalnat sedan förra mätningen utan att underlaget gjort det
    "persona_mismatch",          # AKTIV från Fas 2.1d — spread mellan personor över tröskel
    "competitive_displacement",  # STUBB — kräver konkurrent-probe-data (Fas 4)
)

# Contradiction: minsta valens-spread mellan probe-motorer för att resa flagga.
# 0.3 = en motor varm (≥0.6) och en sval (≤0.3) — tydlig oenighet, inte brus.
CONTRADICTION_SPREAD_MIN: float = 0.3

# Persona-mismatch: minsta valens-spread mellan aktiva personor på samma dimension.
# Mirror av CONTRADICTION_SPREAD_MIN men över persona-axeln — operatören ska få
# larm när AI uppfattar bolaget tydligt annorlunda beroende på vem som frågar
# (ofta = bolaget kommunicerar bra mot en målgrupp men inte mot andra).
PERSONA_MISMATCH_SPREAD_MIN: float = 0.3

# Variansgrind (Fas 2.2c): om en dimensions valence_variance (mätstabilitet från
# probe-kalibreringen, Fas 2.2a) når detta tak är perceptionsmätningen för instabil
# för att resa perception-baserade flaggor (over_claim, opportunity, contradiction,
# persona_mismatch, factual_drift). missing_evidence är perception-oberoende och
# grindas aldrig. 0.25 = valensen vobblar ±0.25 mellan körningar → otillförlitligt.
PERCEPTION_VARIANCE_CEILING: float = 0.25

# Factual drift: minsta valens-fall sedan förra snapshot (på samma dimension) som
# inte förklaras av att underlaget rasat. 0.15 = märkbart utan att vara hyperkänsligt.
DRIFT_DROP_MIN: float = 0.15
# Demonstrated får ha sjunkit max så här mycket innan vi avstår från drift-flaggan
# (då är det inte drift utan reflekterar verkligheten).
DRIFT_DEMONSTRATED_TOLERANCE: float = 0.05
