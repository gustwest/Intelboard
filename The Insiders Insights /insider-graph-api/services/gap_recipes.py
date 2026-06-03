"""Receptmotor — Lager A: regel-mallar (Fas 1.3a, spec §10 punkt 5).

Tar en gap-flagga (från jobs/compute_trust_gap._detect_flags) och returnerar en
*deterministisk* recept-skiss. Ingen LLM. Lager B (gap_recipes_llm, Fas 1.3b)
detaljifierar därefter; Lager C (Fas 1.3c) persisterar.

Designprincip: strategin är låst i kod, LLM får bara polera detaljerna. Vi
vill kunna bevisa att gap-typ X på dimension Y alltid producerar recept med
samma struktur, samma kanaler, samma impact-metric. Annars driver receptet
isär från en kund till nästa och vi tappar "system, inte slumpgenerator".

Stöder fem aktiva gap-typer: over_claim, opportunity, missing_evidence,
contradiction, factual_drift. persona_mismatch + competitive_displacement
är stubbade i GAP_TAXONOMY (compute_trust_gap.py) — när Fas 2.1 / Fas 4
aktiverar dem läggs regler för dem hit, ingen refactor.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Callable, Literal

from schema_org import humanization_config as hc


KnowledgeSourceTarget = Literal["training", "web_rag", "both"]


@dataclass(frozen=True)
class RecipeSkeleton:
    """Skelettet — det Lager B får och fyller på med detaljer.

    Allt språk här är *mall-svenska*. Inga kund- eller dimension-specifika
    exempel; det är Lager B:s jobb. Vi placerar dimension_label i texterna men
    inget mer dynamiskt.
    """
    gap_type: str
    dimension: str
    dimension_label: str
    knowledge_source_target: KnowledgeSourceTarget
    action_type: str
    target_channels: tuple[str, ...]
    why_template: str
    skeleton_text: str
    expected_impact_metric: str
    confidence: float

    def as_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["target_channels"] = list(self.target_channels)
        return d


# Kanal-konstanter — samlas här så regler refererar samma strängar (annars driftar
# typos in). Frontend-vyn för recept-detalj (Fas 1.5) speglar denna lista.
CHANNEL_ATTESTED_UPLOAD = "attested_upload"
CHANNEL_LINKEDIN = "linkedin"
CHANNEL_RSS = "rss"
CHANNEL_PRESS = "press"
CHANNEL_WIKIPEDIA = "wikipedia"
CHANNEL_GLASSDOOR = "glassdoor"
CHANNEL_WEBSITE = "website"
CHANNEL_GITHUB = "github"
CHANNEL_DIAGNOSIS = "diagnosis"  # pseudo-kanal: contradiction behöver diagnos först


# Action-typ-konstanter (Lager B mappar dessa till specifika LLM-prompter).
ACTION_ADD_EVIDENCE = "add_evidence_attestation"
ACTION_PUBLISH_PROOF = "publish_proof_point"
ACTION_FIX_RECORD = "fix_factual_record"
ACTION_HARMONIZE = "harmonize_sources"


# Impact-metric-konstanter (Lager Fas 1.4-interventionen läser dessa för att veta
# vilket fält som ska följas över tid).
METRIC_DEMONSTRATED = "demonstrated"        # demonstrated-score på dimensionen
METRIC_VALENCE = "perceived.valence"        # perception-valens på dimensionen
METRIC_VALENCE_VARIANCE = "perceived.valence_variance"  # spread mellan motorer
METRIC_VALENCE_BY_SOURCE = "perceived.valence_by_source"  # split training vs web_rag


# --- Regler per gap-typ -------------------------------------------------------
# Varje regel är en funktion (flag, dimension_label) → RecipeSkeleton.
# flag-shape: {kind, dimension, ...gap-specifika fält}
# dimension_label: hämtas av build_recipe_skeleton via hc.DIMENSIONS.


def _rule_over_claim(flag: dict[str, Any], dimension_label: str) -> RecipeSkeleton:
    return RecipeSkeleton(
        gap_type="over_claim",
        dimension=flag["dimension"],
        dimension_label=dimension_label,
        # Anseenderisk slår båda motor-typerna: web_rag plockar upp publicerat
        # bevis omedelbart, training plockar upp via crawlade källor över tid.
        knowledge_source_target="both",
        action_type=ACTION_ADD_EVIDENCE,
        target_channels=(CHANNEL_ATTESTED_UPLOAD, CHANNEL_PRESS, CHANNEL_WEBSITE),
        why_template=(
            f"AI beskriver er varmare inom {dimension_label} än ert underlag styrker. "
            f"Risken är att någon synar bilden och hittar att den inte håller. "
            f"Närmaste åtgärd är att belägga påståendet med tredjepart-bevis."
        ),
        skeleton_text=(
            f"Stärk underlaget för {dimension_label}: ladda upp attesterad data eller "
            f"publicera ett pressmeddelande / case study som visar konkret att ni gör "
            f"det ni säger. Lager B fyller in vilken specifik proof point som bäst "
            f"matchar ert befintliga underlag."
        ),
        expected_impact_metric=METRIC_DEMONSTRATED,
        confidence=0.85,
    )


def _rule_opportunity(flag: dict[str, Any], dimension_label: str) -> RecipeSkeleton:
    # Möjlighet att flytta perception. Vilken motor-typ vi siktar på beror på
    # var gapet är störst — men Lager A vet inte det än (per-source-data behövs).
    # I Fas 1.3a default:ar vi till "both"; Lager B förfinar baserat på by_engine.
    return RecipeSkeleton(
        gap_type="opportunity",
        dimension=flag["dimension"],
        dimension_label=dimension_label,
        knowledge_source_target="both",
        action_type=ACTION_PUBLISH_PROOF,
        target_channels=(CHANNEL_LINKEDIN, CHANNEL_RSS, CHANNEL_PRESS),
        why_template=(
            f"Ni gör mer inom {dimension_label} än vad som syns utåt. Det här är "
            f"en möjlighet att flytta AI:s bild närmare verkligheten."
        ),
        skeleton_text=(
            f"Berätta tydligare om {dimension_label}: publicera ett LinkedIn-inlägg, "
            f"blogginlägg eller pressmeddelande som lyfter en konkret styrka inom "
            f"området. Lager B väljer vilken befintlig proof point som ska aktiveras."
        ),
        expected_impact_metric=METRIC_VALENCE,
        confidence=0.80,
    )


def _rule_missing_evidence(flag: dict[str, Any], dimension_label: str) -> RecipeSkeleton:
    # severity (high/medium) sätts av compute_trust_gap baserat på om AI ser oss.
    # Hög severity → push även till externt synliga kanaler; medium → räcker med
    # attestering tills synligheten byggs upp.
    severity = flag.get("severity", "medium")
    channels: tuple[str, ...]
    if severity == "high":
        channels = (CHANNEL_ATTESTED_UPLOAD, CHANNEL_PRESS, CHANNEL_LINKEDIN)
    else:
        channels = (CHANNEL_ATTESTED_UPLOAD,)
    return RecipeSkeleton(
        gap_type="missing_evidence",
        dimension=flag["dimension"],
        dimension_label=dimension_label,
        knowledge_source_target="both",
        action_type=ACTION_ADD_EVIDENCE,
        target_channels=channels,
        why_template=(
            f"Ni säger detta om er själva inom {dimension_label} men det är ännu inte "
            f"belagt med verifierbart underlag. AI har inget att luta sig mot, vilket "
            f"är en risk om någon syn ar er bild."
        ),
        skeleton_text=(
            f"Belägg {dimension_label} med oberoende underlag: ladda upp attesterad "
            f"data eller publicera tredjepart-citat / mätbar källa som styrker det. "
            f"Lager B identifierar vilken källtyp som passar er bransch."
        ),
        expected_impact_metric=METRIC_DEMONSTRATED,
        confidence=0.90,
    )


def _rule_contradiction(flag: dict[str, Any], dimension_label: str) -> RecipeSkeleton:
    warmest = flag.get("warmest_engine", "(okänd)")
    coolest = flag.get("coolest_engine", "(okänd)")
    return RecipeSkeleton(
        gap_type="contradiction",
        dimension=flag["dimension"],
        dimension_label=dimension_label,
        # Default both — Lager B analyserar by_engine och kan sätta target_source
        # till just den motor-typ där divergensen är som störst.
        knowledge_source_target="both",
        action_type=ACTION_HARMONIZE,
        target_channels=(CHANNEL_DIAGNOSIS,),
        why_template=(
            f"Olika AI-motorer beskriver er olika på {dimension_label}: "
            f"{warmest} varmt, {coolest} svalt. Det betyder att en motor har "
            f"felaktigt underlag, eller att olika källor säger olika."
        ),
        skeleton_text=(
            f"Diagnostisera kontradiktionen i {dimension_label}: jämför vad "
            f"{warmest} och {coolest} faktiskt säger, identifiera vilken källa "
            f"som driver skillnaden, och adressera den. Lager B föreslår "
            f"specifika prober för att lokalisera källan."
        ),
        expected_impact_metric=METRIC_VALENCE_VARIANCE,
        confidence=0.60,
    )


def _rule_factual_drift(flag: dict[str, Any], dimension_label: str) -> RecipeSkeleton:
    since = flag.get("since_date", "förra mätningen")
    return RecipeSkeleton(
        gap_type="factual_drift",
        dimension=flag["dimension"],
        dimension_label=dimension_label,
        # Drift drabbar primärt training-motorer eftersom de bygger på cachead
        # content som åldras. Web_rag-motorer är snabbare att uppdatera. Riktar
        # huvudfokus mot crawlbara kanoniska källor.
        knowledge_source_target="training",
        action_type=ACTION_FIX_RECORD,
        target_channels=(CHANNEL_WIKIPEDIA, CHANNEL_PRESS, CHANNEL_RSS),
        why_template=(
            f"AI:s bild av er inom {dimension_label} har svalnat sedan {since}. "
            f"Något i informationsfloran har ändrats utåt — kanske ny negativ "
            f"press, kanske en gammal positiv källa som försvunnit ur cache."
        ),
        skeleton_text=(
            f"Undersök vad som ändrats kring {dimension_label} sedan {since}: "
            f"ny press, borttagen citatkälla, ny konkurrentposition. Återpublicera "
            f"proof points på kanoniska källor som AI re-indexerar. Lager B "
            f"föreslår var den ursprungliga signalen försvann."
        ),
        expected_impact_metric=METRIC_VALENCE,
        confidence=0.70,
    )


# Routing-tabell: gap-typ → regel. Stubbade typer (persona_mismatch,
# competitive_displacement) saknas — build_recipe_skeleton returnerar None
# för dem tills Fas 2.1 / Fas 4 lägger till regler.
_RULES: dict[str, Callable[[dict[str, Any], str], RecipeSkeleton]] = {
    "over_claim": _rule_over_claim,
    "opportunity": _rule_opportunity,
    "missing_evidence": _rule_missing_evidence,
    "contradiction": _rule_contradiction,
    "factual_drift": _rule_factual_drift,
}


def build_recipe_skeleton(flag: dict[str, Any]) -> RecipeSkeleton | None:
    """Returnera en deterministisk recept-skiss för en gap-flagga.

    None om gap-typen saknar regel (stubbade typer, eller okänd typ). Ingen LLM,
    inga sidoeffekter — pure function. Caller ansvarar för persistens (Fas 1.3c).
    """
    kind = flag.get("kind")
    dimension = flag.get("dimension")
    if not kind or not dimension:
        return None
    rule = _RULES.get(kind)
    if rule is None:
        return None
    dimension_label = hc.DIMENSIONS.get(dimension, dimension)
    return rule(flag, dimension_label)


def build_recipe_skeletons(flags: list[dict[str, Any]]) -> list[RecipeSkeleton]:
    """Bekvämlighetsversion: ta en lista flaggor och returnera alla giltiga skisser.

    Stubbade/okända typer hoppas över tyst — det är inte ett fel att en flagga
    saknar regel än, det är förväntat under Fas 1.3a för persona_mismatch +
    competitive_displacement.
    """
    out: list[RecipeSkeleton] = []
    for flag in flags:
        s = build_recipe_skeleton(flag)
        if s is not None:
            out.append(s)
    return out
