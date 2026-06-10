"""Parity v2 Fas 3: parity_baseline på kund-doc (routers/clients.py).

Baselinen (ledningens/styrelsens kvinnoandel, officiell källa) snapshotas av
polling varje vecka → parity_gap. Proveniens (source) är obligatorisk —
en okällad baseline får aldrig driva gap-narrativ i månadsrapporten.
"""
import unittest

import fakefs  # installerar fake firestore_client — först
from fastapi import HTTPException
from routers import clients as clients_router


def _put(payload_kwargs):
    return clients_router.update_client_config(
        "acme",
        clients_router.ClientConfigUpdate(
            parity_baseline=clients_router.ParityBaselineInput(**payload_kwargs)
        ),
    )


class ParityBaselineConfigTest(unittest.TestCase):
    def setUp(self):
        fakefs.reset(client={"company_name": "Acme AB"})

    def test_get_client_none_when_unset(self):
        out = clients_router.get_client("acme")
        self.assertIsNone(out["parity_baseline"])

    def test_save_with_provenance(self):
        _put({"value": 0.45, "source": "Årsredovisning 2025", "as_of": "2026-01-01"})
        stored = fakefs.STATE["client"]["parity_baseline"]
        self.assertEqual(stored["value"], 0.45)
        self.assertEqual(stored["source"], "Årsredovisning 2025")
        self.assertEqual(stored["as_of"], "2026-01-01")
        self.assertTrue(stored["set_at"])  # proveniens-tidsstämpel sätts av servern

    def test_source_required(self):
        with self.assertRaises(HTTPException) as ctx:
            _put({"value": 0.45})
        self.assertEqual(ctx.exception.status_code, 400)

    def test_value_must_be_share(self):
        for bad in (-0.1, 1.5, 45.0):  # 45 = vanligt fel: procent i st f andel
            with self.assertRaises(HTTPException, msg=f"value {bad}"):
                _put({"value": bad, "source": "Årsredovisning"})

    def test_as_of_must_be_iso(self):
        with self.assertRaises(HTTPException) as ctx:
            _put({"value": 0.4, "source": "ÅR", "as_of": "januari 2026"})
        self.assertEqual(ctx.exception.status_code, 400)

    def test_clear_with_null_value(self):
        _put({"value": 0.45, "source": "Årsredovisning 2025"})
        _put({"value": None})
        self.assertIsNone(fakefs.STATE["client"]["parity_baseline"])

    def test_omitted_field_untouched(self):
        _put({"value": 0.45, "source": "Årsredovisning 2025"})
        clients_router.update_client_config(
            "acme", clients_router.ClientConfigUpdate(industry="IT-konsult")
        )
        self.assertEqual(fakefs.STATE["client"]["parity_baseline"]["value"], 0.45)


if __name__ == "__main__":
    unittest.main()
