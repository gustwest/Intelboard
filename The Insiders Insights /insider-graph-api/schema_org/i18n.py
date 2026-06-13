"""Språksträngar för profilsida + llms.txt + kompilerad graf (A1).

Avhårdkodar svenskan som A2–A9 samlat på sig. Default "sv" (byte-identiskt med
tidigare beteende — befintliga kunders profiler får INTE ändras); "en" som första
parallellspråk. Okänt språk faller tillbaka på sv.

Språket väljs per kund via client-doc:ets `language`-fält och bärs på RenderModel.
BCP 47-koden sätts som `lang`-attribut i HTML och `inLanguage` i JSON-LD.

Beslutet sv/en/båda per marknad tas i C3 (polling-experimentet) — den här modulen är
bara mekanismen.
"""
from __future__ import annotations

from typing import Any

# Default-språk: byte-identiskt med beteendet före A1.
DEFAULT_LANG = "sv"

_STRINGS: dict[str, dict[str, Any]] = {
    "sv": {
        "html_lang": "sv",
        # schema.org-predikat → etikett i faktapanelen.
        "fact_labels": {
            "foundingDate": "Grundat",
            "address": "Säte",
            "knowsAbout": "Verksamhet",
            "numberOfEmployees": "Antal anställda",
            "slogan": "Motto",
            "memberOf": "Medlem i",
            "hasCredential": "Certifieringar",
            "jobBenefits": "Förmåner",
        },
        "months": [
            "januari", "februari", "mars", "april", "maj", "juni",
            "juli", "augusti", "september", "oktober", "november", "december",
        ],
        # Sektionsrubriker (HTML + llms.txt).
        "heading_facts": "Fakta",
        "heading_about": "Om {name}",
        "heading_sources": "Källor",
        "heading_faq": "Vanliga frågor",
        "heading_roles": "Aktuella roller",
        "heading_person_expertise": "Medarbetarnas expertis",
        "audience_heading": "För {persona}",
        # Org.nr-rad (A3) — synlig entitetsdisambiguering.
        "orgnr_label": "Org.nr",
        # Bestyrkandenivå (A3, Bron #1) som SYNLIG text — ClaimReview-markup är död
        # (Google la ned fact-check juni 2025), så assurance lyfts som läsbar etikett
        # inline vid claimet i stället. Nyckel = assurance_level.
        "assurance_labels": {
            "self_declared": "Självdeklarerad",
            "third_party_reviewed": "Tredjepartsgranskad",
            "independently_assured": "Oberoende bestyrkt",
        },
        # Persona-etiketter per språk (nyckel = persona.id). Tidigare hårdkodades
        # persona.label_sv även på engelska profiler → svenska rubriker. Fallback i
        # anroparen på label_sv om id saknas här.
        "persona_labels": {
            "customer": "Kund", "talent": "Talang", "investor": "Investerare",
            "partner": "Partner", "media": "Media", "regulator": "Myndighet",
            "patient": "Patient", "student": "Student", "donor": "Givare",
            "citizen": "Medborgare",
        },
        # Trust-rad.
        "trust_compiled_one": "Sammanställd från 1 källa",
        "trust_compiled_many": "Sammanställd från {n} källor",
        "trust_updated": "senast uppdaterad {date}",
        # Footer + meta.
        "footer": "AI-profil verifierad av Geogiraph.",
        "what_is_this": "Vad är detta? En AI-profil är en källförsedd sammanställning som AI-motorer (som ChatGPT) läser för att svara korrekt om ett företag — underhållen löpande av Geogiraph.",
        "verified_by": "AI-profil verifierad av Geogiraph",
        "title_suffix": "AI-profil",
        "desc_fallback": "AI-profil för {name}.",
        # Manuell/attesterad källetikett (compiler).
        "manual_label": "uppgift från bolaget",
        "attested_label": "verifierad av Geogiraph",
        # Ledmening (A3).
        "lead_activity": "{name} är verksamt inom {value}",
        "lead_location": " med säte i {value}",
        "lead_founded": ", grundat {value}",
        # FAQ (A6). intro = "Vad gör {name}?"; per-predikat (fråga, svar).
        "faq_intro_q": "Vad gör {name}?",
        "faq": {
            "foundingDate": ("När grundades {name}?", "{name} grundades {value}."),
            "address": ("Var har {name} sitt säte?", "{name} har sitt säte i {value}."),
            "knowsAbout": ("Vad är {name} verksamt inom?", "{name} är verksamt inom {value}."),
            "numberOfEmployees": ("Hur många anställda har {name}?", "{name} har {value} anställda."),
            "jobBenefits": ("Vilka förmåner erbjuder {name}?", "{name} erbjuder {value}."),
            "slogan": ("Vad står {name} för?", "{name} står för: {value}."),
            "memberOf": ("Vilka avtal eller branschorgan är {name} anslutet till?", "{name} är anslutet till {value}."),
            "hasCredential": ("Vilka certifieringar eller utmärkelser har {name}?", "{name} har {value}."),
        },
        # llms.txt-rubriker.
        "llms_facts": "## Fakta",
        "llms_roles": "## Aktuella roller",
        "llms_faq": "## Frågor & svar",
        "llms_sources": "## Källor",
        "role_fallback": "Roll",
        "source_fallback": "Källa {n}",
    },
    "en": {
        "html_lang": "en",
        "fact_labels": {
            "foundingDate": "Founded",
            "address": "Headquarters",
            "knowsAbout": "Focus areas",
            "numberOfEmployees": "Employees",
            "slogan": "Motto",
            "memberOf": "Member of",
            "hasCredential": "Certifications",
            "jobBenefits": "Benefits",
        },
        "months": [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December",
        ],
        "heading_facts": "Facts",
        "heading_about": "About {name}",
        "heading_sources": "Sources",
        "heading_faq": "Frequently asked questions",
        "heading_roles": "Open roles",
        "heading_person_expertise": "Team expertise",
        "audience_heading": "For {persona}",
        "orgnr_label": "Company reg. no.",
        "assurance_labels": {
            "self_declared": "Self-declared",
            "third_party_reviewed": "Third-party reviewed",
            "independently_assured": "Independently assured",
        },
        "persona_labels": {
            "customer": "customer", "talent": "talent", "investor": "investor",
            "partner": "partner", "media": "media", "regulator": "regulator",
            "patient": "patient", "student": "student", "donor": "donor",
            "citizen": "citizen",
        },
        "trust_compiled_one": "Compiled from 1 source",
        "trust_compiled_many": "Compiled from {n} sources",
        "trust_updated": "last updated {date}",
        "footer": "AI profile verified by Geogiraph.",
        "what_is_this": "What is this? An AI profile is a sourced summary that AI engines (like ChatGPT) read to answer correctly about a company — maintained on an ongoing basis by Geogiraph.",
        "verified_by": "AI profile verified by Geogiraph",
        "title_suffix": "AI profile",
        "desc_fallback": "AI profile for {name}.",
        "manual_label": "provided by the company",
        "attested_label": "verified by Geogiraph",
        "lead_activity": "{name} works within {value}",
        "lead_location": ", based in {value}",
        "lead_founded": ", founded {value}",
        "faq_intro_q": "What does {name} do?",
        "faq": {
            "foundingDate": ("When was {name} founded?", "{name} was founded {value}."),
            "address": ("Where is {name} based?", "{name} is based in {value}."),
            "knowsAbout": ("What does {name} work within?", "{name} works within {value}."),
            "numberOfEmployees": ("How many employees does {name} have?", "{name} has {value} employees."),
            "jobBenefits": ("What benefits does {name} offer?", "{name} offers {value}."),
            "slogan": ("What does {name} stand for?", "{name} stands for: {value}."),
            "memberOf": ("What agreements or industry bodies is {name} part of?", "{name} is affiliated with {value}."),
            "hasCredential": ("What certifications or awards does {name} hold?", "{name} holds {value}."),
        },
        "llms_facts": "## Facts",
        "llms_roles": "## Open roles",
        "llms_faq": "## Questions & answers",
        "llms_sources": "## Sources",
        "role_fallback": "Role",
        "source_fallback": "Source {n}",
    },
}


def strings(lang: str | None) -> dict[str, Any]:
    """Strängtabell för språkkoden; faller tillbaka på sv vid okänt språk."""
    return _STRINGS.get((lang or DEFAULT_LANG).lower(), _STRINGS[DEFAULT_LANG])


def html_lang(lang: str | None) -> str:
    return strings(lang)["html_lang"]
