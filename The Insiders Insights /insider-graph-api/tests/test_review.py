"""Enhetstester för claims-review-endpoints (routers/review.py)."""
import unittest

import fakefs  # installerar fake firestore_client — måste importeras först
from routers import review


def _pending_claim(**over):
    base = {
        "claim_kind": "narrative",
        "subject_ref": "org",
        "statement": "Ett osäkert påstående",
        "source": [{"kind": "item", "item_id": "src1"}],
        "confidence": 0.4,
        "included_in_output": False,
        "needs_review": True,
    }
    base.update(over)
    return base


class ClaimReviewTest(unittest.TestCase):
    def test_list_pending_returns_only_undecided_needs_review(self):
        fakefs.reset(
            client={"company_name": "Acme AB"},
            claims={
                "low": _pending_claim(confidence=0.3),
                "high": _pending_claim(needs_review=False, included_in_output=True, confidence=0.9),
                "done": _pending_claim(review_status="approved"),
            },
        )
        out = review.list_pending_claims("acme")
        ids = [i["id"] for i in out["items"]]
        self.assertEqual(ids, ["low"])

    def test_list_sorted_by_confidence_ascending(self):
        fakefs.reset(
            client={"company_name": "Acme AB"},
            claims={"a": _pending_claim(confidence=0.6), "b": _pending_claim(confidence=0.2)},
        )
        out = review.list_pending_claims("acme")
        self.assertEqual([i["id"] for i in out["items"]], ["b", "a"])

    def test_approve_includes_and_clears_review(self):
        fakefs.reset(client={"company_name": "Acme AB"}, claims={"c1": _pending_claim()})
        review.decide_claim("acme", "c1", review.ClaimReviewAction(decision="approve"))
        stored = fakefs.STATE["claims"]["c1"]
        self.assertTrue(stored["included_in_output"])
        self.assertFalse(stored["needs_review"])
        self.assertEqual(stored["review_status"], "approved")

    def test_approve_with_edited_statement(self):
        fakefs.reset(client={"company_name": "Acme AB"}, claims={"c1": _pending_claim()})
        review.decide_claim("acme", "c1", review.ClaimReviewAction(decision="approve", statement="Redigerat påstående"))
        self.assertEqual(fakefs.STATE["claims"]["c1"]["statement"], "Redigerat påstående")

    def test_reject_excludes(self):
        fakefs.reset(client={"company_name": "Acme AB"}, claims={"c1": _pending_claim()})
        review.decide_claim("acme", "c1", review.ClaimReviewAction(decision="reject"))
        stored = fakefs.STATE["claims"]["c1"]
        self.assertFalse(stored["included_in_output"])
        self.assertEqual(stored["review_status"], "rejected")


def _pending_q(**over):
    base = {"persona": "buyer", "track": "A", "text": "Har Acme tvister?", "language": "sv", "status": "open"}
    base.update(over)
    return base


class RiskQuestionReviewTest(unittest.TestCase):
    def test_list_only_pending(self):
        fakefs.reset(
            client={"company_name": "Acme AB"},
            risk_questions={"a": _pending_q(), "b": _pending_q(status="approved"), "c": _pending_q(status="rejected")},
        )
        out = review.list_pending_risk_questions("acme")
        self.assertEqual([i["id"] for i in out["questions"]], ["a"])

    def test_approve_marks_approved(self):
        fakefs.reset(client={"company_name": "Acme AB"}, risk_questions={"a": _pending_q()})
        review.decide_risk_question("acme", "a", review.RiskQuestionAction(decision="approve"))
        stored = fakefs.STATE["risk_questions"]["a"]
        self.assertEqual(stored["status"], "approved")
        self.assertFalse(stored["needs_review"])

    def test_approve_with_edited_text(self):
        fakefs.reset(client={"company_name": "Acme AB"}, risk_questions={"a": _pending_q()})
        review.decide_risk_question("acme", "a", review.RiskQuestionAction(decision="approve", text="Omformulerad fråga?"))
        self.assertEqual(fakefs.STATE["risk_questions"]["a"]["text"], "Omformulerad fråga?")

    def test_reject(self):
        fakefs.reset(client={"company_name": "Acme AB"}, risk_questions={"a": _pending_q()})
        review.decide_risk_question("acme", "a", review.RiskQuestionAction(decision="reject"))
        self.assertEqual(fakefs.STATE["risk_questions"]["a"]["status"], "rejected")


if __name__ == "__main__":
    unittest.main()
