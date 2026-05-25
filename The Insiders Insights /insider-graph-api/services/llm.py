"""Delad LLM-fabrik för claims-pipelinen (hybrid-setup).

Två roller, två modeller (docs/website-connector-spec.md, rekommendation):

  * generator  — generering + relevansgrindning. Stort kontextfönster (Gemini 3.1
                 Pro) sväljer hela korpusen i ett anrop.
  * validator  — det precisionskritiska valideringssteget. Vassaste resonemanget
                 (Claude Opus 4.7); korta anrop → dyr modell kostar ändå minimalt.

Provider-SDK:erna importeras lazy så modulen kan importeras även där en provider
saknas. Saknas alla nycklar returnerar fabriken None → pipelinen blir no-op men
kraschar inte. Modellsträngar kommer från settings (konfig-överstyrbart).
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from config import settings

log = logging.getLogger(__name__)


def make_generator():
    """Stort-kontext-modell för generering/relevans. Gemini → OpenAI → None."""
    if settings.gemini_api_key:
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(
            google_api_key=settings.gemini_api_key,
            model=settings.generator_model,
            temperature=0,
            timeout=60,
        )
    if settings.openai_api_key:
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(api_key=settings.openai_api_key, model="gpt-5", temperature=0, timeout=60)
    return None


def make_validator():
    """Vasst resonemang för validering. Anthropic → generator-fallback."""
    if settings.anthropic_api_key:
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(
            api_key=settings.anthropic_api_key,
            model=settings.validator_model,
            temperature=0,
            timeout=30,
        )
    # Ingen Anthropic-nyckel: validera med generatorn hellre än att hoppa över
    # valideringen (säkrare än att släppa igenom ovaliderade claims).
    return make_generator()


def invoke_json(llm, system: str, user: str) -> dict[str, Any] | None:
    """Anropa LLM och plocka ut det första JSON-objektet. None vid fel."""
    from langchain_core.messages import HumanMessage, SystemMessage

    try:
        resp = llm.invoke([SystemMessage(content=system), HumanMessage(content=user)])
        raw = resp.content if hasattr(resp, "content") else str(resp)
    except Exception as exc:  # blockering / timeout: logga, hoppa över
        log.warning("LLM call failed: %s", exc)
        return None
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
