"""AI Assistant chat — context-aware Gemini-powered chat for platform users.

Builds dynamic context from the database (customer data, datasets, modules,
goals, notes) and sends it to Gemini alongside the user's question.
"""
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

import models
from db import get_db
from logging_config import log

router = APIRouter(tags=["ai_chat"])


# ------------------------------------------------------------------
# Request / response schemas
# ------------------------------------------------------------------
class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    customer_id: Optional[str] = None
    page_context: Optional[str] = None  # e.g. "customer_detail", "sources", "modules"


class ChatResponse(BaseModel):
    session_id: str
    reply: str
    context_used: List[str]  # what context was injected


# ------------------------------------------------------------------
# Platform knowledge — baked into system prompt
# ------------------------------------------------------------------
PLATFORM_KNOWLEDGE = """
## Om The Insiders Insights

The Insiders Insights är en SaaS-plattform byggd för LinkedIn-marknadsföringsbyråer.
Plattformen hjälper byråer att samla in, analysera och rapportera på sina kunders
LinkedIn-kampanjer och organiska aktivitet.

### Nyckelbegrepp

**Kund (Customer)**: Ett företag som byrån arbetar med. Varje kund har egna datasets,
moduler, mål och anteckningar.

**Källa (Source)**: En typ av rapport/data, t.ex. "LinkedIn Campaign Manager" eller
"LinkedIn Page Analytics". Varje källa har definierade fält (kolumner) och versioner.

**Dataset**: En uppladdad datafil kopplad till en kund och källa. Varje dataset har:
- **Granularitet**: Hur finfördelad datan är (daglig, veckovis, månatlig, kvartalsvis, årsvis, aggregerad)
- **Period**: Vilken tidsperiod datan täcker (period_start → period_end)
- **AI-sammanfattning**: En automatgenererad kort analys av datasetet

**Modul**: En KPI-definition med formel, tröskelvärden (röd/gul/grön) och visualisering.
Moduler kan vara globala (gäller alla kunder) eller kundspecifika.
Moduler beräknar KPI:er baserat på data från datasets.

**Mål (Goal)**: Ett konkret mål kopplat till en KPI-modul, med målvärde och måldatum.

**Granularitet & Överlappning**: När en kund har flera rapporter med olika detaljnivåer
(t.ex. daglig + månadsrapport) för samma period, väljer dashboarden automatiskt
den finaste granulariteten för att undvika dubbelräkning.

### Plattformens sidor

- **Kunder** (/kunder): Lista alla kunder, deras datasets och moduler
- **Sources** (/sources): Hantera datakällor och deras kolumndefinitioner
- **Moduler** (/moduler): Skapa och hantera KPI-moduler med formler
- **Rapporter** (/rapporter): Generera PDF-rapporter för kunder
- **Dashboard**: Aggregerad vy med diagram, trender och KPI:er per kund
- **Loggar** (/loggar): Systemloggar för felsökning
- **Admin** (/admin): Adminpanel med agentverktyg och filhantering

### Vanliga LinkedIn-mätvärden

- **Impressions**: Antal gånger innehåll visats
- **Clicks**: Antal klick på innehåll
- **CTR (Click-Through Rate)**: Klick / Visningar i procent
- **Engagement Rate**: Totalt engagemang / Visningar
- **Follows**: Nya följare
- **Reactions**: Gilla, fira, stöd etc.
- **Shares**: Antal delningar
- **Video Views**: Antal videovisningar
- **Spend / Total Spent**: Annonskostnad
- **CPC (Cost Per Click)**: Kostnad per klick
- **CPM (Cost Per Mille)**: Kostnad per 1000 visningar
"""


# ------------------------------------------------------------------
# Context builder — assembles relevant data from DB
# ------------------------------------------------------------------
def _build_context(db: Session, customer_id: Optional[str], page_context: Optional[str]) -> tuple[str, list[str]]:
    """Build contextual information for the AI based on current page and customer."""
    sections = []
    context_labels = []

    # Customer-specific context
    if customer_id:
        customer = db.query(models.Customer).filter(
            (models.Customer.id == customer_id) | (models.Customer.slug == customer_id)
        ).first()

        if customer:
            context_labels.append(f"customer:{customer.name}")
            sections.append(f"\n## Aktuell kund: {customer.name}")
            sections.append(f"- ID: {customer.id}")
            sections.append(f"- Slug: {customer.slug}")
            if customer.tags:
                sections.append(f"- Taggar: {', '.join(customer.tags or [])}")

            # Datasets
            datasets = (
                db.query(models.Dataset)
                .options(joinedload(models.Dataset.source))
                .filter_by(customer_id=customer.id)
                .order_by(models.Dataset.uploaded_at.desc())
                .limit(20)
                .all()
            )
            if datasets:
                context_labels.append(f"datasets:{len(datasets)}")
                sections.append(f"\n### Datasets ({len(datasets)} st)")
                for d in datasets:
                    line = f"- **{d.original_filename}** ({d.source.name}) — {d.row_count} rader"
                    if d.granularity:
                        line += f", granularitet: {d.granularity}"
                    if d.period_start and d.period_end:
                        line += f", period: {d.period_start} → {d.period_end}"
                    if d.ai_summary:
                        line += f"\n  AI-sammanfattning: {d.ai_summary[:200]}"
                    sections.append(line)

            # Modules
            modules = (
                db.query(models.Module)
                .filter(
                    (models.Module.customer_id == customer.id) |
                    (models.Module.customer_id == None)  # noqa: E711
                )
                .all()
            )
            if modules:
                context_labels.append(f"modules:{len(modules)}")
                sections.append(f"\n### Moduler ({len(modules)} st)")
                for m in modules:
                    scope = "Global" if not m.customer_id else "Kundspecifik"
                    sections.append(f"- **{m.name}** ({m.abbr}) — {scope}")
                    if m.description:
                        sections.append(f"  Beskrivning: {m.description[:150]}")
                    if m.formula_json:
                        sections.append(f"  Formel: {str(m.formula_json)[:150]}")
                    if m.thresholds_json:
                        sections.append(f"  Tröskelvärden: {str(m.thresholds_json)[:100]}")

            # Goals
            goals = db.query(models.CustomerGoal).filter_by(customer_id=customer.id).all()
            if goals:
                context_labels.append(f"goals:{len(goals)}")
                sections.append(f"\n### Mål ({len(goals)} st)")
                for g in goals:
                    mod = db.query(models.Module).filter_by(id=g.module_id).first()
                    mod_name = mod.name if mod else "Okänd"
                    sections.append(f"- **{g.label}** ({mod_name}): mål={g.target_value}, nuvarande={g.current_value}, status={g.status}")

            # Notes
            notes = db.query(models.Note).filter_by(customer_id=customer.id).order_by(models.Note.updated_at.desc()).limit(10).all()
            if notes:
                context_labels.append(f"notes:{len(notes)}")
                sections.append(f"\n### Anteckningar ({len(notes)} st)")
                for n in notes:
                    sections.append(f"- **{n.title}**: {(n.body or '')[:150]}")

    # Page-specific context
    if page_context == "sources":
        sources = db.query(models.Source).all()
        if sources:
            context_labels.append(f"sources:{len(sources)}")
            sections.append(f"\n## Tillgängliga källor ({len(sources)} st)")
            for s in sources:
                sections.append(f"- **{s.name}** (key: {s.key}, plattform: {s.platform or 'ej angiven'})")

    elif page_context == "modules" and not customer_id:
        modules = db.query(models.Module).all()
        if modules:
            context_labels.append(f"all_modules:{len(modules)}")
            sections.append(f"\n## Alla moduler ({len(modules)} st)")
            for m in modules:
                scope = "Global" if not m.customer_id else f"Kund: {m.customer_id[:8]}"
                sections.append(f"- **{m.name}** ({m.abbr}) — {scope}")

    return "\n".join(sections), context_labels


# ------------------------------------------------------------------
# Build conversation history for Gemini
# ------------------------------------------------------------------
def _get_history(db: Session, session_id: str, limit: int = 20) -> list[dict]:
    """Load recent messages from this session for multi-turn context."""
    msgs = (
        db.query(models.AIChatMessage)
        .filter_by(session_id=session_id)
        .order_by(models.AIChatMessage.created_at.desc())
        .limit(limit)
        .all()
    )
    # Reverse to chronological order
    msgs.reverse()
    return [{"role": m.role, "content": m.content} for m in msgs]


# ------------------------------------------------------------------
# Main endpoint
# ------------------------------------------------------------------
@router.post("/api/ai/chat", response_model=ChatResponse)
def ai_chat(req: ChatRequest, db: Session = Depends(get_db)):
    """Send a message to the AI assistant with dynamic platform context."""
    from ai import _get_client, MODEL

    session_id = req.session_id or str(uuid.uuid4())

    # Build dynamic context
    dynamic_context, context_labels = _build_context(db, req.customer_id, req.page_context)

    system_prompt = f"""{PLATFORM_KNOWLEDGE}

{dynamic_context}

---

## Instruktioner

Du är "Insiders AI", en hjälpsam assistent för The Insiders Insights-plattformen.

Regler:
1. Svara alltid på SVENSKA
2. Var koncis men informativ (max 300 ord om möjligt)
3. Använd markdown-formatering (fetstil, listor, rubriker) för läsbarhet
4. Om du refererar till data, ange källa (dataset-namn, modulnamn etc.)
5. Om användaren frågar om att skapa något (modul, mål etc.) — förklara vad du föreslår och be om bekräftelse
6. Om du inte vet svaret — var ärlig och föreslå var användaren kan hitta informationen
7. Om användaren nämner specifika KPI:er, koppla dem till rätt LinkedIn-mätvärden
8. Du kan svara på frågor om alla aspekter av plattformen, inklusive tekniska detaljer
"""

    # Get conversation history
    history = _get_history(db, session_id)

    # Save user message
    user_msg = models.AIChatMessage(
        session_id=session_id,
        role="user",
        content=req.message,
        customer_id=req.customer_id,
        page_context=req.page_context,
    )
    db.add(user_msg)
    db.flush()

    # Call Gemini
    client = _get_client()
    if client is None:
        reply = "⚠️ AI-tjänsten är inte tillgänglig just nu. Kontrollera att Gemini-konfigurationen är korrekt."
    else:
        try:
            from google.genai import types

            # Build conversation contents for multi-turn
            contents = []
            for h in history[-16:]:  # Last 16 messages for context window
                contents.append(types.Content(
                    role=h["role"] if h["role"] != "assistant" else "model",
                    parts=[types.Part.from_text(text=h["content"])],
                ))
            # Add current message
            contents.append(types.Content(
                role="user",
                parts=[types.Part.from_text(text=req.message)],
            ))

            response = client.models.generate_content(
                model=MODEL,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    temperature=1.0,
                    max_output_tokens=1500,
                    thinking_config=types.ThinkingConfig(thinking_level="low"),
                ),
            )
            reply = response.text.strip() if response.text else "Jag kunde tyvärr inte generera ett svar. Försök igen!"
            log.info("ai_chat.response", session_id=session_id, length=len(reply), context=context_labels)

        except Exception as e:
            log.warn("ai_chat.error", session_id=session_id, error=str(e))
            reply = f"⚠️ Ett fel uppstod: {str(e)[:200]}"

    # Save assistant reply
    ai_msg = models.AIChatMessage(
        session_id=session_id,
        role="assistant",
        content=reply,
        customer_id=req.customer_id,
        page_context=req.page_context,
    )
    db.add(ai_msg)
    db.commit()

    return ChatResponse(
        session_id=session_id,
        reply=reply,
        context_used=context_labels,
    )


# ------------------------------------------------------------------
# Session history endpoint
# ------------------------------------------------------------------
@router.get("/api/ai/chat/{session_id}")
def get_chat_history(session_id: str, db: Session = Depends(get_db)):
    """Get all messages for a chat session."""
    msgs = (
        db.query(models.AIChatMessage)
        .filter_by(session_id=session_id)
        .order_by(models.AIChatMessage.created_at.asc())
        .all()
    )
    return [
        {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "created_at": m.created_at.isoformat(),
        }
        for m in msgs
    ]
