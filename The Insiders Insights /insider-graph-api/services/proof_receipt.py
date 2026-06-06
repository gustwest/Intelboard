"""Kvitto på sanning (Spår D2) — månadens bevisföring, kundvänd och ärlig.

Ren sammanställning (ingen I/O i kärnan → enhetstestbar). Destillerar EN månads
faktiska aktivitet till ett "kvitto": vad vi UPPTÄCKTE, vad vi REKOMMENDERADE, vilka
gap som STÄNGDES, och hur mycket bevisarkivet växte. Bygger på riskloopens fakta
(detected_at/resolved_at/clean_streak) + bevisarkivet — INTE på perceptionstal.

Designregler (överenskomna guardrails):
  1. INGA perceptionstal (warmth/valens/salience). Kvittot rör risk-fakta + arkiv —
     aldrig den kalibreringsberoende uppfattningsaxeln. Recept-rader bär bara
     handling (dimension + kanal + status), aldrig siffror.
  2. Ord: "upptäckt", "rekommenderad", "stängd" — ALDRIG "fixad"/"korrigerad".
     "Stängd" = motorernas svar har varit rena N cykler (clean_streak), vilket är
     empiriskt sant oberoende av leverans-status.
  3. Tyst månad är en giltig månad: hände inget → en ärlig, positiv rad
     ("AI höll bilden stabil"), aldrig påhittad aktivitet.
"""
from __future__ import annotations

from typing import Any, Iterable


def _iso(value: Any) -> str | None:
    """Firestore-timestamp/str/datetime → ISO-sträng (samma mönster som monthly_report)."""
    if not value:
        return None
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def _in_month(value: Any, month: str) -> bool:
    """True om tidsstämpeln faller i `month` (YYYY-MM)."""
    iso = _iso(value)
    return bool(iso) and iso[:7] == month


def _count(values: Iterable[Any]) -> dict[str, int]:
    out: dict[str, int] = {}
    for v in values:
        if v:
            out[str(v)] = out.get(str(v), 0) + 1
    return out


def _detected_item(f: dict[str, Any]) -> dict[str, Any]:
    return {
        "question": f.get("question"),
        "engine": f.get("engine"),
        "harm": f.get("harm"),
        "severity": f.get("severity"),
        "persona": f.get("persona"),
        "detected_at": _iso(f.get("detected_at")),
    }


def _resolved_item(f: dict[str, Any]) -> dict[str, Any]:
    return {
        "question": f.get("question"),
        "engine": f.get("engine"),
        "persona": f.get("persona"),
        "clean_streak": f.get("clean_streak"),
        "resolved_at": _iso(f.get("resolved_at")),
    }


def _recommended_item(r: dict[str, Any]) -> dict[str, Any]:
    """Bara HANDLING — dimension, kanal, status. Inga perceptionstal (guardrail 1)."""
    skeleton = r.get("skeleton") or {}
    details = r.get("details") or {}
    return {
        "dimension": skeleton.get("dimension"),
        "channel": details.get("prioritized_channel"),
        "status": r.get("status"),
        "created_at": _iso(r.get("created_at")),
    }


def build_receipt(
    month: str,
    company_name: str,
    *,
    findings: Iterable[tuple[str, dict[str, Any]]] | Iterable[dict[str, Any]],
    recipes: Iterable[tuple[str, dict[str, Any]]] | Iterable[dict[str, Any]],
    archive_entries: list[dict[str, Any]],
) -> dict[str, Any]:
    """Bygg månadens kvitto. `findings`/`recipes` accepterar både (id, dict)- och
    dict-iteratorer (fs.iter_* ger tuples). `archive_entries` = poster ur
    services/proof_archive.build_archive (redan filtrerade till verifierade claims)."""
    finding_dicts = [x[1] if isinstance(x, tuple) else x for x in findings]
    recipe_dicts = [x[1] if isinstance(x, tuple) else x for x in recipes]

    detected = [
        f for f in finding_dicts
        if f.get("harm") not in (None, "ok") and _in_month(f.get("detected_at"), month)
    ]
    resolved = [
        f for f in finding_dicts
        if f.get("status") == "resolved" and _in_month(f.get("resolved_at"), month)
    ]
    recommended = [
        r for r in recipe_dicts
        if r.get("status") != "dismissed" and _in_month(r.get("created_at"), month)
    ]
    new_claims = [e for e in archive_entries if (e.get("as_of") or "")[:7] == month]

    quiet = not detected and not resolved and not new_claims and not recommended
    if quiet:
        headline = (
            f"AI-motorerna höll {company_name}s bild stabil den här månaden — "
            "inga nya gap upptäcktes och inga öppna risker."
        )
    else:
        headline = (
            f"{len(detected)} upptäckta, {len(resolved)} stängda, "
            f"{len(recommended)} rekommenderade åtgärder, "
            f"{len(new_claims)} nya verifierade påståenden i bevisarkivet."
        )

    return {
        "month": month,
        "company_name": company_name,
        "quiet_month": quiet,
        "headline": headline,
        "detected": {
            "count": len(detected),
            "by_engine": _count(f.get("engine") for f in detected),
            "by_harm": _count(f.get("harm") for f in detected),
            "items": sorted(
                (_detected_item(f) for f in detected),
                key=lambda r: r.get("detected_at") or "", reverse=True,
            ),
        },
        "recommended": {
            "count": len(recommended),
            "by_channel": _count(((r.get("details") or {}).get("prioritized_channel")) for r in recommended),
            "items": [_recommended_item(r) for r in recommended],
        },
        "resolved": {
            "count": len(resolved),
            "items": sorted(
                (_resolved_item(f) for f in resolved),
                key=lambda r: r.get("resolved_at") or "", reverse=True,
            ),
        },
        "archive_growth": {
            "new_this_month": len(new_claims),
            "total": len(archive_entries),
        },
    }
