"""P2/M3: e-postmaskering i loggar."""
import unittest
from services.log_redact import mask_email


class MaskEmailTest(unittest.TestCase):
    def test_masks_local_part_keeps_domain(self):
        self.assertEqual(mask_email("benjamin@theinsiders.se"), "b***@theinsiders.se")

    def test_masks_all_in_string(self):
        out = mask_email("to=anna@x.com from=bo@y.se")
        self.assertNotIn("anna@", out)
        self.assertNotIn("bo@", out)
        self.assertIn("@x.com", out)
        self.assertIn("@y.se", out)

    def test_empty_and_none(self):
        self.assertEqual(mask_email(None), "")
        self.assertEqual(mask_email(""), "")

    def test_non_email_untouched(self):
        self.assertEqual(mask_email("ingen adress här"), "ingen adress här")


if __name__ == "__main__":
    unittest.main()
