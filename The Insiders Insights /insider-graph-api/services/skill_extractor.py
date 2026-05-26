"""Deterministisk kompetensextraktion ur platsannonstext (spec §2.1, baslinje).

Matchar annonsens text mot en kurerad vokabulär av strategiska kompetenser
(tech stack, ramverk, certifieringar, ESG) och kanoniserar dem till globala
standardformer. Ordbundet, skiftlägesokänsligt, dubblettfritt och stabilt sorterat
→ omkörning ger exakt samma `extra["skills"]` (idempotent persist).

Detta är en *baslinje*: Slice 3 lägger LLM-driven ontologisk översättning (titlar →
globala standarder) och brusfiltrering ovanpå via Vertex AI EU. Vokabulären
kvarstår som snabb, EU-säker fallback när ingen LLM är tillgänglig.
"""
from __future__ import annotations

import re

# kanonisk kompetens → alias som får förekomma i annonstexten (gemener).
_VOCAB: dict[str, tuple[str, ...]] = {
    # Tech stack / moln
    "AWS": ("aws", "amazon web services"),
    "Azure": ("azure", "microsoft azure"),
    "Google Cloud": ("gcp", "google cloud"),
    "Kubernetes": ("kubernetes", "k8s"),
    "Docker": ("docker",),
    "Terraform": ("terraform",),
    "Python": ("python",),
    "Java": ("java",),
    "Go": ("golang",),
    "TypeScript": ("typescript",),
    "React": ("react", "reactjs"),
    ".NET": (".net", "dotnet"),
    # Ramverk / metod
    "Machine Learning": ("machine learning", "maskininlärning", "ml-"),
    "Scrum": ("scrum",),
    "DevOps": ("devops",),
    # Certifieringar / styrning
    "ISO 27001": ("iso 27001", "iso27001", "iso/iec 27001"),
    "ISO 14001": ("iso 14001", "iso14001"),
    "ISO 9001": ("iso 9001", "iso9001"),
    "GDPR": ("gdpr", "dataskyddsförordningen"),
    "SOC 2": ("soc 2", "soc2"),
    # ESG / hållbarhet
    "ESG": ("esg",),
    "CSRD": ("csrd",),
    "Sustainability": ("sustainability", "hållbarhet"),
    "Net Zero": ("net zero", "netto noll"),
}


def extract_skills(text: str) -> list[str]:
    """Kanoniska kompetenser som förekommer i `text`, stabilt sorterade."""
    if not text:
        return []
    haystack = text.lower()
    found: set[str] = set()
    for canonical, aliases in _VOCAB.items():
        for alias in aliases:
            if _contains(haystack, alias):
                found.add(canonical)
                break
    return sorted(found)


def _contains(haystack: str, needle: str) -> bool:
    """Ordbunden delsträngsmatchning (undviker t.ex. 'java' i 'javascript')."""
    return re.search(rf"(?<![a-z0-9]){re.escape(needle)}(?![a-z0-9])", haystack) is not None
