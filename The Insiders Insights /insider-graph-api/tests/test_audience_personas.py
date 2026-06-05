"""Tester för den kanoniska persona-vokabulären + alias-normaliseringen (städning
av buyer/candidate → customer/employee över risk-, ICP- och warmth-systemen)."""
import unittest

from services import audience_personas as ap


class NormalizeTest(unittest.TestCase):
    def test_canonical_set(self):
        self.assertEqual(ap.CANONICAL, ("customer", "talent", "investor"))

    def test_old_ids_map_to_canonical(self):
        self.assertEqual(ap.normalize("buyer"), "customer")
        # Båda talang-livscykelfaserna → talent.
        self.assertEqual(ap.normalize("candidate"), "talent")
        self.assertEqual(ap.normalize("employee"), "talent")

    def test_canonical_passes_through(self):
        for p in ap.CANONICAL:
            self.assertEqual(ap.normalize(p), p)

    def test_unknown_and_none_pass_through(self):
        self.assertEqual(ap.normalize("partner"), "partner")
        self.assertIsNone(ap.normalize(None))

    def test_normalize_keys_merges_numeric(self):
        # buyer→customer; om både gammalt och nytt id finns summeras talen.
        out = ap.normalize_keys({"buyer": 5, "customer": 2, "investor": 3})
        self.assertEqual(out, {"customer": 7, "investor": 3})

    def test_normalize_keys_handles_empty(self):
        self.assertEqual(ap.normalize_keys(None), {})


if __name__ == "__main__":
    unittest.main()
