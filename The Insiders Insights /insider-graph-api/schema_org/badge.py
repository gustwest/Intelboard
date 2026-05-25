"""Badge-snutt (lager 3) som kunden bäddar in på sin egen sajt.

Diskret, länkar till profilsidan. Riktar sig till människor. Två varianter
(docs/claims-provenance-spec.md §10):

  * statisk HTML (default) — ren `<a>` + inline-SVG, noll JS, CSP-säker
  * JS-snippet — injicerar samma markup via en `<script>` (en rad att klistra in)

Form: footer-länk (default) eller flytande pill. Tema ljust/mörkt + ev. accentfärg.
Badgen är alltid på; sanningen om status/färskhet lever på profilsidan, och en
central degrade-switch (framtida) hanterar det sällsynta dåliga läget.
"""
from __future__ import annotations

import html
import json

import firestore_client as fs
from schema_org.compiler import DEFAULT_BASE

LABEL = "AI-Profil verifierad av Geogiraph"

# Liten "verifierad"-bock, ärver färg via currentColor.
_CHECK_SVG = (
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" '
    'style="vertical-align:-2px;margin-right:5px" aria-hidden="true">'
    '<path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="2.2" '
    'stroke-linecap="round" stroke-linejoin="round"/>'
    '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/></svg>'
)

_THEMES = {
    "light": {"bg": "#ffffff", "fg": "#444444", "border": "#e5e5e5", "accent": "#2563eb"},
    "dark": {"bg": "#1a1a1a", "fg": "#dddddd", "border": "#333333", "accent": "#6ea8fe"},
}


def profile_url(client_id: str) -> str:
    data = fs.client_doc(client_id).get().to_dict() or {}
    return (data.get("profile_base_url") or f"{DEFAULT_BASE}/{client_id}").rstrip("/")


def render_badge(
    client_id: str,
    *,
    theme: str = "light",
    accent: str | None = None,
    variant: str = "footer",
    url: str | None = None,
) -> str:
    """Statisk HTML-snutt. `variant`: "footer" (inline) eller "pill" (flytande)."""
    t = dict(_THEMES.get(theme, _THEMES["light"]))
    if accent:
        t["accent"] = accent
    href = html.escape(url or profile_url(client_id))

    base_css = (
        f"display:inline-flex;align-items:center;gap:0;"
        f"font-family:-apple-system,system-ui,sans-serif;font-size:13px;line-height:1;"
        f"text-decoration:none;color:{t['fg']};background:{t['bg']};"
        f"border:1px solid {t['border']};border-radius:999px;padding:7px 13px;"
    )
    if variant == "pill":
        base_css += "position:fixed;right:16px;bottom:16px;z-index:9999;box-shadow:0 2px 8px rgba(0,0,0,.12);"

    icon = f'<span style="color:{t["accent"]}">{_CHECK_SVG}</span>'
    return (
        f'<a href="{href}" target="_blank" rel="noopener" '
        f'data-geogiraph-badge="{html.escape(client_id)}" '
        f'aria-label="{LABEL}" title="{LABEL}" style="{base_css}">'
        f'{icon}{LABEL}</a>'
    )


def render_badge_js(client_id: str, **kwargs) -> str:
    """JS-snippet som injicerar badgen där scriptet står (en rad att klistra in)."""
    snippet = render_badge(client_id, **kwargs)
    payload = json.dumps(snippet)
    return (
        "<script>(function(){var s=document.currentScript;"
        "var d=document.createElement('div');d.innerHTML=" + payload + ";"
        "(s&&s.parentNode?s.parentNode.insertBefore(d.firstChild,s):"
        "document.body.appendChild(d.firstChild));})();</script>"
    )
