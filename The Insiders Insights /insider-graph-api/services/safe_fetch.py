"""SSRF-skydd för server-side hämtningar av KUND-kontrollerade URL:er.

Flera connectors hämtar URL:er som en kund (eller, så länge admin-API:t är öppet,
vem som helst) styr: profilsidans website (`delivery_health`), crawl-starten
(`web_crawl`) och RSS-/jobbfeeds. Utan skydd kan en URL pekas mot moln-metadata
(`169.254.169.254` / `metadata.google.internal`) → service-kontots access-token läcker
= full projekt-kompromiss (Firestore, buckets, secrets).

Grinden:
  * tillåt bara http/https,
  * slå upp värdnamnet och NEKA om NÅGON av dess IP:n är privat/loopback/link-local/
    reserverad/metadata (blocklist — crawlern måste kunna nå godtyckliga kund-domäner,
    så en allowlist går inte),
  * följ INTE redirects automatiskt — varje hop omvalideras (annars kringgås grinden
    via en publik URL som 302:ar till `169.254.169.254`).

Begränsning: skyddet är resolve-då-validera; en avancerad DNS-rebind (TTL 0, byt IP
mellan validering och anslutning) täcks inte fullt ut. För det krävs IP-pinning vid
anslutning — noterat som P2. De realistiska vektorerna (metadata, interna IP:n,
redirect-baserad SSRF) stängs.
"""
from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urljoin, urlparse

import httpx

# Värdnamn som aldrig får nås.
_BLOCKED_HOSTS = {"metadata.google.internal", "metadata", "localhost"}


class SsrfError(ValueError):
    """URL:en pekar på en otillåten (intern/metadata) destination."""


def _addr_blocked(ip: str) -> bool:
    a = ipaddress.ip_address(ip)
    return (
        a.is_private or a.is_loopback or a.is_link_local
        or a.is_reserved or a.is_multicast or a.is_unspecified
    )


def assert_public_url(url: str) -> None:
    """Höj SsrfError om `url` inte är en publik http(s)-destination. Slår upp ALLA
    A/AAAA-poster och nekar om någon är intern/metadata."""
    p = urlparse(url)
    if p.scheme not in ("http", "https"):
        raise SsrfError(f"otillåtet schema: {p.scheme!r}")
    host = (p.hostname or "").lower()
    if not host or host in _BLOCKED_HOSTS:
        raise SsrfError(f"otillåten värd: {host!r}")
    try:
        infos = socket.getaddrinfo(host, p.port, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise SsrfError(f"kunde inte slå upp {host!r}: {exc}") from exc
    for info in infos:
        ip = info[4][0]
        if _addr_blocked(ip):
            raise SsrfError(f"{host} → {ip} är en intern/metadata-adress")


def safe_get(url: str, *, headers: dict | None = None, timeout: float = 20.0,
             max_redirects: int = 4) -> httpx.Response:
    """GET med SSRF-grind. Följer redirects MANUELLT och omvaliderar varje hop.
    Höjer SsrfError (otillåten destination) eller httpx.HTTPError (nätfel)."""
    current = url
    with httpx.Client(timeout=timeout, follow_redirects=False) as client:
        for _ in range(max_redirects + 1):
            assert_public_url(current)
            resp = client.get(current, headers=headers)
            loc = resp.headers.get("location")
            if resp.is_redirect and loc:
                current = urljoin(current, loc)
                continue
            return resp
    raise SsrfError(f"för många redirects (>{max_redirects})")
