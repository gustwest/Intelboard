"""Installationskit (Spår B1) — den friktionsfria överlämningen till kund.

Samlar de tre sakerna kunden klistrar in EN gång: identitets-snutten (`<head>`),
badgen, och länken till den hostade profilsidan. Renderas som självständig HTML
(utskrivbar/PDF via print-CSS) och kan mejlas till kundkontakten.

Allt härleds ur befintliga renderare (delivery/badge/urls) så kitet aldrig kan
visa något annat än det leverans-fliken visar. Svenska tills A1-i18n; språkval
respekteras redan i badge-etiketten via kundens `language`.
"""
from __future__ import annotations

import html

import firestore_client as fs
from config import settings
from schema_org.badge import profile_url, render_badge
from schema_org.delivery import render_identity_snippet
from schema_org.urls import canonical_url


def build_kit(client_id: str) -> dict[str, str]:
    """De tre artefakterna + kontext, för rendering och e-post (samma källa)."""
    data = fs.client_doc(client_id).get().to_dict() or {}
    lang = (data.get("language") or "sv").lower()
    own_domain = (data.get("profile_base_url") or "").rstrip("/")
    is_premium = (data.get("tier") == "premium") and bool(own_domain)
    return {
        "company_name": data.get("company_name") or client_id,
        "profile_url": profile_url(client_id),
        "identity_snippet": render_identity_snippet(client_id),
        "badge_snippet": render_badge(client_id, lang=lang),
        # Premium (P5): profilen är konfigurerad att ligga på kundens EGEN domän —
        # förstaparts = starkast AI-auktoritet (domänauktoritets-beslutet). own_domain
        # är kundens subdomän; hosted_url är den geogiraph-hostade profilen den ska
        # peka på. Tom sträng för default-tier (ingen domän-sektion renderas).
        "own_domain": own_domain if is_premium else "",
        "hosted_url": canonical_url(client_id, None) if is_premium else "",
    }


def _premium_domain_html(kit: dict[str, str]) -> str:
    """Domän-sektion för premium-kund (P5). Tom sträng för default-tier. Ärlig om
    serveringsvägen: profilen ANKRAS redan till kundens domän (@id/kanonik), och den
    återstående DNS-/serveringskopplingen samordnas med kundens IT — vi fabricerar inte
    exakta poster (proxy-vs-CNAME-vägen är en gemensam uppsättning per kund)."""
    own = kit.get("own_domain")
    if not own:
        return ""
    own_e = html.escape(own)
    hosted_e = html.escape(kit.get("hosted_url") or "")
    return f"""<div class="premium">
<h2>Er profil på er egen domän</h2>
<p>Er profil är konfigurerad att ligga på <strong>{own_e}</strong> — på er egen domän.
Det är den starkaste positionen för AI-synlighet: innehållet räknas som <em>förstaparts</em>
och väger tyngst hos AI-motorer och sök, till skillnad från en tredjeparts-värd.</p>
<p class="note">Det enda som återstår är en <strong>engångs-DNS-koppling</strong> så att {own_e}
serverar den hostade profilen ({hosted_e}). Den sätter vi upp tillsammans med er IT —
kontakta {settings.support_contact_email} så koordinerar vi den korta uppsättningen.</p>
</div>"""


def render_install_kit(client_id: str) -> str:
    """Självständig HTML-sida med steg-för-steg-instruktion. Utskrivbar till PDF."""
    kit = build_kit(client_id)
    name = html.escape(kit["company_name"])
    profile = html.escape(kit["profile_url"])
    identity = html.escape(kit["identity_snippet"])
    badge = html.escape(kit["badge_snippet"])
    premium = _premium_domain_html(kit)

    return f"""<!doctype html>
<html lang="sv"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Installationsinstruktioner — {name}</title>
<style>
 body{{font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:760px;margin:2rem auto;padding:0 1.25rem;color:#1a1a1a;line-height:1.6}}
 h1{{font-size:1.5rem}} h2{{font-size:1.1rem;margin-top:2rem}}
 p.lead{{color:#444}}
 ol{{padding-left:0;list-style:none;counter-reset:step}}
 ol>li{{counter-increment:step;margin:1.4rem 0;padding-left:2.4rem;position:relative}}
 ol>li::before{{content:counter(step);position:absolute;left:0;top:0;width:1.6rem;height:1.6rem;
   background:#2563eb;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.85rem;font-weight:700}}
 pre{{background:#f4f6f7;border:1px solid #e5e5e5;border-radius:8px;padding:.9rem 1rem;font-size:12px;
   white-space:pre-wrap;word-break:break-all;overflow-x:auto}}
 a{{color:#2563eb}}
 .note{{color:#666;font-size:.9rem}}
 details.howto{{margin:.6rem 0 0;font-size:.9rem}}
 details.howto summary{{cursor:pointer;color:#2563eb;font-weight:600}}
 details.howto ul{{margin:.6rem 0 0;padding-left:1.2rem;color:#444}}
 details.howto li{{margin:.35rem 0}}
 .fallback{{background:#eef4ff;border:1px solid #cfe0ff;border-radius:8px;padding:.85rem 1rem;font-size:.92rem;color:#333;margin-top:1.6rem}}
 .trust{{background:#f0f9f4;border:1px solid #cfe8d8;border-radius:8px;padding:.85rem 1rem;font-size:.92rem;color:#234;margin:1.2rem 0 0}}
 .premium{{background:#fbf7ef;border:1px solid #ecdcc0;border-radius:8px;padding:.4rem 1.1rem 1rem;margin:1.4rem 0 0}}
 .premium h2{{margin-top:1rem}}
 .toolbar{{display:flex;justify-content:flex-end;margin-bottom:1rem}}
 .toolbar button{{font:inherit;padding:.4rem .9rem;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer}}
 @media print{{.toolbar{{display:none}} body{{margin:0;max-width:none}} pre{{white-space:pre-wrap}}}}
</style></head><body>
<div class="toolbar"><button onclick="window.print()">Skriv ut / Spara som PDF</button></div>
<h1>Installationsinstruktioner</h1>
<p class="lead">Tre saker att lägga till på er sajt, {name}. Allt klistras in <strong>en gång</strong>
och behöver aldrig röras igen — profilsidan uppdaterar vi åt er löpande.</p>

<p class="trust">✓ <strong>Tryggt att installera:</strong> koden är ren, statisk markup — ingen
exekverande JavaScript, ingen spårning, inga cookies. Den talar bara om för AI-motorerna vem ni
är och pekar på er verifierade profil. Geogiraph är tjänsten The Insiders använder för att hålla
er bild korrekt i AI-svar.</p>
{premium}
<ol>
<li>
<h2>Identitets-snutt — klistra in i sidans <code>&lt;head&gt;</code></h2>
<p class="note">Talar om för AI-motorerna vem ni är och pekar på er profil som kanonisk källa. Ändras aldrig.</p>
<pre>{identity}</pre>
<details class="howto">
<summary>Var hittar jag <code>&lt;head&gt;</code>? Välj er plattform</summary>
<ul>
<li><strong>WordPress:</strong> installera ett sidhuvuds-tillägg (t.ex. WPCode eller ”Insert Headers and Footers”) och klistra in koden i fältet <em>Header</em>.</li>
<li><strong>Squarespace:</strong> Inställningar → Avancerat → Kodinjektion → <em>Sidhuvud</em>.</li>
<li><strong>Wix:</strong> Inställningar → Anpassad kod → Lägg till kod → placera i <em>Head</em>, på alla sidor.</li>
<li><strong>Webflow:</strong> Project Settings → Custom Code → <em>Head Code</em>.</li>
<li><strong>Egen eller annan sajt:</strong> klistra in precis före den avslutande <code>&lt;/head&gt;</code>-taggen.</li>
</ul>
</details>
</li>
<li>
<h2>Badge — klistra in där den ska synas (t.ex. i footern)</h2>
<p class="note">En diskret, verifierad länk till er AI-profil. Ren HTML, ingen JavaScript. Samma kodinjektions-verktyg som ovan har oftast ett <em>Footer</em>-fält.</p>
<pre>{badge}</pre>
</li>
<li>
<h2>Er publika AI-profil</h2>
<p class="note">Sanningskällan AI-motorerna läser. Badgen länkar hit — ni kan även länka till den själva.</p>
<p><a href="{profile}" target="_blank" rel="noopener">{profile}</a></p>
</li>
</ol>

<p class="fallback"><strong>Inte säker på hur ni når koden?</strong> Vidarebefordra det här mejlet till den som sköter er webbplats — för dem tar det någon minut. Eller kontakta {settings.support_contact_email} så hjälper vi till.</p>

<p class="note">Frågor? Kontakta {settings.support_contact_email} så hjälper vi till.</p>
</body></html>"""


def render_install_kit_email(client_id: str) -> tuple[str, str, str]:
    """→ (subject, html_body, text_body) för utskick till kundkontakten."""
    kit = build_kit(client_id)
    name = kit["company_name"]
    subject = f"Installationsinstruktioner för er Geogiraph AI-profil — {name}"
    premium_text = ""
    if kit.get("own_domain"):
        premium_text = (
            f"Er profil på er egen domän ({kit['own_domain']}):\n"
            f"  Profilen är konfigurerad att ligga på er egen domän — den starkaste positionen\n"
            f"  för AI-synlighet (förstaparts väger tyngst). Det återstår en engångs-DNS-koppling\n"
            f"  så att {kit['own_domain']} serverar den hostade profilen ({kit['hosted_url']}).\n"
            f"  Den sätter vi upp tillsammans med er IT — kontakta {settings.support_contact_email}.\n\n"
        )
    text = (
        f"Hej!\n\n{premium_text}Här är de tre sakerna att lägga till på er sajt (klistras in en gång):\n\n"
        f"1) Identitets-snutt (i sidans <head>):\n{kit['identity_snippet']}\n\n"
        f"2) Badge (t.ex. i footern):\n{kit['badge_snippet']}\n\n"
        f"3) Er publika AI-profil:\n{kit['profile_url']}\n\n"
        f"Var hittar jag <head>?\n"
        f"  WordPress: ett sidhuvuds-tillägg (WPCode m.fl.), fältet Header.\n"
        f"  Squarespace: Inställningar > Avancerat > Kodinjektion > Sidhuvud.\n"
        f"  Wix: Inställningar > Anpassad kod > Head, på alla sidor.\n"
        f"  Webflow: Project Settings > Custom Code > Head Code.\n"
        f"  Egen/annan sajt: precis före </head>.\n\n"
        f"Inte säker på hur ni gör? Vidarebefordra mejlet till den som sköter er "
        f"webbplats, eller kontakta {settings.support_contact_email} så hjälper vi till.\n\n"
        f"Profilsidan uppdaterar vi åt er löpande. Frågor? Kontakta {settings.support_contact_email}.\n"
    )
    return subject, render_install_kit(client_id), text
