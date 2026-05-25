"""Statisk profilsida (lager 2) ur samma render-modell som JSON-LD.

Renderar nivå-2-proveniens: faktapanel, prosa med superscript-fotnoter (ankrad
lista + hover-popover via title), aggregerad källförteckning och trust-rad.
Manuella claims renderas som neutral etikett i stället för klickbar fotnot.

Sidan är självständig statisk HTML (inline CSS, ingen JS för datan) och bäddar in
JSON-LD-grafen — crawl-vänlig enligt docs/claims-provenance-spec.md §7.
"""
from __future__ import annotations

import html
import json
from datetime import datetime

from schema_org.compiler import RenderModel, build_render_model, compile_client

# schema.org-predikat → svensk etikett i faktapanelen.
_FACT_LABELS = {
    "foundingDate": "Grundat",
    "address": "Säte",
    "knowsAbout": "Verksamhet",
    "identifier": "Organisationsnummer",
    "numberOfEmployees": "Antal anställda",
}

_MONTHS_SV = [
    "januari", "februari", "mars", "april", "maj", "juni",
    "juli", "augusti", "september", "oktober", "november", "december",
]


def render_profile_html(client_id: str) -> str:
    model = build_render_model(client_id)
    graph = compile_client(client_id)
    return _render(model, graph)


def _render(model: RenderModel, graph: dict) -> str:
    name = html.escape(model.company_name or model.client_id)
    jsonld = json.dumps(graph, ensure_ascii=False, default=str)

    facts_html = "\n".join(_fact_row(f) for f in model.facts)
    prose_html = "".join(_prose_sentence(p) for p in model.prose).strip()
    sources_html = "\n".join(_source_item(s) for s in model.sources)
    trust = _trust_line(model)

    return f"""<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{name} — AI-profil</title>
<script type="application/ld+json">{jsonld}</script>
<style>
  body {{ font-family: -apple-system, system-ui, sans-serif; max-width: 720px;
         margin: 0 auto; padding: 2rem 1.25rem; color: #1a1a1a; line-height: 1.6; }}
  h1 {{ font-size: 1.6rem; margin-bottom: .25rem; }}
  .trust {{ color: #555; font-size: .85rem; margin-bottom: 1.5rem; }}
  .facts {{ border: 1px solid #e5e5e5; border-radius: 10px; padding: .5rem 1rem; margin: 1.25rem 0; }}
  .facts dl {{ display: grid; grid-template-columns: 11rem 1fr; gap: .35rem 1rem; margin: .5rem 0; }}
  .facts dt {{ color: #666; }}
  .facts dd {{ margin: 0; }}
  sup a {{ color: #2563eb; text-decoration: none; font-size: .7em; padding: 0 .1em; }}
  .manual {{ color: #888; font-size: .8em; font-style: italic; white-space: nowrap; }}
  .sources {{ margin-top: 2rem; border-top: 1px solid #e5e5e5; padding-top: 1rem; font-size: .9rem; }}
  .sources ol {{ padding-left: 1.25rem; color: #555; }}
  .sources a {{ color: #2563eb; }}
  footer {{ margin-top: 2rem; font-size: .75rem; color: #999; }}
</style>
</head>
<body>
<h1>{name}</h1>
<p class="trust">{trust}</p>

<section class="facts">
<dl>
{facts_html}
</dl>
</section>

<section class="about">
<p>{prose_html}</p>
</section>

<section class="sources">
<h2 style="font-size:1rem">Källor</h2>
<ol>
{sources_html}
</ol>
</section>

<footer>AI-Profil verifierad av Geogiraph.</footer>
</body>
</html>
"""


def _fact_row(fact) -> str:
    label = html.escape(_FACT_LABELS.get(fact.predicate, fact.predicate))
    value = fact.value
    text = ", ".join(str(v) for v in value) if isinstance(value, list) else str(value)
    return f"  <dt>{label}</dt><dd>{html.escape(text)}{_marks(fact)}</dd>"


def _prose_sentence(prose) -> str:
    sentence = html.escape(prose.statement.rstrip("."))
    return f"{sentence}{_marks(prose)}. "


def _marks(entry) -> str:
    """Fotnots-superscripts för item-källor + neutral etikett för manuell källa."""
    out = ""
    for n in entry.footnotes:
        out += f'<sup><a href="#src-{n}" title="Källa {n}">[{n}]</a></sup>'
    if entry.manual_label:
        out += f' <span class="manual">({html.escape(entry.manual_label)})</span>'
    return out


def _source_item(source) -> str:
    label = html.escape(source.name or source.url or f"Källa {source.number}")
    date = f" · {_fmt_date(source.date)}" if source.date else ""
    inner = f'<a href="{html.escape(source.url)}">{label}</a>' if source.url else label
    return f'  <li id="src-{source.number}">{inner}{date}</li>'


def _trust_line(model: RenderModel) -> str:
    n = len(model.sources)
    parts = [f"Sammanställd från {n} {'källa' if n == 1 else 'källor'}"]
    if model.last_updated:
        parts.append(f"senast uppdaterad {_fmt_date(model.last_updated)}")
    return " · ".join(parts)


def _fmt_date(iso: str | None) -> str:
    if not iso:
        return ""
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return f"{_MONTHS_SV[dt.month - 1]} {dt.year}"
    except (ValueError, TypeError):
        return iso[:10]
