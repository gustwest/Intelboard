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


if __name__ == "__main__":
    unittest.main()
