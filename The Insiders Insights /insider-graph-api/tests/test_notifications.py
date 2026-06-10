"""Enhetstester för utgående notifieringar (services/notifications.py). Inget nätverk."""
import unittest

from services import notifications as n


class NotificationsTest(unittest.TestCase):
    def setUp(self):
        self._orig = (n.settings.brevo_api_key, n.settings.notify_from_email, n.settings.ops_notify_email, n._deliver)

    def tearDown(self):
        n.settings.brevo_api_key, n.settings.notify_from_email, n.settings.ops_notify_email, n._deliver = self._orig

    def _configure(self):
        n.settings.brevo_api_key = "SG.x"
        n.settings.notify_from_email = "noreply@geogiraph.com"
        n.settings.ops_notify_email = "ops@geogiraph.com"

    def test_noop_when_unconfigured(self):
        n.settings.brevo_api_key = ""
        result = n.send_quarterly_reminder("acme", {"company_name": "Acme AB"}, "msg")
        self.assertEqual(result, {"sent": False, "reason": "not_configured"})

    def test_noop_when_no_ops_recipient(self):
        self._configure()
        n.settings.ops_notify_email = ""
        result = n.send_quarterly_reminder("acme", {"company_name": "Acme AB"}, "msg")
        self.assertEqual(result["reason"], "not_configured")

    def test_sends_to_internal_ops_and_names_customer(self):
        self._configure()
        sent: list = []
        n._deliver = lambda to, subject, body: sent.append((to, subject, body))
        result = n.send_quarterly_reminder("acme", {"company_name": "Acme AB"}, "msg")
        self.assertTrue(result["sent"])
        self.assertEqual(result["to"], "ops@geogiraph.com")  # internt, ej kunden
        to, subject, body = sent[0]
        self.assertEqual(to, "ops@geogiraph.com")
        self.assertIn("Acme AB", subject)  # ops ser vilken kund
        self.assertIn("acme", body)

    def test_send_failure_is_caught(self):
        self._configure()
        def boom(*a):
            raise RuntimeError("brevo nere")
        n._deliver = boom
        result = n.send_quarterly_reminder("acme", {"company_name": "Acme AB"}, "msg")
        self.assertEqual(result, {"sent": False, "reason": "send_failed"})

    # --- send_customer_email (Spår B: kundvänt utskick) ---

    def test_customer_email_noop_unconfigured(self):
        n.settings.brevo_api_key = ""
        result = n.send_customer_email("vd@acme.se", "sub", "<b>h</b>", "t")
        self.assertEqual(result["reason"], "not_configured")

    def test_customer_email_noop_without_contact(self):
        self._configure()
        result = n.send_customer_email(None, "sub", "<b>h</b>", "t")
        self.assertEqual(result["reason"], "no_contact")

    def test_customer_email_sends_html_to_contact(self):
        self._configure()
        sent: list = []
        n._deliver = lambda to, subject, body, html=None, cc=None: sent.append((to, body, html))
        result = n.send_customer_email("vd@acme.se", "sub", "<b>h</b>", "ren text")
        self.assertTrue(result["sent"])
        self.assertEqual(result["to"], "vd@acme.se")
        to, body, html = sent[0]
        self.assertEqual(to, "vd@acme.se")
        self.assertEqual(body, "ren text")   # plain-text fallback
        self.assertEqual(html, "<b>h</b>")   # html-variant

    def test_customer_email_cc_secondary_contacts(self):
        # N2: sekundärkontakter cc:as; dubblett av huvudkontakten rensas.
        self._configure()
        sent: list = []
        n._deliver = lambda to, subject, body, html=None, cc=None: sent.append((to, cc))
        result = n.send_customer_email(
            "vd@acme.se", "sub", "<b>h</b>", "t", cc=["webb@acme.se", "vd@acme.se", ""],
        )
        self.assertTrue(result["sent"])
        self.assertEqual(result["cc"], ["webb@acme.se"])  # dedupe mot to + tomma bort
        self.assertEqual(sent[0][1], ["webb@acme.se"])


if __name__ == "__main__":
    unittest.main()
