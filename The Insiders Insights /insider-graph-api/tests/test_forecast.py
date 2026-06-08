"""Tester för what-if-projektionen av beslutssäkerheten (#1a).

Testar den rena logiken (project_confidence + _coverage_simulation) utan Firestore —
projektionen återanvänder monthly_report._decision_confidence, så talen nedan är
handverifierade mot samma formel: score = round(min(100·safe/total, ceiling))."""
from __future__ import annotations

import fakefs  # installerar fake firestore_client — måste importeras först

from fastapi import HTTPException

from routers import forecast
from routers.forecast import _coverage_simulation
from services.monthly_report import (
    CONFIDENCE_CEILING,
    COVERAGE_CEILING,
    project_confidence,
)


def _findings(*specs: tuple[str, float]) -> list[dict]:
    """Bygg findings med doc-id och detection_rate. specs = (id, dr)."""
    return [{"_id": fid, "status": "open", "detection_rate": dr} for fid, dr in specs]


def test_linearity_each_resolved_finding_adds_100_over_total():
    abp = {"customer": 10, "talent": 5, "investor": 5}  # total 20, full täckning → tak 95
    open_f = _findings(*[(f"f{i}", 1.0) for i in range(5)])

    base = project_confidence(open_f, abp)["before"]
    assert base["score"] == 75  # safe 15 / 20

    one = project_confidence(open_f, abp, resolve_ids={"f0"})
    assert one["after"]["score"] == 80  # +100/20 = +5
    assert one["delta"] == 5
    assert one["resolved_count"] == 1


def test_resolving_past_ceiling_is_capped():
    abp = {"customer": 10, "talent": 5, "investor": 5}  # full täckning → tak 95
    open_f = _findings(*[(f"f{i}", 1.0) for i in range(5)])

    allres = project_confidence(open_f, abp, resolve_ids={f"f{i}" for i in range(5)})
    assert allres["after"]["score"] == CONFIDENCE_CEILING  # raw 100 kapas vid 95
    assert allres["after"]["score"] <= CONFIDENCE_CEILING


def test_coverage_lever_unlocks_ceiling_74_to_95():
    abp = {"customer": 10, "talent": 10}  # bara 2 personas → tak 74
    open_f: list[dict] = []  # inga findings → raw 100 men kapat av täckningstaket

    before = project_confidence(open_f, abp)["before"]
    assert before["score"] == COVERAGE_CEILING  # 74
    assert before["ceiling"] == COVERAGE_CEILING

    sim = _coverage_simulation(abp)
    assert sim == {"investor": 10}  # median av täckta (10,10) fyller otäckt persona

    proj = project_confidence(open_f, abp, simulate_persona_answers=sim)
    assert proj["after"]["ceiling"] == CONFIDENCE_CEILING  # 95
    assert proj["after"]["score"] == CONFIDENCE_CEILING
    assert proj["ceiling_unlocked"] == CONFIDENCE_CEILING - COVERAGE_CEILING  # +21
    assert proj["delta"] == CONFIDENCE_CEILING - COVERAGE_CEILING


def test_band_grindar_smaa_roerelser_som_brus():
    # 6 vingliga findings (dr=0.5) → brett band; total 20, full täckning.
    abp = {"customer": 10, "talent": 5, "investor": 5}
    open_f = _findings(*[(f"f{i}", 0.5) for i in range(6)])

    base = project_confidence(open_f, abp)["before"]
    assert base["score"] == 70  # safe 14 / 20

    # Lösa 1 → +5; bandet (≈±12 vid 1.96·SE) är bredare → inte en trovärdig rörelse.
    one = project_confidence(open_f, abp, resolve_ids={"f0"})
    assert one["delta"] == 5
    assert one["exceeds_band"] is False

    # Lösa 3 → +15; överstiger bandet → trovärdig rörelse.
    three = project_confidence(open_f, abp, resolve_ids={"f0", "f1", "f2"})
    assert three["delta"] == 15
    assert three["exceeds_band"] is True


def test_robust_findings_contribute_zero_band():
    abp = {"customer": 10, "talent": 5, "investor": 5}
    open_f = _findings(*[(f"f{i}", 1.0) for i in range(5)])  # alla dr=1 → SE 0
    res = project_confidence(open_f, abp, resolve_ids={"f0"})
    assert res["before"]["score_se"] == 0.0
    assert res["exceeds_band"] is True  # alla rörelser > 0 överstiger ett noll-band


def test_coverage_simulation_empty_when_no_personas_covered():
    assert _coverage_simulation({}) == {}
    assert _coverage_simulation({"customer": 0, "talent": 0, "investor": 0}) == {}


def test_coverage_simulation_noop_when_already_full():
    sim = _coverage_simulation({"customer": 4, "talent": 4, "investor": 4})
    assert sim == {}


def test_unmeasured_client_yields_none_score_and_no_delta():
    proj = project_confidence([], {})
    assert proj["before"]["score"] is None
    assert proj["delta"] is None
    assert proj["exceeds_band"] is False


# --- endpoint (Firestore-laddningsvägen via fakefs) --------------------------


def test_endpoint_missing_client_404():
    fakefs.reset(client=None)
    try:
        forecast.whatif_confidence("ghost", forecast.WhatIfRequest())
        assert False, "förväntade 404"
    except HTTPException as exc:
        assert exc.status_code == 404


def test_endpoint_resolves_open_finding():
    fakefs.reset(
        client={"company_name": "Acme AB"},
        risk_findings={
            "f1": {"status": "open", "persona": "customer", "detection_rate": 1.0},
            "f2": {"status": "open", "persona": "talent", "detection_rate": 1.0},
            "done": {"status": "resolved", "persona": "investor", "detection_rate": 1.0},
        },
        risk_run_summary={"answers_by_persona": {"customer": 10, "talent": 5, "investor": 5}},
    )
    out = forecast.whatif_confidence(
        "acme", forecast.WhatIfRequest(resolve_finding_ids=["f1"])
    )
    # 2 öppna findings av 20 svar → safe 18 → 90; lösa 1 → 95 (kapas vid taket).
    assert out["before"]["score"] == 90
    assert out["after"]["score"] == 95
    assert out["resolved_count"] == 1
    # 'resolved'-finding ska inte räknas som öppen.
    assert out["before"]["answers"] == 20


def test_endpoint_coverage_simulation_unlocks_ceiling():
    fakefs.reset(
        client={"company_name": "Acme AB"},
        risk_findings={},
        risk_run_summary={"answers_by_persona": {"customer": 10, "talent": 10}},
    )
    out = forecast.whatif_confidence(
        "acme", forecast.WhatIfRequest(simulate_full_coverage=True)
    )
    assert out["before"]["score"] == COVERAGE_CEILING
    assert out["after"]["score"] == CONFIDENCE_CEILING
    assert out["ceiling_unlocked"] == CONFIDENCE_CEILING - COVERAGE_CEILING
