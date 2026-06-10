"""P0-tester: kundkontakt (contact_email/contact_name) + språk (language) på kund-doc.

Dessa fält låser upp Spår B (leverans-utskick) och Spår C (språk). Felnotiser går
aldrig till contact_email — det är bara för installationskit + månadsmejl.
"""
import unittest

import fakefs  # installerar fake firestore_client — först
from fastapi import HTTPException
from routers import clients as clients_router


class ContactLanguageConfigTest(unittest.TestCase):
    def test_get_client_defaults_when_unset(self):
        fakefs.reset(client={"company_name": "Acme AB"})
        out = clients_router.get_client("acme")
        self.assertIsNone(out["contact_email"])
        self.assertIsNone(out["contact_name"])
        self.assertEqual(out["language"], "sv")  # default

    def test_put_config_saves_contact_and_language(self):
        fakefs.reset(client={"company_name": "Acme AB"})
        payload = clients_router.ClientConfigUpdate(
            contact_email="vd@acme.se", contact_name="VD Anna", language="en",
        )
        clients_router.update_client_config("acme", payload)
        stored = fakefs.STATE["client"]
        self.assertEqual(stored["contact_email"], "vd@acme.se")
        self.assertEqual(stored["contact_name"], "VD Anna")
        self.assertEqual(stored["language"], "en")

    def test_put_config_rejects_invalid_email(self):
        fakefs.reset(client={"company_name": "Acme AB"})
        with self.assertRaises(HTTPException) as ctx:
            clients_router.update_client_config(
                "acme", clients_router.ClientConfigUpdate(contact_email="inte-en-epost")
            )
        self.assertEqual(ctx.exception.status_code, 400)

    def test_put_config_rejects_unsupported_language(self):
        fakefs.reset(client={"company_name": "Acme AB"})
        with self.assertRaises(HTTPException) as ctx:
            clients_router.update_client_config(
                "acme", clients_router.ClientConfigUpdate(language="de")
            )
        self.assertEqual(ctx.exception.status_code, 400)

    def test_empty_strings_clear_fields(self):
        fakefs.reset(client={
            "company_name": "Acme AB",
            "contact_email": "old@acme.se",
            "language": "en",
        })
        clients_router.update_client_config(
            "acme", clients_router.ClientConfigUpdate(contact_email="", language="")
        )
        stored = fakefs.STATE["client"]
        self.assertIsNone(stored["contact_email"])
        self.assertIsNone(stored["language"])
        # get_client faller tillbaka till default-språket när fältet rensats.
        self.assertEqual(clients_router.get_client("acme")["language"], "sv")


class MultiContactTest(unittest.TestCase):
    """N2: flera kontaktpersoner med exakt en huvudkontakt; huvudkontakten speglas till
    legacy contact_email/contact_name så kit/månadsmejl fungerar oförändrat."""

    def _save(self, contacts):
        clients_router.update_client_config(
            "acme", clients_router.ClientConfigUpdate(
                contacts=[clients_router.ContactInput(**c) for c in contacts]
            ),
        )
        return fakefs.STATE["client"]

    def test_saves_contacts_and_mirrors_primary(self):
        fakefs.reset(client={"company_name": "Acme AB"})
        stored = self._save([
            {"email": "vd@acme.se", "name": "Anna", "is_primary": True},
            {"email": "webb@acme.se", "name": "Bo", "role": "webbansvarig"},
        ])
        self.assertEqual(len(stored["contacts"]), 2)
        # Huvudkontakten speglas till legacy-fälten (befintliga läsare oförändrade).
        self.assertEqual(stored["contact_email"], "vd@acme.se")
        self.assertEqual(stored["contact_name"], "Anna")
        self.assertTrue(stored["contacts"][0]["is_primary"])
        self.assertFalse(stored["contacts"][1]["is_primary"])
        self.assertEqual(stored["contacts"][1]["role"], "webbansvarig")

    def test_no_primary_marked_first_becomes_primary(self):
        fakefs.reset(client={"company_name": "Acme AB"})
        stored = self._save([{"email": "a@acme.se"}, {"email": "b@acme.se"}])
        self.assertTrue(stored["contacts"][0]["is_primary"])
        self.assertEqual(stored["contact_email"], "a@acme.se")

    def test_multiple_primaries_collapse_to_one(self):
        fakefs.reset(client={"company_name": "Acme AB"})
        stored = self._save([
            {"email": "a@acme.se", "is_primary": True},
            {"email": "b@acme.se", "is_primary": True},
        ])
        primaries = [c for c in stored["contacts"] if c["is_primary"]]
        self.assertEqual(len(primaries), 1)
        self.assertEqual(primaries[0]["email"], "a@acme.se")

    def test_dedup_and_invalid_email(self):
        fakefs.reset(client={"company_name": "Acme AB"})
        stored = self._save([
            {"email": "a@acme.se", "is_primary": True},
            {"email": "A@acme.se"},  # dubblett (skiftläge) → tas bort
        ])
        self.assertEqual(len(stored["contacts"]), 1)
        with self.assertRaises(HTTPException) as ctx:
            self._save([{"email": "inte-en-epost"}])
        self.assertEqual(ctx.exception.status_code, 400)

    def test_empty_contacts_clears_legacy(self):
        fakefs.reset(client={"company_name": "Acme AB", "contact_email": "old@acme.se",
                             "contact_name": "Old"})
        stored = self._save([])
        self.assertEqual(stored["contacts"], [])
        self.assertIsNone(stored["contact_email"])
        self.assertIsNone(stored["contact_name"])

    def test_get_client_migrates_legacy_to_contacts(self):
        fakefs.reset(client={"company_name": "Acme AB", "contact_email": "vd@acme.se",
                             "contact_name": "Anna"})
        out = clients_router.get_client("acme")
        self.assertEqual(len(out["contacts"]), 1)
        self.assertEqual(out["contacts"][0]["email"], "vd@acme.se")
        self.assertTrue(out["contacts"][0]["is_primary"])

    def test_get_client_empty_when_no_contact(self):
        fakefs.reset(client={"company_name": "Acme AB"})
        self.assertEqual(clients_router.get_client("acme")["contacts"], [])

    def test_primary_change_sends_confirmation(self):
        # N2: byte av huvudkontakt → bekräftelse till ny (cc gamla), best-effort.
        from config import settings
        from services import notifications
        orig = (settings.brevo_api_key, settings.notify_from_email, notifications._deliver)
        settings.brevo_api_key, settings.notify_from_email = "SG.x", "noreply@geogiraph.com"
        sent: list = []
        notifications._deliver = lambda to, subject, body, html=None, cc=None: sent.append((to, subject, cc))
        try:
            fakefs.reset(client={"company_name": "Acme AB", "contact_email": "old@acme.se"})
            self._save([{"email": "ny@acme.se", "name": "Ny", "is_primary": True}])
            self.assertEqual(len(sent), 1)
            to, subject, cc = sent[0]
            self.assertEqual(to, "ny@acme.se")
            self.assertIn("Acme AB", subject)
            self.assertEqual(cc, ["old@acme.se"])  # gamla kontakten cc:ad
            # Oförändrad huvudkontakt → ingen ny bekräftelse.
            self._save([{"email": "ny@acme.se", "name": "Ny", "is_primary": True}])
            self.assertEqual(len(sent), 1)
        finally:
            settings.brevo_api_key, settings.notify_from_email, notifications._deliver = orig


if __name__ == "__main__":
    unittest.main()
