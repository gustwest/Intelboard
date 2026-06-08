"""P1-F: säkerhetsheaders på alla svar + badge undantas X-Frame-Options (embeddas på
kundsajter). Importerar hela appen (fakefs stubbar firestore)."""
import unittest

import fakefs  # noqa: F401 — stubbar firestore_client före main
from fastapi.testclient import TestClient

import main


class SecurityHeadersTest(unittest.TestCase):
    def setUp(self):
        self.c = TestClient(main.app, raise_server_exceptions=False)

    def test_core_headers_present(self):
        h = self.c.get("/health").headers
        self.assertEqual(h.get("strict-transport-security"), "max-age=31536000; includeSubDomains")
        self.assertEqual(h.get("x-content-type-options"), "nosniff")
        self.assertEqual(h.get("referrer-policy"), "strict-origin-when-cross-origin")

    def test_frame_options_deny_on_normal_paths(self):
        self.assertEqual(self.c.get("/health").headers.get("x-frame-options"), "DENY")

    def test_badge_is_exempt_from_frame_options(self):
        # Badgen ska kunna embeddas (iframe) på kundens sajt → ingen frame-deny.
        fakefs.reset(client={"company_name": "Acme AB"})
        h = self.c.get("/api/badge/acme").headers
        self.assertIsNone(h.get("x-frame-options"))
        # Men de övriga skydden gäller även badgen.
        self.assertEqual(h.get("x-content-type-options"), "nosniff")


if __name__ == "__main__":
    unittest.main()
