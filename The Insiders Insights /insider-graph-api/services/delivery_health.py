"""P2 — leverans-hälsoverifiering (intern motpart till Spår B).

Spår B lämnar över snutt + profilsida till kunden. P2 är ops-kontrollen som svarar
på frågan "är leveransen FAKTISKT live?" — så att vi inte påstår att ett gap är
stängt (D2) mot en kund vars sida aldrig publicerades.

Kontrollen hämtar kundens publika profilsida (den AI-motorerna kan läsa) och verifierar
fyra saker, från svagast till starkast krav:
  reachable      — sidan svarar 200.
  has_jsonld     — minst ett parsebart JSON-LD-block finns (snutten är installerad).
  identity_match — grafen pekar på rätt entitet (@id == kanoniken, eller bolagsnamnet).
  fresh          — Organization bär dateModified (A5) → inte en stale stub.

Verdikt: live > stale > mismatch > missing. `evaluate()` är REN (testbar utan nät);
`check_live()` gör hämtningen (httpx, injicerbar i test). Best-effort: nätverksfel →
verdict "missing", aldrig ett kastat undantag (ops-vyn ska alltid kunna rendera).
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from typing import Any, Callable

import httpx

from schema_org.urls import canonical_url, resolve_website, served_url
from services import safe_fetch

log = logging.getLogger(__name__)

USER_AGENT = "GeogiraphDeliveryHealth/1.0 (+https://geogiraph.com)"
FETCH_TIMEOUT_SEC = 15

_LDJSON_RE = re.compile(
    r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
    re.IGNORECASE | re.DOTALL,
)


def _http_get(url: str) -> tuple[int, str]:
    """GET → (status, text). Nät-/SSRF-fel → (0, "") (best-effort, fäller aldrig).
    SSRF-grindad: kundens website/profil-URL är kund-kontrollerad och får inte kunna
    rikta servern mot intern/metadata-adress."""
    try:
        resp = safe_fetch.safe_get(url, headers={"User-Agent": USER_AGENT}, timeout=FETCH_TIMEOUT_SEC)
        return resp.status_code, resp.text or ""
    except (httpx.HTTPError, safe_fetch.SsrfError) as exc:
        log.info("delivery-health: hämtning misslyckades för %s: %s", url, exc)
        return 0, ""


def _iter_nodes(parsed: Any):
    """Platta ut JSON-LD: lista, {@graph:[...]}, eller en ensam nod → noder en och en."""
    if isinstance(parsed, list):
        for item in parsed:
            yield from _iter_nodes(item)
    elif isinstance(parsed, dict):
        graph = parsed.get("@graph")
        if isinstance(graph, list):
            for item in graph:
                yield from _iter_nodes(item)
        else:
            yield parsed


def _parse_blocks(html: str) -> list[Any]:
    out: list[Any] = []
    for raw in _LDJSON_RE.findall(html or ""):
        try:
            out.append(json.loads(raw.strip()))
        except (ValueError, TypeError):
            continue  # ett trasigt block diskvalificerar inte resten
    return out


def evaluate(*, status: int, html: str, canonical: str, company_name: str) -> dict[str, Any]:
    """Ren utvärdering av en hämtad sida → checks + verdikt. Ingen I/O."""
    reachable = status == 200
    parsed = _parse_blocks(html) if reachable else []
    nodes = [n for block in parsed for n in _iter_nodes(block) if isinstance(n, dict)]
    has_jsonld = bool(nodes)

    canon = (canonical or "").rstrip("/").lower()
    company = (company_name or "").strip().lower()
    identity_match = False
    fresh = False
    for n in nodes:
        nid = str(n.get("@id") or "").rstrip("/").lower()
        name = str(n.get("name") or "").strip().lower()
        if (canon and nid == canon) or (company and name == company):
            identity_match = True
        if n.get("dateModified"):
            fresh = True

    if not reachable or not has_jsonld:
        verdict = "missing"
    elif not identity_match:
        verdict = "mismatch"
    elif not fresh:
        verdict = "stale"
    else:
        verdict = "live"

    return {
        "reachable": reachable,
        "has_jsonld": has_jsonld,
        "identity_match": identity_match,
        "fresh": fresh,
        "jsonld_blocks": len(parsed),
        "verdict": verdict,
        "is_live": verdict == "live",
    }


def check_live(
    client_id: str,
    client: dict[str, Any] | None = None,
    *,
    fetch: Callable[[str], tuple[int, str]] = _http_get,
) -> dict[str, Any]:
    """Hämta kundens profilsida och verifiera leveransen. `fetch` injicerbar i test.

    URL-val: den faktiskt publicerade `profile_url` (satt av compile-schema vid
    uppladdning) om den finns — annars den serverade adressen. Premium-kund med
    egen domän speglas i kanoniken."""
    client = client or {}
    url = client.get("profile_url") or served_url(client_id)
    canonical = canonical_url(client_id, client.get("profile_base_url"))
    company = client.get("company_name") or client_id

    status, html = fetch(url)
    checks = evaluate(status=status, html=html, canonical=canonical, company_name=company)
    return {
        "client_id": client_id,
        "url": url,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        **checks,
    }


def _http_get_no_redirect(url: str) -> tuple[int, str]:
    """GET utan att följa redirects, SSRF-grindad. Returnerar (status, text) — en 3xx
    returneras SOM-ÄR (varken följd eller rest) så premium-kollen kan skilja en äkta
    reverse-proxy (200 på kundens domän) från en felaktig redirect (3xx → vidare till oss).
    Nät-/SSRF-fel → (0, "")."""
    try:
        safe_fetch.assert_public_url(url)
        with httpx.Client(timeout=FETCH_TIMEOUT_SEC, follow_redirects=False) as client:
            resp = client.get(url, headers={"User-Agent": USER_AGENT})
        return resp.status_code, resp.text or ""
    except (httpx.HTTPError, safe_fetch.SsrfError) as exc:
        log.info("delivery-health: premium-hämtning misslyckades för %s: %s", url, exc)
        return 0, ""


def evaluate_premium(*, status: int, html: str, canonical: str, company_name: str) -> dict[str, Any]:
    """Ren utvärdering av premium-kundens EGNA domän (Väg A, reverse-proxy). Ett 3xx-svar
    betyder att 'proxyn' är en REDIRECT, inte en äkta proxy — då serveras innehållet inte
    på kundens domän och förstaparts-värdet tappas (verdict 'redirect', actionable). Annars
    samma krav som evaluate() men med kundens domän som kanonik."""
    if 300 <= status < 400:
        return {
            "reachable": False, "has_jsonld": False, "identity_match": False,
            "fresh": False, "jsonld_blocks": 0, "verdict": "redirect", "is_live": False,
        }
    return evaluate(status=status, html=html, canonical=canonical, company_name=company_name)


def check_premium_domain(
    client_id: str,
    client: dict[str, Any] | None = None,
    *,
    fetch: Callable[[str], tuple[int, str]] = _http_get_no_redirect,
) -> dict[str, Any]:
    """Verifiera att en premium-kunds EGNA domän serverar profilen via en äkta reverse-
    proxy (Väg A): 200 på kundens domän + canonical = kundens domän + riktig profil.
    Skiljer en redirect (verdict 'redirect') från en äkta proxy. check_live verifierar
    BARA vår hostade värd — den här stänger gapet att proxyn aldrig sattes upp/är fel.
    Icke-premium kund → 'not_premium' (inget att kontrollera). `fetch` injicerbar i test."""
    client = client or {}
    base = (client.get("profile_base_url") or "").rstrip("/")
    is_premium = client.get("tier") == "premium" and bool(base)
    out: dict[str, Any] = {
        "client_id": client_id,
        "domain": base or None,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }
    if not is_premium:
        return {**out, "reachable": False, "has_jsonld": False, "identity_match": False,
                "fresh": False, "verdict": "not_premium", "is_live": False}
    status, html = fetch(base)
    company = client.get("company_name") or client_id
    return {**out, **evaluate_premium(status=status, html=html, canonical=base, company_name=company)}


def evaluate_snippet(*, status: int, html: str, org_id: str) -> dict[str, Any]:
    """Ren utvärdering: ligger identitets-snutten (org-nodens `@id`) i den hämtade
    sidans JSON-LD? Matchar ENBART på `@id` (vår kanoniska org-IRI) — inte på namn,
    eftersom kundens egen sajt naturligt nämner bolagsnamnet och då skulle ge falskt
    positivt. Verdikt: installed > not_installed > unreachable."""
    reachable = status == 200
    parsed = _parse_blocks(html) if reachable else []
    nodes = [n for block in parsed for n in _iter_nodes(block) if isinstance(n, dict)]
    target = (org_id or "").rstrip("/").lower()
    installed = any(str(n.get("@id") or "").rstrip("/").lower() == target for n in nodes) if target else False

    if not reachable:
        verdict = "unreachable"
    elif installed:
        verdict = "installed"
    else:
        verdict = "not_installed"

    return {
        "reachable": reachable,
        "has_jsonld": bool(nodes),
        "snippet_installed": installed,
        "verdict": verdict,
    }


def check_snippet_on_site(
    client_id: str,
    client: dict[str, Any] | None = None,
    *,
    fetch: Callable[[str], tuple[int, str]] = _http_get,
) -> dict[str, Any]:
    """Verifiera att snutten faktiskt ligger på KUNDENS EGNA sajt — inte bara att vår
    hostade profilsida finns. Stänger gapet auditen flaggade: snutten kan vara
    överlämnad (B1) men aldrig inklistrad. Hämtar kundens website och letar org-nodens
    `@id`. Saknas website → verdict 'no_website' (inget att kontrollera mot)."""
    client = client or {}
    website = resolve_website(client)
    base = canonical_url(client_id, client.get("profile_base_url"))
    org_id = f"{base}#org"
    out: dict[str, Any] = {
        "client_id": client_id,
        "website": website,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }
    if not website:
        return {**out, "reachable": False, "has_jsonld": False,
                "snippet_installed": False, "verdict": "no_website"}
    status, html = fetch(website)
    return {**out, **evaluate_snippet(status=status, html=html, org_id=org_id)}
