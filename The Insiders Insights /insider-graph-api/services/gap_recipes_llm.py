"""Receptmotor — Lager B: LLM-detaljifiering (Fas 1.3b, spec §10 punkt 5).

Tar ett RecipeSkeleton (Lager A) + RecipeContext (kund- + gap-data) och låter
en EU-Vertex-modell (geo_validator, Gemini 2.5 Pro) fylla i konkreta detaljer.
Output validas hårt mot skelettet: action_type, expected_impact_metric,
knowledge_source_target och target_channels är LÅSTA — LLM:n får bara
detaljifiera, aldrig byta strategi.

Filosofi (varför så strikt):
  Vi säljer ett mätsystem för förtroende, inte en LLM-genererad SEO-byrå. När
  vi släpper LLM:n lös på "vad ska kunden göra?" får olika kunder slumpvis
  olika strategi för samma gap-typ. Det skulle göra systemet okontrollerbart.
  Vi pinnar strategin i Lager A (regler) och låter LLM:n bara polera språket
  och välja vilken befintlig proof point som passar bäst.

Graceful degradation: om LLM:n tajmar eller faller → returnera DetailedRecipe
med details=None. Frontend (Fas 1.5) visar "detaljifiering pågår / misslyckad",
operatören får ändå skelettets why_template + skeleton_text.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from services import gap_recipes as gr
from services import llm as llm_factory
from services import model_registry

log = logging.getLogger(__name__)


SYSTEM_PROMPT = """Du detaljifierar ett RECEPT som ska stänga ett förtroendegap mellan vad ett företag säger om sig självt, vad det kan belägga, och hur AI-motorer beskriver det.

STRATEGIN ÄR REDAN BESLUTAD: gap-typen, action-typen, vilka kanaler som är giltiga, och vad som ska mätas — du får dessa som SKELETT-fält och får ALDRIG ändra dem. Din uppgift är att fylla i KONKRETA detaljer: en handlingsbar nästa-steg-beskrivning, vilka av kundens befintliga proof points som ska aktiveras, vilken kanal som ska prioriteras först och varför, vad framgång ser ut som, en kundanpassad why-text, och eventuella risker.

Returnera ENDAST ett JSON-objekt:
{
  "detailed_action": "1–3 meningar: vad ska göras konkret nu",
  "specific_proof_points": ["max 3 förslag på vilka existerande proof points som ska aktiveras; tom lista om kunden saknar relevanta"],
  "prioritized_channel": "EN av target_channels — du MÅSTE välja från den listan",
  "prioritized_channel_reason": "1 mening: varför just den kanalen först",
  "success_criteria": "1 mening: 'Du vet att det funkat när X händer/mäts'",
  "refined_why": "1–2 meningar: kundanpassad förklaring av varför gapet uppstår och varför detta recept addresserar det",
  "risks": ["max 3 punkter; saker att se upp för (anti-gaming, sidoeffekter); tom lista om inga uppenbara"]
}

Hårda regler:
- prioritized_channel MÅSTE vara med i skelettets target_channels. Annars är hela responsen ogiltig.
- Föreslå ALDRIG att fabricera, överdriva eller manipulera. Recept ska bara aktivera redan SANNA proof points.
- Skriv på SVENSKA.
- Returnera bara JSON-objektet, ingen annan text."""


def detailify(skeleton: gr.RecipeSkeleton, context: gr.RecipeContext) -> gr.DetailedRecipe:
    """Detaljifiera ett skelett mot kund-kontext. Graceful om LLM saknas/faller.

    Skelettet returneras alltid; bara details kan vara None. Persistens
    (Fas 1.3c) tar därefter beslut om hur recipeet hanteras vidare.
    """
    llm = _pick_detailifier()
    if llm is None:
        log.info("ingen detailifier konfigurerad — returnerar bart skelett för %s", skeleton.gap_type)
        return gr.DetailedRecipe(
            skeleton=skeleton,
            details=None,
            detailifier_model=_detailifier_model_name(),
            detailified_at=None,
        )

    user_payload = _build_user_payload(skeleton, context)
    data = llm_factory.invoke_json(llm, SYSTEM_PROMPT, user_payload)
    details = _parse_and_validate(data, skeleton)

    if details is None:
        log.warning(
            "detaljifiering för %s/%s misslyckades — returnerar bart skelett",
            context.client_id, skeleton.gap_type,
        )
        return gr.DetailedRecipe(
            skeleton=skeleton,
            details=None,
            detailifier_model=_detailifier_model_name(),
            detailified_at=None,
        )

    return gr.DetailedRecipe(
        skeleton=skeleton,
        details=details,
        detailifier_model=_detailifier_model_name(),
        detailified_at=datetime.now(timezone.utc).isoformat(),
    )


def detailify_batch(
    skeletons: list[gr.RecipeSkeleton], context_for: "callable",
) -> list[gr.DetailedRecipe]:
    """Bekvämlighetsversion för en lista skeletons. context_for(skeleton) → RecipeContext.

    Sekventiellt (LLM-anropet är dyrt; om vi behöver parallellt blir det Fas 1.3c-ärende).
    """
    return [detailify(s, context_for(s)) for s in skeletons]


# --- Internals ---------------------------------------------------------------


def _build_user_payload(skeleton: gr.RecipeSkeleton, context: gr.RecipeContext) -> str:
    """Konstruera user-payloaden — kompakt, fokuserad, JSON-fri (rå-text).

    LLM:n får skelettet som "DU FÅR INTE ÄNDRA"-block + kund-kontext som faktaunderlag.
    """
    lines: list[str] = []
    lines.append("=== DU FÅR INTE ÄNDRA ===")
    lines.append(f"gap_type: {skeleton.gap_type}")
    lines.append(f"dimension: {skeleton.dimension} ({skeleton.dimension_label})")
    lines.append(f"action_type: {skeleton.action_type}")
    lines.append(f"target_channels: {list(skeleton.target_channels)}")
    lines.append(f"knowledge_source_target: {skeleton.knowledge_source_target}")
    lines.append(f"expected_impact_metric: {skeleton.expected_impact_metric}")
    lines.append("")
    lines.append("=== SKELETT-VARFÖR (Lager A) ===")
    lines.append(skeleton.why_template)
    lines.append("")
    lines.append("=== SKELETT-FÖRSLAG (Lager A) ===")
    lines.append(skeleton.skeleton_text)
    lines.append("")
    lines.append("=== KUND ===")
    lines.append(f"company_name: {context.company_name}")
    lines.append("")
    lines.append("=== GAP-MÄTVÄRDEN ===")
    lines.append(f"declared (säger ni det?): {context.declared}")
    lines.append(f"demonstrated (kan ni belägga det?): {context.demonstrated:.2f}")
    if context.perceived_valence is not None:
        lines.append(f"AI-valens (hur varmt AI beskriver er): {context.perceived_valence:.2f}")
    if context.perceived_salience is not None:
        lines.append(f"AI-synlighet: {context.perceived_salience:.2f}")
    if context.extra:
        lines.append("")
        lines.append("=== ÖVRIG KONTEXT ===")
        for k, v in context.extra.items():
            lines.append(f"{k}: {v}")
    if context.available_proof_points:
        lines.append("")
        lines.append("=== TILLGÄNGLIGA PROOF POINTS (befintliga claims) ===")
        for i, pp in enumerate(context.available_proof_points[:10], 1):
            lines.append(f"P{i}: {pp}")
    return "\n".join(lines)


def _parse_and_validate(
    data: dict[str, Any] | None, skeleton: gr.RecipeSkeleton,
) -> gr.RecipeDetails | None:
    """Validera LLM-output mot skelettets låsningar. None om ogiltigt.

    Vi accepterar partiell data (saknade fält → tomma defaults) men inte ogiltig
    data (fel kanal, fel typ). Det är skillnaden mellan "modellen orkade inte"
    och "modellen försökte byta strategi".
    """
    if not isinstance(data, dict):
        return None

    prioritized = (data.get("prioritized_channel") or "").strip()
    if not prioritized:
        log.warning("LLM saknade prioritized_channel — använder första target_channel")
        prioritized = skeleton.target_channels[0] if skeleton.target_channels else ""
    elif prioritized not in skeleton.target_channels:
        # LLM:n försökte ändra strategin → avvisa hela detaljifieringen så
        # operatören får ett rent skelett att jobba från. Det är det säkraste
        # läget; aldrig acceptera en kanal vi inte sanktionerat.
        log.warning(
            "LLM föreslog ogiltig kanal '%s' för %s (giltiga: %s) — avvisar",
            prioritized, skeleton.gap_type, list(skeleton.target_channels),
        )
        return None

    detailed_action = (data.get("detailed_action") or "").strip()
    refined_why = (data.get("refined_why") or "").strip()
    success_criteria = (data.get("success_criteria") or "").strip()
    if not (detailed_action and refined_why and success_criteria):
        # Bottenkrav — utan dessa tre saknar receptet substans.
        return None

    proof_points = _safe_str_tuple(data.get("specific_proof_points"), max_items=3)
    risks = _safe_str_tuple(data.get("risks"), max_items=3)
    channel_reason = (data.get("prioritized_channel_reason") or "").strip()

    return gr.RecipeDetails(
        detailed_action=detailed_action,
        specific_proof_points=proof_points,
        prioritized_channel=prioritized,
        prioritized_channel_reason=channel_reason,
        success_criteria=success_criteria,
        refined_why=refined_why,
        risks=risks,
    )


def _safe_str_tuple(v: Any, *, max_items: int) -> tuple[str, ...]:
    if not isinstance(v, list):
        return ()
    out: list[str] = []
    for x in v[:max_items]:
        if isinstance(x, str) and x.strip():
            out.append(x.strip())
    return tuple(out)


def _detailifier_model_name() -> str:
    try:
        return model_registry.get_id("geo_validator")
    except KeyError:
        return "unknown"


# Module-level seam — testerna patchar denna för att injicera mock-LLM utan
# att rycka in Vertex-credentialerna.
def _pick_detailifier():
    return llm_factory.make_validator()
