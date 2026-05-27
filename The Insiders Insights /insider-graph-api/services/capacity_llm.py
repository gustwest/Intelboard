"""LLM-extraktion av kompetenser ur PDF/bild-underlag (LinkedIn-kapacitet).

Komplement till services/capacity_parse (deterministisk CSV/XLSX). För dokument som
inte är tabulära läser vi innehållet med en resonemangsmodell:

- **PDF** → text via pypdf → Gemini extraherar de aggregerade kompetenserna.
- **Bild (skärmklipp)** → multimodalt Gemini-anrop (vision).

**EU-only:** körs via Vertex AI Gemini i EU-region (samma make_generator som
claims-pipelinen) — ingen US-väg. Saknas GCP-projekt blir det no-op ({}). Resultatet
förfylls i snapshottet och verifieras alltid manuellt i Granska. Får aldrig fälla
uppladdningen — vid fel returneras {} och filen blir bara underlag.
"""
from __future__ import annotations

import base64
import json
import logging
import re
from typing import Any

from services import llm

log = logging.getLogger(__name__)

_SYSTEM = (
    "Du extraherar ett BOLAGS aggregerade kompetensstatistik ur ett uppladdat underlag "
    "(t.ex. LinkedIn-export eller skärmklipp). Returnera ENDAST JSON på formen "
    '{"skills": ["kompetens", ...], "followers": <heltal eller null>}. '
    "Ta bara med aggregerade kompetenser/färdigheter — ALDRIG personnamn eller annan persondata. "
    "Högst 200 kompetenser. Hittar du inget, returnera {\"skills\": []}."
)
_USER = "Extrahera de aggregerade kompetenserna (och ev. totalt följarantal) ur underlaget."

_MAX_CHARS = 12000
_MAX_PAGES = 8


def extract(filename: str | None, content_type: str | None, content: bytes) -> dict[str, Any]:
    """{"skills": [...], "followers": int} ur PDF/bild; {} för andra typer eller vid fel."""
    name = (filename or "").lower()
    ctype = (content_type or "").lower()
    is_pdf = name.endswith(".pdf") or "pdf" in ctype
    is_image = name.endswith((".png", ".jpg", ".jpeg", ".webp")) or ctype.startswith("image/")
    if not (is_pdf or is_image):
        return {}

    model = llm.make_generator()  # Gemini Flash via Vertex AI EU
    if model is None:
        log.warning("capacity_llm: ingen EU-modell tillgänglig — hoppar över extraktion")
        return {}

    try:
        if is_pdf:
            text = _pdf_text(content)
            if not text.strip():
                return {}
            data = llm.invoke_json(model, _SYSTEM, f"{_USER}\n\n---\n{text[:_MAX_CHARS]}")
        else:
            data = _ask_image(model, content, ctype or "image/png")
    except Exception as exc:  # noqa: BLE001 — extraktion får aldrig fälla uppladdningen
        log.warning("capacity_llm-extraktion misslyckades: %s", exc)
        return {}

    return _clean(data)


def _pdf_text(content: bytes) -> str:
    from io import BytesIO

    from pypdf import PdfReader

    reader = PdfReader(BytesIO(content))
    parts = [(page.extract_text() or "") for page in reader.pages[:_MAX_PAGES]]
    return "\n".join(parts)


def _ask_image(model: Any, content: bytes, mime: str) -> dict[str, Any] | None:
    from langchain_core.messages import HumanMessage, SystemMessage

    b64 = base64.b64encode(content).decode()
    msg = HumanMessage(
        content=[
            {"type": "text", "text": _USER},
            {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
        ]
    )
    resp = model.invoke([SystemMessage(content=_SYSTEM), msg])
    raw = resp.content if hasattr(resp, "content") else str(resp)
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None


def _clean(data: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(data, dict):
        return {}
    out: dict[str, Any] = {}
    skills = data.get("skills")
    if isinstance(skills, list):
        seen: set[str] = set()
        cleaned: list[str] = []
        for s in skills:
            t = str(s).strip()
            if t and len(t) <= 60 and t.lower() not in seen:
                seen.add(t.lower())
                cleaned.append(t)
        if cleaned:
            out["skills"] = cleaned[:200]
    followers = data.get("followers")
    if isinstance(followers, (int, float)) and followers >= 0:
        out["followers"] = int(followers)
    return out
