"""Profil-URL:er och GCS-objektnamn på ETT ställe.

Kanonik (<link rel=canonical> + JSON-LD @id), badge-mål, identitets-snutt och
upload-metadata måste alltid peka på samma adress — historiskt räknades de ut på
fyra ställen och glider då lätt isär. Här bor sanningen.

Två lägen, styrda av CDN_CLEAN_URLS:

  * False (default — GCS path-style): innehåll under ``clients/<id>/``, och den
    publika profil-URL:en pekar explicit på ``…/index.html`` (path-style-endpointen
    serverar inte index.html för en katalog-URL). Kanoniken pekar på den
    aspirationella publika domänen (DEFAULT_BASE) precis som tidigare.
  * True (bakom HTTPS-LB med MainPageSuffix, egen domän): innehåll i ``<id>/``,
    rena katalog-URL:er, och kanoniken == den serverade adressen på CDN_BASE_URL.

Premium-kund med egen domän (``profile_base_url``) överstyr alltid kanoniken — då
deklarerar vi medvetet kundens domän även om vi hostar sidan.
"""
from __future__ import annotations

from config import settings

# Aspirationell publik domän som kanoniken pekar på i path-style-läget (innan
# clean-URL-cutover). I clean-läge kommer kanoniken i stället från CDN_BASE_URL,
# som då är samma domän sidan faktiskt serveras på.
DEFAULT_BASE = "https://profiles.geogiraph.com"


def object_prefix(client_id: str) -> str:
    """GCS-objektprefix (utan filnamn) för kundens artefakter."""
    return client_id if settings.cdn_clean_urls else f"clients/{client_id}"


def schema_object(client_id: str) -> str:
    return f"{object_prefix(client_id)}/schema.json"


def page_object(client_id: str) -> str:
    return f"{object_prefix(client_id)}/index.html"


def llms_object(client_id: str) -> str:
    return f"{object_prefix(client_id)}/llms.txt"


def cdn_url(client_id: str) -> str:
    """Publik URL till den kompilerade JSON-LD-grafen (schema.json)."""
    return f"{settings.cdn_base_url}/{schema_object(client_id)}"


def served_url(client_id: str) -> str:
    """Där profilsidan faktiskt ligger på vår CDN — det 'Öppna' i Leverans går till
    och det compile-schema sparar som ``profile_url``."""
    if settings.cdn_clean_urls:
        return f"{settings.cdn_base_url}/{client_id}/"
    return f"{settings.cdn_base_url}/clients/{client_id}/index.html"


def canonical_url(client_id: str, profile_base_url: str | None = None) -> str:
    """Bas-IRI för JSON-LD @id + <link rel=canonical> + badge-mål. I clean-läge lika
    med den serverade adressen; i path-style-läge den aspirationella domänen."""
    if profile_base_url:
        return profile_base_url.rstrip("/")
    if settings.cdn_clean_urls:
        return f"{settings.cdn_base_url}/{client_id}/"
    return f"{DEFAULT_BASE}/{client_id}"
