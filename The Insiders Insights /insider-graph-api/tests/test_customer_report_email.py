"""B2: kund-säkert månadsmejl ur monthly_report.

Kärnkravet: ofarliga fält (beslutssäkerhet/trend/styrkor/förbättringar) tas med,
men INGA känsliga interna fält (motor-citat, harm-koder, frågor, åtgärder, narrativ-
utkast, humaniserings-detaljer) får läcka till kunden.
"""
import unittest

import fakefs  # installerar fake firestore_client — först
from config import settings
from routers import reports as reports_router
from services import monthly_report, notifications

# En rapportmodell med BÅDE ofarliga och känsliga fält. De känsliga är märkta
# HEMLIG* så testet entydigt kan fånga om något läcker.
MODEL = {
    "company_name": "Acme AB",
    "month": "2026-05",
    "verdict": "I 8 av 10 beslutskritiska frågor ger AI-motorerna en korrekt bild av er.",
    "decision_confidence": {"score": 72, "stage": "Stark", "next_step": "Bredda mätningen."},
    "trend": {"previous_score": 65, "resolved_count": 2},
    "strengths": ["Mot kund surfar ni korrekt."],
    "improvement_opportunities": ["2 öppna risker att möta."],
    # --- känsligt, får ALDRIG till kunden ---
    "detected": [{"engine": "ChatGPT", "engine_excerpt": "HEMLIGT_CITAT",
                  "question": "HEMLIG_FRÅGA", "harm": "#3"}],
    "actions": [{"action_taken": "HEMLIG_ÅTGÄRD"}],
    "draft_narrative": "HEMLIGT_UTKAST",
    "humanization": {"coverage_plain": "HEMLIG_HUMANIZATION"},
}

_SECRETS = ["HEMLIGT_CITAT", "HEMLIG_FRÅGA", "HEMLIG_ÅTGÄRD", "HEMLIGT_UTKAST",
            "HEMLIG_HUMANIZATION", "#3", "ChatGPT"]


class CustomerEmailRenderTest(unittest.TestCase):
    def test_includes_safe_fields(self):
        subject, html, text = monthly_report.render_customer_email(MODEL)
        self.assertIn("Acme AB", subject)
        self.assertIn("72/100", html)
        self.assertIn("Stark", html)
        self.assertIn("Mot kund surfar ni korrekt", html)
        self.assertIn("65 → 72", html)        # trend
        self.assertIn("förbättrad", html)
        self.assertIn("Bredda mätningen", html)
        self.assertIn("2 öppna risker att möta", text)

    def test_excludes_sensitive_fields(self):
        subject, html, text = monthly_report.render_customer_email(MODEL)
        blob = subject + html + text
        for secret in _SECRETS:
            self.assertNotIn(secret, blob, f"känsligt fält läckte: {secret}")


class CustomerEmailSendTest(unittest.TestCase):
    def setUp(self):
        self._orig = (settings.sendgrid_api_key, settings.notify_from_email, notifications._deliver)
        settings.sendgrid_api_key = "SG.x"
        settings.notify_from_email = "noreply@geogiraph.com"

    def tearDown(self):
        settings.sendgrid_api_key, settings.notify_from_email, notifications._deliver = self._orig

    def test_sends_safe_email_to_contact(self):
        fakefs.reset(
            client={"company_name": "Acme AB", "contact_email": "vd@acme.se"},
            monthly_reports={"2026-05": MODEL},
        )
        sent: list = []
        notifications._deliver = lambda to, subject, body, html=None: sent.append((to, body, html))
        result = reports_router.send_customer_report("acme", "2026-05")
        self.assertTrue(result["sent"])
        self.assertEqual(result["to"], "vd@acme.se")
        to, body, html = sent[0]
        for secret in _SECRETS:
            self.assertNotIn(secret, body + html)

    def test_noop_without_contact(self):
        fakefs.reset(client={"company_name": "Acme AB"}, monthly_reports={"2026-05": MODEL})
        result = reports_router.send_customer_report("acme", "2026-05")
        self.assertFalse(result["sent"])
        self.assertEqual(result["reason"], "no_contact")


class CustomerEmailJobTest(unittest.TestCase):
    def setUp(self):
        self._orig = (settings.sendgrid_api_key, settings.notify_from_email, notifications._deliver)
        settings.sendgrid_api_key = "SG.x"
        settings.notify_from_email = "noreply@geogiraph.com"

    def tearDown(self):
        settings.sendgrid_api_key, settings.notify_from_email, notifications._deliver = self._orig

    def test_per_client_job_sends(self):
        from jobs import customer_report_email as job
        fakefs.reset(
            client={"company_name": "Acme AB", "contact_email": "vd@acme.se"},
            monthly_reports={"2026-05": MODEL},
        )
        notifications._deliver = lambda to, subject, body, html=None: None
        result = job.run("acme", "2026-05")
        self.assertTrue(result["sent"])
        self.assertEqual(result["month"], "2026-05")

    def test_per_client_job_noop_without_report(self):
        from jobs import customer_report_email as job
        fakefs.reset(client={"company_name": "Acme AB", "contact_email": "vd@acme.se"}, monthly_reports={})
        result = job.run("acme", "2026-05")
        self.assertFalse(result["sent"])
        self.assertEqual(result["reason"], "no_report")

    def test_fanout_job_runs(self):
        from jobs import customer_report_email_all as fanout
        fakefs.reset(
            client={"company_name": "Acme AB", "contact_email": "vd@acme.se"},
            monthly_reports={monthly_report.current_month(): MODEL},
        )
        notifications._deliver = lambda to, subject, body, html=None: None
        fanout.run()  # ska inte kasta; fan-out över alla kunder


if __name__ == "__main__":
    unittest.main()
