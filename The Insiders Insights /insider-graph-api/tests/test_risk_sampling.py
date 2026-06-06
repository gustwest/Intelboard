"""P0-tester: upprepad sampling + detektionsrate i risk-loopen (services/risk_detector).

Varje (fråga × motor) ställs N gånger; varje fynd får en detection_rate = k/N och en
risk räknas som ren bara om 0/N körningar flaggar. Motoranrop + klassning mockas."""
import os
import unittest

import fakefs  # noqa: F401 — installerar fake firestore_client innan service-import
from services import risk_detector as rd
from services.risk_detector import RiskFinding


def _approved_q(persona, track, text, **over):
    base = {"persona": persona, "track": track, "text": text, "language": "sv", "status": "approved"}
    base.update(over)
    return base


class RiskRunsEnvTest(unittest.TestCase):
    def tearDown(self):
        os.environ.pop("RISK_RUNS_PER_QUERY", None)

    def test_clamp_and_default(self):
        for val, exp in [("1", 1), ("3", 3), ("9", 7), ("0", 1), ("bad", 3)]:
            os.environ["RISK_RUNS_PER_QUERY"] = val
            self.assertEqual(rd._runs_per_query(), exp)
        os.environ.pop("RISK_RUNS_PER_QUERY", None)
        self.assertEqual(rd._runs_per_query(), 3)  # default


class DetectionRateTest(unittest.TestCase):
    def setUp(self):
        self._orig = (rd.llm_factory.make_validator, rd._build_engines, rd._ask,
                      rd.classify, rd._should_follow_up, rd._runs_per_query)

    def tearDown(self):
        (rd.llm_factory.make_validator, rd._build_engines, rd._ask,
         rd.classify, rd._should_follow_up, rd._runs_per_query) = self._orig

    def _setup(self, runs):
        fakefs.reset(client={"company_name": "Acme AB"},
                     risk_questions={"qh": _approved_q("customer", "A", "Har Acme tvister?")})
        rd.llm_factory.make_validator = lambda: object()
        rd._build_engines = lambda: {"gpt-4o": object()}
        rd._runs_per_query = lambda: runs
        rd._should_follow_up = lambda cls: False
        rd._ask = lambda q, llm: "svar"

    def test_partial_detection_rate(self):
        # Skada i 2 av 4 körningar → detection_rate 0.5, n_runs 4, allvarligaste utfallet behålls.
        self._setup(runs=4)
        seq = iter([True, False, True, False])

        def fake_classify(llm, q, ans, ctx):
            return (RiskFinding("customer", "A", q.text, "", "#3", "high", "none", "x")
                    if next(seq) else RiskFinding("customer", "A", q.text, "", "ok", "", "", ""))

        rd.classify = fake_classify
        result = rd.run_for_client("acme")
        self.assertEqual(len(result.findings), 1)
        doc = next(iter(fakefs.STATE["risk_findings"].values()))
        self.assertAlmostEqual(doc["detection_rate"], 0.5)
        self.assertEqual(doc["n_runs"], 4)
        self.assertEqual(doc["harm"], "#3")

    def test_all_clean_persists_nothing(self):
        # 0/3 körningar flaggar → inget fynd persisteras (ren signal, inte flimmer).
        self._setup(runs=3)
        rd.classify = lambda *a: RiskFinding("customer", "A", "Har Acme tvister?", "", "ok", "", "", "")
        result = rd.run_for_client("acme")
        self.assertEqual(result.findings, [])
        self.assertEqual(fakefs.STATE["risk_findings"], {})

    def test_full_detection_rate(self):
        self._setup(runs=3)
        rd.classify = lambda *a: RiskFinding("customer", "A", "Har Acme tvister?", "", "#1", "high", "none", "x")
        rd.run_for_client("acme")
        doc = next(iter(fakefs.STATE["risk_findings"].values()))
        self.assertAlmostEqual(doc["detection_rate"], 1.0)
        self.assertEqual(doc["n_runs"], 3)


if __name__ == "__main__":
    unittest.main()
