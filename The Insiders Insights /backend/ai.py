"""AI utilities — Gemini 3 Flash for dataset analysis.

Uses google-genai SDK with Vertex AI authentication (already available
via Cloud Run's default service account).
"""
import os
from typing import Optional

import pandas as pd

from logging_config import log

# --------------- Lazy client init ---------------
_client = None


def _get_client():
    global _client
    if _client is None:
        from google import genai
        # On Cloud Run, K_SERVICE is always set — use Vertex AI with default service account
        is_cloud_run = bool(os.environ.get("K_SERVICE"))
        project = os.environ.get("GOOGLE_CLOUD_PROJECT", "round-plating-480321-j7")

        if is_cloud_run or os.environ.get("GOOGLE_GENAI_USE_VERTEXAI"):
            _client = genai.Client(
                vertexai=True,
                project=project,
                location="global",  # gemini-3-flash-preview needs global endpoint
            )
        elif os.environ.get("GEMINI_API_KEY"):
            _client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
        else:
            log.warn("ai.no_credentials", msg="No Gemini credentials found. Skipping.")
            return None
    return _client


MODEL = "gemini-3-flash-preview"

SYSTEM_PROMPT = """Du är en dataanalytiker som arbetar för en LinkedIn-marknadsföringsbyrå.
Du får en sammanfattning av ett nyuppladdat dataset. Skriv en kort, insiktsfull sammanfattning på SVENSKA (2-4 meningar).

Regler:
- Beskriv vad datasetet innehåller (typ av rapport, tidsperiod om möjligt)
- Lyft fram 1-2 nyckeltal eller intressanta mönster
- Om det finns numeriska kolumner, nämn totaler eller snitt för de viktigaste
- Var koncis — max 100 ord
- Svara ENBART med sammanfattningstexten, inga rubriker eller markdown"""


def _build_data_summary(df: pd.DataFrame, filename: str, source_name: str) -> str:
    """Build a compact text summary of the dataframe for the AI prompt."""
    lines = [
        f"Filnamn: {filename}",
        f"Källa: {source_name}",
        f"Antal rader: {len(df)}",
        f"Kolumner ({len(df.columns)}): {', '.join(str(c) for c in df.columns[:30])}",
    ]

    # Add sample stats for numeric columns
    numeric = df.select_dtypes(include=["number"])
    if not numeric.empty:
        lines.append("\nNumeriska kolumner (min / medel / max):")
        for col in numeric.columns[:10]:
            try:
                s = numeric[col].dropna()
                if len(s) > 0:
                    lines.append(f"  {col}: {s.min():.1f} / {s.mean():.1f} / {s.max():.1f}")
            except Exception:
                pass

    # Add date range if any date-like columns
    for col in df.columns:
        try:
            dates = pd.to_datetime(df[col], errors="coerce").dropna()
            if len(dates) > len(df) * 0.5:  # at least half are valid dates
                lines.append(f"\nTidsperiod ({col}): {dates.min().date()} → {dates.max().date()}")
                break
        except Exception:
            pass

    # First 3 rows as sample
    lines.append(f"\nFörsta 3 rader:")
    sample = df.head(3).to_string(index=False, max_colwidth=40)
    lines.append(sample)

    return "\n".join(lines)


def summarize_dataset(
    df: pd.DataFrame,
    filename: str,
    source_name: str,
) -> Optional[str]:
    """Generate an AI summary for an uploaded dataset. Returns None on failure."""
    client = _get_client()
    if client is None:
        return None

    try:
        from google.genai import types

        data_summary = _build_data_summary(df, filename, source_name)
        prompt = f"Analysera detta dataset och skriv en sammanfattning:\n\n{data_summary}"

        response = client.models.generate_content(
            model=MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                temperature=1.0,
                max_output_tokens=300,
                thinking_config=types.ThinkingConfig(thinking_level="minimal"),
            ),
        )

        summary = response.text.strip() if response.text else None
        log.info("ai.summary_generated", filename=filename, length=len(summary) if summary else 0)
        return summary

    except Exception as e:
        log.warn("ai.summary_failed", filename=filename, error=str(e))
        return None
