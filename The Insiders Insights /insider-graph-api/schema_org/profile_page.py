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

from schema_org import i18n
from schema_org.compiler import RenderModel, build_faq, build_render_model, compile_client


def render_profile_html(client_id: str) -> str:
    model = build_render_model(client_id)
    graph = compile_client(client_id)
    return _render(model, graph)


def render_llms_txt(client_id: str) -> str:
    """Markdown-summering enligt llms.txt-konventionen — en ren, faktatät vy som
    AI-crawlers kan läsa direkt. Allt härlett ur samma claims (källförsett)."""
    model = build_render_model(client_id)
    loc = i18n.strings(model.language)
    name = model.company_name or model.client_id

    lines = [f"# {name}", ""]
    # Front-loadad ledmening (A3) som summering överst; faller tillbaka på prosan.
    summary = model.lead or model.description
    if summary:
        lines += [f"> {summary}", ""]
    lines += [f"{loc['verified_by']}. {_trust_line(model)}.", ""]

    if model.facts:
        lines.append(loc["llms_facts"])
        for f in model.facts:
            label = loc["fact_labels"].get(f.predicate, f.predicate)
            value = ", ".join(str(v) for v in f.value) if isinstance(f.value, list) else str(f.value)
            lines.append(f"- {label}: {value}")
        lines.append("")

    if model.job_postings:
        lines.append(loc["llms_roles"])
        for jp in model.job_postings:
            skills = f" — {', '.join(jp.skills)}" if jp.skills else ""
            lines.append(f"- {jp.title or loc['role_fallback']}{skills}")
        lines.append("")

    # Persona-sektioner (Fas 2.1f): gruppera persona-taggade claims under tydliga
    # rubriker ("## För kunder", "## För anställda & kandidater"). Web_rag-motorer
    # (Perplexity) läser strukturen och citerar rätt sektion vid persona-laddad
    # query. Evergreen-claims (tom audience) ligger kvar i description/fakta ovan.
    lines += _audience_sections(model)

    faq = build_faq(model)
    if faq:
        lines.append(loc["llms_faq"])
        for e in faq:
            lines += [f"### {e.question}", e.answer, ""]

    if model.sources:
        lines.append(loc["llms_sources"])
        for s in model.sources:
            label = s.name or s.url or loc["source_fallback"].format(n=s.number)
            date = f" ({_fmt_date(s.date, loc)})" if s.date else ""
            link = f"[{label}]({s.url})" if s.url else label
            lines.append(f"- {link}{date}")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def _audience_sections(model: RenderModel) -> list[str]:
    """Bygg markdown-sektioner per persona ur persona-taggade claims (Fas 2.1f).

    Samlar både facts och prose vars audience-fält nämner en persona. En claim som
    är taggad för flera personor visas under varje relevant rubrik (medveten
    redundans — varje persona-sektion ska vara självständigt läsbar för en motor
    som zoomat in på just den målgruppen). Tom = inga sektioner (allt evergreen).
    """
    from services import persona_registry as pr

    loc = i18n.strings(model.language)
    # Persona-id → lista av claim-texter (facts + prose) taggade för den personan.
    by_persona: dict[str, list[str]] = {}
    for f in model.facts:
        text = f.statement or f"{f.predicate}: {_fact_value_text(f.value)}"
        for pid in getattr(f, "audience", None) or []:
            by_persona.setdefault(pid, []).append(text)
    for p in model.prose:
        for pid in getattr(p, "audience", None) or []:
            by_persona.setdefault(pid, []).append(p.statement)

    if not by_persona:
        return []

    out: list[str] = []
    # Registry-ordning för stabil rendering.
    for persona in pr.all_personas():
        texts = by_persona.get(persona.id)
        if not texts:
            continue
        out.append("## " + loc["audience_heading"].format(persona=persona.label_sv.lower()))
        # Dedup inom sektionen (samma claim kan ha mergeats in flera gånger).
        seen: set[str] = set()
        for t in texts:
            key = t.strip()
            if key and key not in seen:
                seen.add(key)
                out.append(f"- {t}")
        out.append("")
    return out


def _fact_value_text(value) -> str:
    return ", ".join(str(v) for v in value) if isinstance(value, list) else str(value)


def _audience_sections_html(model: RenderModel, by_number) -> str:
    """A7: persona-sektioner i HTML — spegling av llms.txt:s `_audience_sections`.

    Grupperar persona-taggade facts + prose under "För {persona}"-rubriker med synlig
    källattribution (A2). Samma medvetna redundans (en claim taggad för flera personor
    visas under varje). Tom sträng om inga persona-taggade claims (allt evergreen)."""
    from services import persona_registry as pr

    loc = i18n.strings(model.language)
    # persona_id → lista av (dedup-nyckel, html-fragment).
    by_persona: dict[str, list[tuple[str, str]]] = {}
    for f in model.facts:
        for pid in getattr(f, "audience", None) or []:
            label = loc["fact_labels"].get(f.predicate, f.predicate)
            item = f"{html.escape(label)}: {html.escape(_fact_value_text(f.value))}{_evidence(f, by_number, loc)}"
            by_persona.setdefault(pid, []).append((f"{label}:{_fact_value_text(f.value)}", item))
    for p in model.prose:
        for pid in getattr(p, "audience", None) or []:
            item = f"{html.escape(p.statement.rstrip('.'))}{_evidence(p, by_number, loc)}"
            by_persona.setdefault(pid, []).append((p.statement.strip(), item))

    if not by_persona:
        return ""

    out: list[str] = []
    for persona in pr.all_personas():  # registry-ordning för stabil rendering
        entries = by_persona.get(persona.id)
        if not entries:
            continue
        seen: set[str] = set()
        lis: list[str] = []
        for key, item in entries:
            k = key.strip().lower()
            if k and k not in seen:
                seen.add(k)
                lis.append(f"<li>{item}</li>")
        if lis:
            heading = html.escape(loc["audience_heading"].format(persona=persona.label_sv.lower()))
            out.append(
                f'<section class="audience"><h2>{heading}</h2>'
                f'<ul>{"".join(lis)}</ul></section>'
            )
    return "\n".join(out)


def _render(model: RenderModel, graph: dict) -> str:
    loc = i18n.strings(model.language)
    name = html.escape(model.company_name or model.client_id)
    jsonld = json.dumps(graph, ensure_ascii=False, default=str)
    canonical = html.escape(model.base)
    # Front-loadad ledmening (A3) i meta/OG: citerbar, självständig — inte en
    # trunkerad prosa-dump. Faller tillbaka på description, sedan generisk text.
    fallback_desc = loc["desc_fallback"].format(name=model.company_name or model.client_id)
    desc = html.escape((model.lead or model.description or fallback_desc)[:300])
    lead_html = f'<p class="lead">{html.escape(model.lead)}</p>' if model.lead else ""

    # Källobjekt per fotnotsnummer → synlig inline-attribution vid varje påstående (A2).
    by_number = {s.number: s for s in model.sources}
    # A4: faktapanel + "Om"-sektion med egna rubriker; prosan bryts i flera stycken
    # (ett per claim) i stället för en namnlös klump — bättre densitet + chunking.
    facts_rows = "\n".join(_fact_row(f, by_number, loc) for f in model.facts)
    facts_section = (
        f'<h2>{loc["heading_facts"]}</h2>\n<section class="facts">\n<dl>\n{facts_rows}\n</dl>\n</section>'
        if model.facts else ""
    )
    about_paras = "\n".join(f"<p>{_prose_paragraph(p, by_number, loc)}</p>" for p in model.prose)
    about_section = (
        f'<h2>{loc["heading_about"].format(name=name)}</h2>\n<section class="about">\n{about_paras}\n</section>'
        if model.prose else ""
    )
    sources_html = "\n".join(_source_item(s, loc) for s in model.sources)
    faq_html = _faq_section(model)
    roles_html = _roles_section(model)
    trust = _trust_line(model)
    # A7: persona-sektioner även i HTML (fanns bara i llms.txt) — Googlebot/människor
    # ser samma målgruppsstruktur som AI-crawlers. A9: logotyp ur Organization-noden.
    audience_html = _audience_sections_html(model, by_number)
    logo_url = (graph.get("@graph") or [{}])[0].get("logo")
    logo_html = f'<img class="logo" src="{html.escape(str(logo_url))}" alt="{name}">' if logo_url else ""

    return f"""<!doctype html>
<html lang="{loc['html_lang']}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{name} — {loc['title_suffix']}</title>
<meta name="description" content="{desc}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="{canonical}">
<meta property="og:type" content="profile">
<meta property="og:title" content="{name} — {loc['title_suffix']}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{canonical}">
<script type="application/ld+json">{jsonld}</script>
<style>
  body {{ font-family: -apple-system, system-ui, sans-serif; max-width: 720px;
         margin: 0 auto; padding: 2rem 1.25rem; color: #1a1a1a; line-height: 1.6; }}
  h1 {{ font-size: 1.6rem; margin-bottom: .25rem; }}
  h2 {{ font-size: 1.05rem; margin: 2rem 0 .4rem; }}
  .brand {{ display: flex; align-items: center; gap: .75rem; margin-bottom: .25rem; }}
  .brand h1 {{ margin-bottom: 0; }}
  .logo {{ max-height: 44px; max-width: 140px; object-fit: contain; }}
  .audience ul {{ margin: .3rem 0; padding-left: 1.2rem; }}
  .audience li {{ margin: .25rem 0; }}
  .lead {{ font-size: 1.08rem; color: #222; margin: .3rem 0 .6rem; }}
  .about p {{ margin: .5rem 0; }}
  .trust {{ color: #555; font-size: .85rem; margin-bottom: 1.5rem; }}
  .facts {{ border: 1px solid #e5e5e5; border-radius: 10px; padding: .5rem 1rem; margin: 1.25rem 0; }}
  .facts dl {{ display: grid; grid-template-columns: 11rem 1fr; gap: .35rem 1rem; margin: .5rem 0; }}
  .facts dt {{ color: #666; }}
  .facts dd {{ margin: 0; }}
  sup a {{ color: #2563eb; text-decoration: none; font-size: .7em; padding: 0 .1em; }}
  .manual {{ color: #888; font-size: .8em; font-style: italic; white-space: nowrap; }}
  .cite {{ color: #555; font-size: .85em; }}
  .cite a {{ color: #555; text-decoration: none; border-bottom: 1px dotted #bbb; }}
  .quote {{ font-style: italic; color: #444; }}
  .faq {{ margin-top: 2rem; }}
  .faq dt {{ font-weight: 600; margin-top: .75rem; }}
  .faq dd {{ margin: .15rem 0 0; color: #333; }}
  .sources {{ margin-top: 2rem; border-top: 1px solid #e5e5e5; padding-top: 1rem; font-size: .9rem; }}
  .sources ol {{ padding-left: 1.25rem; color: #555; }}
  .sources a {{ color: #2563eb; }}
  footer {{ margin-top: 2rem; font-size: .75rem; color: #999; }}
</style>
</head>
<body>
<header class="brand">{logo_html}<h1>{name}</h1></header>
{lead_html}
<p class="trust">{trust}</p>
{facts_section}
{about_section}
{audience_html}
{roles_html}
{faq_html}
<section class="sources">
<h2>{loc['heading_sources']}</h2>
<ol>
{sources_html}
</ol>
</section>

<footer>{loc['footer']}</footer>
</body>
</html>
"""


def _roles_section(model: RenderModel) -> str:
    """Aktiva platsannonser — synlig spegling av JobPosting-noderna i grafen."""
    if not model.job_postings:
        return ""
    loc = i18n.strings(model.language)
    rows = "".join(
        f"<li>{html.escape(jp.title or loc['role_fallback'])}"
        + (f' — <span class="roleskills">{html.escape(", ".join(jp.skills))}</span>' if jp.skills else "")
        + "</li>"
        for jp in model.job_postings
    )
    return f'<section class="roles"><h2>{loc["heading_roles"]}</h2><ul>{rows}</ul></section>'


def _faq_section(model: RenderModel) -> str:
    faq = build_faq(model)
    if not faq:
        return ""
    loc = i18n.strings(model.language)
    rows = "".join(
        f'<div class="qa"><dt>{html.escape(e.question)}</dt>'
        f'<dd>{html.escape(e.answer)}{_footnote_marks(e.footnotes, loc)}</dd></div>'
        for e in faq
    )
    return f'<section class="faq"><h2>{loc["heading_faq"]}</h2><dl>{rows}</dl></section>'


def _footnote_marks(footnotes, loc) -> str:
    return "".join(
        f'<sup><a href="#src-{n}" title="{loc["source_fallback"].format(n=n)}">[{n}]</a></sup>'
        for n in footnotes
    )


def _fact_row(fact, by_number, loc) -> str:
    label = html.escape(loc["fact_labels"].get(fact.predicate, fact.predicate))
    value = fact.value
    text = ", ".join(str(v) for v in value) if isinstance(value, list) else str(value)
    return f"  <dt>{label}</dt><dd>{html.escape(text)}{_evidence(fact, by_number, loc)}</dd>"


def _prose_paragraph(prose, by_number, loc) -> str:
    """Ett narrativ-claim som eget stycke (A4) med synlig bevisning (A2)."""
    sentence = html.escape(prose.statement.rstrip("."))
    return f"{sentence}{_evidence(prose, by_number, loc)}."


def _evidence(entry, by_number, loc) -> str:
    """Synlig bevisning vid ett påstående (A2): superscript-fotnot + inline källa
    (namn, datum, ev. ordagrant citat) + neutral etikett för manuell källa.

    Inbäddade citat/källor är den starkaste citeringsspaken (deep research 2026-06-05),
    så vi lyfter källan ur fotnotslistan i botten till synligt läge vid faktan. Fotnoten
    behålls som kompakt ankare till bibliografin."""
    out = _footnote_marks(entry.footnotes, loc)
    inline = _inline_sources(entry.footnotes, by_number, loc)
    if inline:
        out += inline
    if entry.manual_label:
        out += f' <span class="manual">({html.escape(entry.manual_label)})</span>'
    return out


def _inline_sources(footnotes, by_number, loc) -> str:
    """Bygg synlig källattribution (namn · datum · ev. citat) för en lista fotnoter.
    Tom sträng om ingen av fotnoterna har en (länkbar) källa."""
    parts: list[str] = []
    for n in footnotes:
        s = by_number.get(n)
        if s is None:
            continue
        bits = []
        if s.name:
            bits.append(html.escape(s.name))
        if s.date:
            bits.append(_fmt_date(s.date, loc))
        label = ", ".join(bits) or loc["source_fallback"].format(n=n)
        # Bara namn+datum inline — alltid korrekt för varje claim som citerar källan.
        # Källans ordagranna utdrag (excerpt) är KÄLLnivå, inte claim-nivå: det visas i
        # bibliografin (_source_item), inte här, så det aldrig felaktigt antyds styrka
        # ett specifikt påstående det inte stöder. Claim-nivå-citat = uppföljning (A2.1).
        parts.append(f'<a href="#src-{n}">{label}</a>')
    if not parts:
        return ""
    return f'<span class="cite"> — {" · ".join(parts)}</span>'


def _source_item(source, loc) -> str:
    label = html.escape(source.name or source.url or loc["source_fallback"].format(n=source.number))
    date = f" · {_fmt_date(source.date, loc)}" if source.date else ""
    inner = f'<a href="{html.escape(source.url)}">{label}</a>' if source.url else label
    # Ordagrant utdrag ur källan (A2) — korrekt attribuerat på KÄLLnivå i bibliografin.
    quote = ""
    if getattr(source, "excerpt", None):
        quote = f' <span class="quote">”{html.escape(source.excerpt.strip()[:200])}”</span>'
    return f'  <li id="src-{source.number}">{inner}{date}{quote}</li>'


def _trust_line(model: RenderModel) -> str:
    loc = i18n.strings(model.language)
    n = len(model.sources)
    compiled = loc["trust_compiled_one"] if n == 1 else loc["trust_compiled_many"].format(n=n)
    parts = [compiled]
    if model.last_updated:
        parts.append(loc["trust_updated"].format(date=_fmt_date(model.last_updated, loc)))
    return " · ".join(parts)


def _fmt_date(iso: str | None, loc) -> str:
    if not iso:
        return ""
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return f"{loc['months'][dt.month - 1]} {dt.year}"
    except (ValueError, TypeError):
        return iso[:10]
