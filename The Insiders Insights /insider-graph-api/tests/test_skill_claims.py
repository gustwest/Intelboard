"""Enhetstester för kompetens-härledning med avklingning (schema_org.claims.derive_skill_claims)."""
import unittest
from datetime import datetime, timedelta, timezone

import fakefs  # installerar fake firestore_client — måste importeras först
from schema_org.claims import derive_skill_claims

NOW = datetime(2026, 5, 26, tzinfo=timezone.utc)


def _months_ago(months: float) -> datetime:
    return NOW - timedelta(days=months * 30.4375)


class DeriveSkillClaimsTest(unittest.TestCase):
    def test_active_job_full_confidence(self):
        fakefs.reset(
            company_items={
                "jobposting-1": {
                    "schema_type": "JobPosting",
                    "included_in_output": True,
                    "extra": {"name": "Cloud Engineer", "skills": ["AWS", "Kubernetes"]},
                }
            }
        )
        claims = list(derive_skill_claims("acme", NOW))
        self.assertEqual(len(claims), 2)
        for c in claims:
            self.assertEqual(c.predicate, "knowsAbout")
            self.assertEqual(c.subject_ref, "org")
            self.assertEqual(c.confidence, 1.0)
            self.assertEqual(c.source[0].item_id, "jobposting-1")
        self.assertEqual({c.value for c in claims}, {"AWS", "Kubernetes"})

    def test_closed_job_decays(self):
        fakefs.reset(
            company_items={
                "jobposting-2": {
                    "schema_type": "JobPosting",
                    "included_in_output": False,
                    "closed_at": _months_ago(8),  # 6–12 mån → 0.7
                    "extra": {"skills": ["ISO 27001"]},
                }
            }
        )
        claims = list(derive_skill_claims("acme", NOW))
        self.assertEqual(len(claims), 1)
        self.assertEqual(claims[0].value, "ISO 27001")
        self.assertEqual(claims[0].confidence, 0.7)

    def test_sunset_job_yields_nothing(self):
        fakefs.reset(
            company_items={
                "jobposting-3": {
                    "schema_type": "JobPosting",
                    "included_in_output": False,
                    "closed_at": _months_ago(30),  # > 24 mån → härleds inte
                    "extra": {"skills": ["AWS"]},
                }
            }
        )
        self.assertEqual(list(derive_skill_claims("acme", NOW)), [])

    def test_non_jobposting_ignored(self):
        fakefs.reset(
            company_items={
                "org1": {
                    "schema_type": "Organization",
                    "included_in_output": True,
                    "extra": {"skills": ["AWS"]},  # skills på fel typ → ignoreras
                }
            }
        )
        self.assertEqual(list(derive_skill_claims("acme", NOW)), [])

    def test_strategic_false_yields_nothing(self):
        # generisk roll filtrerad av job_enrichment (spec §2.2) → inga kompetens-claims
        fakefs.reset(
            company_items={
                "jp-generic": {
                    "schema_type": "JobPosting",
                    "included_in_output": True,
                    "strategic": False,
                    "extra": {"skills": ["AWS"]},
                }
            }
        )
        self.assertEqual(list(derive_skill_claims("acme", NOW)), [])

    def test_enriched_skills_win_over_baseline(self):
        fakefs.reset(
            company_items={
                "jp-enriched": {
                    "schema_type": "JobPosting",
                    "included_in_output": True,
                    "strategic": True,
                    "skills_enriched": ["Digital Transformation"],
                    "extra": {"skills": ["AWS"]},  # baslinje ignoreras när berikning finns
                }
            }
        )
        claims = list(derive_skill_claims("acme", NOW))
        self.assertEqual([c.value for c in claims], ["Digital Transformation"])

    def test_no_skills_ignored(self):
        fakefs.reset(
            company_items={
                "jobposting-4": {"schema_type": "JobPosting", "included_in_output": True, "extra": {"skills": []}},
            }
        )
        self.assertEqual(list(derive_skill_claims("acme", NOW)), [])


class DualSourceTest(unittest.TestCase):
    def _verified_snapshot(self, skills):
        return {"s1": {"status": "VERIFIED", "is_active": True, "skills": skills}}

    def test_dual_source_bumps_decayed_skill_to_full_with_two_sources(self):
        fakefs.reset(
            client={"company_linkedin_url": "https://linkedin.com/company/acme"},
            company_items={
                "jp": {
                    "schema_type": "JobPosting",
                    "included_in_output": False,
                    "closed_at": _months_ago(18),  # annars 0.4
                    "extra": {"skills": ["AWS"]},
                }
            },
            linkedin_snapshots=self._verified_snapshot(["aws"]),  # matchar oavsett skiftläge
        )
        claims = list(derive_skill_claims("acme", NOW))
        self.assertEqual(len(claims), 1)
        self.assertEqual(claims[0].value, "AWS")
        self.assertEqual(claims[0].confidence, 1.0)  # re-verifierad → 1.0
        kinds = {s.kind for s in claims[0].source}
        self.assertEqual(kinds, {"item", "attested"})  # Dual-Source Truth

    def test_sunset_skill_rescued_by_linkedin(self):
        fakefs.reset(
            client={},
            company_items={
                "jp": {"schema_type": "JobPosting", "included_in_output": False,
                       "closed_at": _months_ago(30), "extra": {"skills": ["AWS"]}}
            },
            linkedin_snapshots=self._verified_snapshot(["AWS"]),
        )
        claims = list(derive_skill_claims("acme", NOW))
        self.assertEqual([c.value for c in claims], ["AWS"])  # överlever sunset via LinkedIn
        self.assertEqual(claims[0].confidence, 1.0)

    def test_linkedin_only_skill_emitted_as_attested(self):
        fakefs.reset(
            client={},
            company_items={
                "jp": {"schema_type": "JobPosting", "included_in_output": True, "extra": {"skills": ["AWS"]}}
            },
            linkedin_snapshots=self._verified_snapshot(["AWS", "Leadership"]),
        )
        claims = list(derive_skill_claims("acme", NOW))
        by_val = {c.value: c for c in claims}
        self.assertEqual(set(by_val), {"AWS", "Leadership"})
        self.assertEqual(by_val["Leadership"].source[0].kind, "attested")  # bara LinkedIn
        self.assertEqual({s.kind for s in by_val["AWS"].source}, {"item", "attested"})  # dual

    def test_pending_snapshot_does_not_count(self):
        fakefs.reset(
            client={},
            company_items={
                "jp": {"schema_type": "JobPosting", "included_in_output": False,
                       "closed_at": _months_ago(18), "extra": {"skills": ["AWS"]}}
            },
            linkedin_snapshots={"s1": {"status": "PENDING_INTERNAL_VERIFICATION", "is_active": False, "skills": ["AWS"]}},
        )
        claims = list(derive_skill_claims("acme", NOW))
        self.assertEqual(claims[0].confidence, 0.4)  # ej verifierat → ingen bump


if __name__ == "__main__":
    unittest.main()
