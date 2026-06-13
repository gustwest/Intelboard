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
from dataclasses import dataclass
from datetime import datetime

from schema_org import i18n
from schema_org.compiler import _ASSURANCE_RANK, RenderModel, build_faq, build_render_model, compile_client


@dataclass(frozen=True)
class RenderBudget:
    """A2: innehållsbudget = *prioritering, inte hård trunkering*. Default = inga tak
    (no-truncation-default behålls — evidensbackat beslut 2026-06-12: längd i sig är
    inte hävstången, grundning + position är). När ett tak SÄTTS behålls det citerbara
    kärnskelettet (ledmening, faktapanel, källförsedda claims, källor) alltid; prosan
    beskärs efter prioritet (assurance-nivå, sedan antal källor) men renderas i
    originalordning; FAQ/persona-sektioner är redan prioritetsordnade."""

    max_prose: int | None = None
    max_faq: int | None = None
    max_persona_sections: int | None = None


DEFAULT_BUDGET = RenderBudget()


def render_profile_html(client_id: str, budget: RenderBudget = DEFAULT_BUDGET) -> str:
    model = build_render_model(client_id)
    graph = compile_client(client_id)
    return _render(model, graph, budget)


def _prose_priority(p) -> tuple[int, int]:
    """A2-rankningssignal för vilken prosa som behålls när max_prose biter.
    `Prose` saknar `confidence` (bara `Fact` har det) → proxy: (assurance-rank, antal
    källor). Starkare bestyrkt + fler källor = behålls först."""
    return (_ASSURANCE_RANK.get(getattr(p, "assurance_level", None), -1), len(p.footnotes))


def _budgeted_prose(prose: list, max_prose: int | None) -> list:
    """Välj de max_prose högst-rankade styckena men BEHÅLL originalordningen (läsbarhet).
    None eller färre än taket → orörd lista (no-op, default)."""
    if max_prose is None or len(prose) <= max_prose:
        return prose
    keep = set(id(p) for p in sorted(prose, key=_prose_priority, reverse=True)[:max_prose])
    return [p for p in prose if id(p) in keep]


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
        out.append("## " + loc["audience_heading"].format(persona=loc["persona_labels"].get(persona.id, persona.label_sv).lower()))
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


def _audience_sections_html(model: RenderModel, by_number, max_sections: int | None = None) -> str:
    """A7: persona-sektioner i HTML — spegling av llms.txt:s `_audience_sections`.

    Grupperar persona-taggade facts + prose under "För {persona}"-rubriker med synlig
    källattribution (A2). Samma medvetna redundans (en claim taggad för flera personor
    visas under varje). Tom sträng om inga persona-taggade claims (allt evergreen).

    A2: max_sections beskär antalet persona-sektioner (registry-ordning = prioritet).
    None = inget tak (default)."""
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
            heading = html.escape(loc["audience_heading"].format(persona=loc["persona_labels"].get(persona.id, persona.label_sv).lower()))
            out.append(
                f'<section class="audience"><h2>{heading}</h2>'
                f'<ul>{"".join(lis)}</ul></section>'
            )
            if max_sections is not None and len(out) >= max_sections:
                break
    return "\n".join(out)


def _render(model: RenderModel, graph: dict, budget: RenderBudget = DEFAULT_BUDGET) -> str:
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
    facts_rows = "\n".join(_fact_row(f, by_number, loc) for f in _merge_facts_by_predicate(model.facts))
    facts_section = (
        f'<h2>{loc["heading_facts"]}</h2>\n<section class="facts">\n<dl>\n{facts_rows}\n</dl>\n</section>'
        if model.facts else ""
    )
    # A2: innehållsbudget på prosan (default = inga tak → orörd lista).
    prose = _budgeted_prose(model.prose, budget.max_prose)
    about_paras = "\n".join(f"<p>{_prose_paragraph(p, by_number, loc)}</p>" for p in prose)
    about_section = (
        f'<h2>{loc["heading_about"].format(name=name)}</h2>\n<section class="about">\n{about_paras}\n</section>'
        if prose else ""
    )
    sources_html = "\n".join(_source_item(s, loc) for s in model.sources)
    faq_html = _faq_section(model, by_number, budget.max_faq)
    roles_html = _roles_section(model)
    # A3: medarbetarexpertis (R1) som synlig sektion — speglar Claim-noderna (about →
    # Person) som tidigare bara fanns i JSON-LD.
    expertise_html = _person_expertise_section(model, by_number)
    trust = _trust_line(model)
    # A3: org.nr som synlig rad — entitetsdisambiguering, tidigare bara i JSON-LD identifier.
    orgnr_html = (
        f'<p class="orgnr">{loc["orgnr_label"]}: {html.escape(str(model.org_number))}</p>'
        if model.org_number else ""
    )
    # A7: persona-sektioner även i HTML (fanns bara i llms.txt) — Googlebot/människor
    # ser samma målgruppsstruktur som AI-crawlers. A9: logotyp ur Organization-noden.
    audience_html = _audience_sections_html(model, by_number, budget.max_persona_sections)
    # Hämta org-noden via @type, inte via index 0 — grafen kan ha en ProfilePage-
    # container före Organization.
    org_node = next((n for n in graph.get("@graph") or [] if n.get("@type") == "Organization"), {})
    logo_url = org_node.get("logo")
    logo_html = f'<img class="logo" src="{html.escape(str(logo_url))}" alt="{name}">' if logo_url else ""
    # Delningskort + favicon (människolagret — växande user-action-trafik). Loggan finns
    # redan i grafen; utan og:image blir delningar bildlösa. Tom sträng = rent fallback.
    logo_esc = html.escape(str(logo_url)) if logo_url else ""
    og_image = f'\n<meta property="og:image" content="{logo_esc}">' if logo_url else ""
    favicon = f'\n<link rel="icon" href="{logo_esc}">' if logo_url else ""
    # Källsektionen renderas BARA när det finns källor — annars fick en källlös profil
    # en tom rubrik + tom <ol> som motsade trust-raden.
    sources_section = (
        f'<section class="sources">\n<h2>{loc["heading_sources"]}</h2>\n<ol>\n{sources_html}\n</ol>\n</section>'
        if model.sources else ""
    )

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
<meta property="og:url" content="{canonical}">{og_image}{favicon}
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
  .assurance {{ color: #15803d; font-size: .8em; font-weight: 600; white-space: nowrap; }}
  .orgnr {{ color: #777; font-size: .8rem; margin: -.75rem 0 1rem; }}
  .expertise {{ margin-top: 2rem; }}
  .expertise h3 {{ font-size: .98rem; margin: 1rem 0 .2rem; }}
  .expertise .ptitle {{ color: #666; font-weight: 400; }}
  .expertise ul {{ margin: .2rem 0; padding-left: 1.2rem; }}
  .expertise li {{ margin: .25rem 0; }}
  .cite {{ color: #555; font-size: .85em; }}
  .cite a {{ color: #555; text-decoration: none; border-bottom: 1px dotted #bbb; }}
  .quote {{ font-style: italic; color: #444; }}
  .roles ul {{ margin: .3rem 0; padding-left: 1.2rem; }}
  .roleskills {{ color: #555; }}
  .faq {{ margin-top: 2rem; }}
  .faq dt {{ font-weight: 600; margin-top: .75rem; }}
  .faq dd {{ margin: .15rem 0 0; color: #333; }}
  .sources {{ margin-top: 2rem; border-top: 1px solid #e5e5e5; padding-top: 1rem; font-size: .9rem; }}
  .sources ol {{ padding-left: 1.25rem; color: #555; }}
  .sources a {{ color: #2563eb; }}
  footer {{ margin-top: 2rem; font-size: .75rem; color: #999; }}
  footer .whatis {{ color: #666; font-size: .82rem; margin: 0 0 .5rem; line-height: 1.5; }}
</style>
</head>
<body>
<header class="brand">{logo_html}<h1>{name}</h1></header>
<main>
{lead_html}
<p class="trust">{trust}</p>
{orgnr_html}
{facts_section}
{about_section}
{audience_html}
{expertise_html}
{roles_html}
{faq_html}
{sources_section}
</main>
<footer><p class="whatis">{loc['what_is_this']}</p>{loc['footer']}</footer>
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


def _person_expertise_section(model: RenderModel, by_number) -> str:
    """A3: godkända person-expertis-claims (R1) som SYNLIG sektion — speglar Claim-
    noderna (about → Person) i grafen, som tidigare bara fanns maskinläsbart. Grupperar
    per medarbetare med namn + ev. titel och källförsedd evidens (A2). Person utan
    namnnod (opt-out/raderad → GDPR) hoppas över. Tom sträng = inga person-claims."""
    if not model.person_claims:
        return ""
    loc = i18n.strings(model.language)
    by_pid = {p["@id"]: p for p in model.persons}  # @id → Person-nod (namn, titel)
    grouped: dict[str, list] = {}
    order: list[str] = []
    for pc in model.person_claims:
        if pc.person_id not in grouped:
            grouped[pc.person_id] = []
            order.append(pc.person_id)
        grouped[pc.person_id].append(pc)

    blocks: list[str] = []
    for pid in order:
        node = by_pid.get(pid) or {}
        person_name = node.get("name")
        if not person_name:
            continue  # ingen publik Person-nod (opt-out/raderad) → claim publiceras ej
        title = node.get("jobTitle")
        heading = html.escape(person_name) + (
            f' — <span class="ptitle">{html.escape(title)}</span>' if title else ""
        )
        items = "".join(
            f"<li>{html.escape(pc.statement.rstrip('.'))}"
            f"{_footnote_marks(pc.footnotes, loc)}{_inline_sources(pc.footnotes, by_number, loc)}</li>"
            for pc in grouped[pid]
        )
        blocks.append(f'<div class="person"><h3>{heading}</h3><ul>{items}</ul></div>')
    if not blocks:
        return ""
    return f'<section class="expertise"><h2>{loc["heading_person_expertise"]}</h2>{"".join(blocks)}</section>'


def _faq_section(model: RenderModel, by_number, max_faq: int | None = None) -> str:
    """A6: FAQ är en bärare av tät, KÄLLFÖRSEDD text. Tidigare visades bara fotnots-
    siffran [n] i svaret — den synliga inline-källan (namn · datum), som är hela poängen
    med evidensen inuti FAQ:n, saknades. Nu speglas A2-bevisningen även här.

    A2: max_faq beskär listan (FAQ är redan prioritetsordnad: intro + `_FAQ_ORDER`).
    None = inget tak (default)."""
    faq = build_faq(model)
    if not faq:
        return ""
    if max_faq is not None:
        faq = faq[:max_faq]
    loc = i18n.strings(model.language)
    rows = "".join(
        f'<div class="qa"><dt>{html.escape(e.question)}</dt>'
        f'<dd>{html.escape(e.answer)}{_footnote_marks(e.footnotes, loc)}'
        f'{_inline_sources(e.footnotes, by_number, loc)}</dd></div>'
        for e in faq
    )
    return f'<section class="faq"><h2>{loc["heading_faq"]}</h2><dl>{rows}</dl></section>'


def _footnote_marks(footnotes, loc) -> str:
    return "".join(
        f'<sup><a href="#src-{n}" title="{loc["source_fallback"].format(n=n)}">[{n}]</a></sup>'
        for n in footnotes
    )


def _merge_facts_by_predicate(facts):
    """Slå ihop fakta med samma predikat till en rad (ett predikat = en dt/dd).

    knowsAbout kommer som flera enkel-värda Fact (ett per skill ur derive_skill_claims),
    vilket annars ger 9 upprepade "Verksamhet:"-rader i panelen i stället för en
    konsoliderad "Verksamhet: AI, AIO, …" (= det grafen och ingressen redan visar).
    Värden unionas (ordningsbevarat), fotnoter/citat slås ihop så A2-bevisningen står
    kvar, första manuella etiketten behålls. Predikat-ordningen = första förekomst
    (fakta är redan konfidens-sorterade, så starkaste predikatet kommer först).

    Bestyrkandenivån (A3) tas som den STARKASTE bland de sammanslagna värdena så
    assurance-etiketten inte tappas när flera enkel-värda Fact slås till en rad."""
    from schema_org.compiler import _ASSURANCE_RANK, Fact

    order: list[str] = []
    by_pred: dict[str, Fact] = {}
    for f in facts:
        merged = by_pred.get(f.predicate)
        if merged is None:
            merged = Fact(predicate=f.predicate, value=[], statement=None,
                          manual_label=f.manual_label, confidence=f.confidence)
            by_pred[f.predicate] = merged
            order.append(f.predicate)
        for v in (f.value if isinstance(f.value, list) else [f.value]):
            if v not in merged.value:
                merged.value.append(v)
        for n in f.footnotes:
            if n not in merged.footnotes:
                merged.footnotes.append(n)
        for n, q in (getattr(f, "quotes", None) or {}).items():
            merged.quotes.setdefault(n, q)
        if merged.manual_label is None and f.manual_label:
            merged.manual_label = f.manual_label
        if _ASSURANCE_RANK.get(f.assurance_level, -1) > _ASSURANCE_RANK.get(merged.assurance_level, -1):
            merged.assurance_level = f.assurance_level
    for merged in by_pred.values():
        merged.footnotes.sort()
    return [by_pred[p] for p in order]


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
    inline = _inline_sources(entry.footnotes, by_number, loc, getattr(entry, "quotes", None))
    if inline:
        out += inline
    if entry.manual_label:
        out += f' <span class="manual">({html.escape(entry.manual_label)})</span>'
    # Bestyrkandenivå (A3, Bron #1) som synlig text — den starkaste trovärdighets-
    # signalen, tidigare bara maskinläsbar i ClaimReview (numera död markup). Visas
    # bara för manuellt verifierade claims (auto-deriverade saknar nivå → ingen etikett).
    level = getattr(entry, "assurance_level", None)
    if level:
        label = loc["assurance_labels"].get(level)
        if label:
            out += f' <span class="assurance">✓ {html.escape(label)}</span>'
    return out


def _inline_sources(footnotes, by_number, loc, quotes=None) -> str:
    """Bygg synlig källattribution (namn · datum · ev. claim-citat) för en lista fotnoter.
    Tom sträng om ingen av fotnoterna har en (länkbar) källa.

    A2.1: när claimet bär ett VERIFIERAT verbatim-spann för en källa (quotes[n], grindat
    av claim_grounding så det bevisligen stödjer JUST detta påstående) visas det inline —
    inbäddade citat är den starkaste citeringsspaken (deep research 2026-06-05). Det är
    korrekt på claim-nivå, till skillnad från Source.excerpt (käll-nivå, bor i bibliografin)."""
    quotes = quotes or {}
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
        cite = f'<a href="#src-{n}">{label}</a>'
        q = (quotes.get(n) or "").strip()
        if q:
            cite += f' <span class="quote">”{html.escape(q[:200])}”</span>'
        parts.append(cite)
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
