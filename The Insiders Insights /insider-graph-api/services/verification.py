"""Gemensam verifieringsrutin — "Manually verified by Geogiraph" (spec §7).

`run_verification()` är REN (ingen I/O) → enhetstestbar utan Firestore. Den löser de fyra
generiska kontrollerna (§7.2), begränsar den ops-valda assurance-nivån av checklistan
(§7.5), och fäller verdikt + stämpeltext. `to_claim_source()` ger den `ClaimSource` som
culture-claim-deriveringen (#4) / ops-flödet (#3) hänger på rätt claim. `persist_verification()`
skriver recordet och returnerar dess id.

Designprincip: nivån ops väljer är fri VILJA INOM GRINDEN — checklistan hindrar bara
glidning (utan "oberoende" kan independently_assured inte väljas). Self_declared (bolagets
ord) blir source_kind="manual" och rör ALDRIG demonstrated-poängen (§8).
"""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone

import firestore_client as fs
from schemas import (
    Claim,
    ClaimSource,
    Verification,
    VerificationSubmission,
)
from services.verification_profiles import EvidenceProfile, get_profile

log = logging.getLogger(__name__)

CHECK_NAMES = ("independence", "methodology", "freshness", "traceability")


# --- datumhjälp (ingen extern dep) ------------------------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_date(iso: str | None) -> datetime | None:
    if not iso:
        return None
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return None


def _add_months(dt: datetime, months: int) -> datetime:
    m = dt.month - 1 + months
    year = dt.year + m // 12
    month = m % 12 + 1
    leap = year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)
    days_in = [31, 29 if leap else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    return dt.replace(year=year, month=month, day=min(dt.day, days_in[month - 1]))


# --- de fyra kontrollerna (§7.2) --------------------------------------------

def _methodology_ok(submission: VerificationSubmission, profile: EvidenceProfile) -> bool:
    """Krävda fält finns OCH trösklar möts."""
    meth = submission.methodology or {}
    if any(f not in meth for f in profile.required_fields):
        return False
    th = profile.threshold or {}
    if "min_sample_n" in th:
        n = meth.get("sample_n")
        if not isinstance(n, (int, float)) or n < th["min_sample_n"]:
            return False
    if "min_response_rate" in th:
        rr = meth.get("response_rate")
        if not isinstance(rr, (int, float)) or rr < th["min_response_rate"]:
            return False
    return True


def _freshness_ok(document_date: str | None, validity_months: int) -> tuple[bool, str | None]:
    """Inom giltighetsfönstret? Returnerar (ok, expires_at_iso)."""
    dt = _parse_date(document_date)
    if dt is None:
        return False, None
    expires = _add_months(dt, validity_months)
    now = datetime.now(dt.tzinfo) if dt.tzinfo else datetime.utcnow()
    return now <= expires, expires.isoformat()


def _resolve_checks(
    submission: VerificationSubmission, profile: EvidenceProfile
) -> tuple[dict[str, bool], str | None]:
    """Lös de fyra kontrollerna. public_registry auto-godkänner oberoende+spårbarhet."""
    ops = submission.ops_checks or {}
    auto = profile.verification_mode == "public_registry"
    fresh, expires_at = _freshness_ok(submission.document_date, profile.default_validity_months)
    checks = {
        "independence": True if auto else bool(ops.get("independence", False)),
        "methodology": _methodology_ok(submission, profile),
        "freshness": fresh,
        "traceability": True if auto else bool(ops.get("traceability", False)),
    }
    return checks, expires_at


# --- assurance-grinden (§7.5) -----------------------------------------------

def allowed_assurance_levels(checks: dict[str, bool]) -> list[str]:
    """Vilka nivåer checklistan tillåter. self_declared alltid; högre kräver fler bockar."""
    levels = ["self_declared"]
    if checks.get("independence") and checks.get("methodology") and checks.get("traceability"):
        levels.append("third_party_reviewed")
        if checks.get("freshness"):
            levels.append("independently_assured")
    return levels


def render_verification_text(profile: EvidenceProfile, submission: VerificationSubmission) -> str:
    instrument = submission.instrument_or_issuer or "underlaget"
    date = submission.document_date or "okänt datum"
    try:
        return profile.verification_template.format(instrument=instrument, date=date)
    except (KeyError, IndexError):
        return profile.verification_template


# --- rutinen ----------------------------------------------------------------

def run_verification(
    submission: VerificationSubmission, profile: EvidenceProfile | None = None
) -> Verification:
    """Ren verifieringslogik. Höjer ValueError vid okänd bevistyp eller otillåten nivå."""
    profile = profile or get_profile(submission.evidence_type)
    if profile is None:
        raise ValueError(f"unknown evidence_type: {submission.evidence_type}")

    now = _now_iso()

    # Explicit avvisning → inget claim.
    if submission.rejected_reason:
        return Verification(
            evidence_type=submission.evidence_type, subject=submission.subject,
            artifact_ref=submission.artifact_ref,
            instrument_or_issuer=submission.instrument_or_issuer,
            document_date=submission.document_date, methodology=submission.methodology,
            checks={}, assurance_level=None, verdict="rejected",
            verification_text=f"Avvisad: {submission.rejected_reason}",
            verified_by=submission.verified_by, verified_at=now,
        )

    checks, expires_at = _resolve_checks(submission, profile)
    allowed = allowed_assurance_levels(checks)

    chosen = submission.chosen_assurance_level or profile.suggested_assurance_level
    if chosen not in allowed:
        raise ValueError(
            f"assurance_level '{chosen}' inte tillåten av checklistan; tillåtna: {allowed}"
        )

    verdict = "self_declared" if chosen == "self_declared" else "verified"
    return Verification(
        evidence_type=submission.evidence_type, subject=submission.subject,
        artifact_ref=submission.artifact_ref,
        instrument_or_issuer=submission.instrument_or_issuer,
        document_date=submission.document_date, methodology=submission.methodology,
        checks=checks, assurance_level=chosen, verdict=verdict,
        verification_text=render_verification_text(profile, submission),
        verified_by=submission.verified_by, verified_at=now,
        expires_at=expires_at if verdict == "verified" else None,
    )


def to_claim_source(verification: Verification, verification_id: str | None = None) -> ClaimSource | None:
    """Den ClaimSource ett stött claim ska bära. None om verdict=rejected."""
    if verification.verdict == "rejected":
        return None
    kind = "manual" if verification.assurance_level == "self_declared" else "attested"
    return ClaimSource(
        kind=kind,
        label=verification.verification_text,
        attested_at=verification.verified_at if kind == "attested" else None,
        assurance_level=verification.assurance_level,
        verification_id=verification_id,
    )


# --- claim-byggare ----------------------------------------------------------

def verified_claim_id(verification: Verification) -> str:
    """Deterministiskt id → ny uppladdning för samma subjekt skriver ÖVER, ej dubblett."""
    s = verification.subject
    key = f"{verification.evidence_type}|{s.domain}|{s.dimension}|{s.metric}|{s.predicate}"
    return "vc-" + hashlib.sha1(key.encode("utf-8")).hexdigest()[:14]


def build_verified_claim(verification: Verification, claim_source: ClaimSource) -> Claim | None:
    """Bygg det stödda claimet (culture om domain=culture). None om verdict=rejected."""
    if verification.verdict == "rejected":
        return None
    s = verification.subject
    is_culture = s.domain == "culture"
    warmth_mode = None
    if is_culture:
        warmth_mode = "demonstrated" if verification.verdict == "verified" else "declared"
    return Claim(
        claim_kind="property" if s.predicate else "narrative",
        subject_ref="org",
        predicate=s.predicate,
        value=s.value,
        statement=(s.statement[:200] if s.statement else None),
        source=[claim_source],
        confidence=1.0,
        included_in_output=True,
        needs_review=False,
        review_status="approved",
        facet="culture" if is_culture else "operational",
        warmth_mode=warmth_mode,
        dimension=s.dimension if is_culture else None,
    )


# --- persistens -------------------------------------------------------------

def _verification_id(client_id: str, verification: Verification) -> str:
    key = "|".join(
        str(x) for x in (
            client_id, verification.evidence_type, verification.subject.metric,
            verification.document_date, verification.verified_at,
        )
    )
    return "ver-" + hashlib.sha1(key.encode("utf-8")).hexdigest()[:14]


def persist_verification(client_id: str, verification: Verification) -> str:
    """Skriv Verification-recordet. Returnerar dess id (att stoppa i ClaimSource)."""
    vid = _verification_id(client_id, verification)
    fs.verification_doc(client_id, vid).set(verification.model_dump())
    return vid
