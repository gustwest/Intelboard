"""Privat lagring av kunduppladdat verifieringsunderlag (spec §4.2).

LinkedIn-skärmklipp/exporter laddas upp av kunden och granskas internt. De får INTE
hamna i den publika CDN-bucketen (EU-only, persondata-känsligt) — de lagras i en
separat, privat bucket (`settings.upload_bucket`) och hämtas bara via en autentiserad
proxy-endpoint (skyddad av admin-API-nyckeln).

Self-no-op: är ingen upload-bucket konfigurerad lagras inget (None returneras), och
flödet faller tillbaka på att bara spara filnamnet — uppladdningen fungerar ändå.
SDK:n importeras lazy. `_bucket()` är en söm som patchas i tester.
"""
from __future__ import annotations

import logging

from config import settings

log = logging.getLogger(__name__)


def store(
    client_id: str,
    snapshot_id: str,
    filename: str,
    content: bytes,
    content_type: str | None,
    prefix: str = "linkedin",
) -> str | None:
    """Ladda upp underlaget privat. Returnerar objektsökvägen, eller None om ej lagrat.

    `prefix` styr mappen i bucketen (default "linkedin" för bakåtkompatibilitet;
    verifieringsunderlag använder "verifications")."""
    if not settings.upload_bucket or not content:
        return None
    object_path = f"{prefix}/{client_id}/{snapshot_id}/{filename or 'underlag'}"
    try:
        blob = _bucket().blob(object_path)
        blob.upload_from_string(content, content_type=content_type or "application/octet-stream")
    except Exception as exc:  # lagringsfel får inte fälla uppladdningen
        log.warning("blob store failed for %s: %s", object_path, exc)
        return None
    return object_path


def fetch(object_path: str) -> tuple[bytes, str] | None:
    """Hämta (bytes, content_type) för ett lagrat underlag, eller None."""
    if not settings.upload_bucket or not object_path:
        return None
    try:
        blob = _bucket().blob(object_path)
        if not blob.exists():
            return None
        content = blob.download_as_bytes()
        return content, (blob.content_type or "application/octet-stream")
    except Exception as exc:
        log.warning("blob fetch failed for %s: %s", object_path, exc)
        return None


# Konstruktions-söm (patchas i tester).
def _bucket():
    from google.cloud import storage

    return storage.Client(project=settings.firestore_project_id or None).bucket(settings.upload_bucket)
