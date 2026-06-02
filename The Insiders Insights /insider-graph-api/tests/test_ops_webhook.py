"""Integrationstest för /api/webhooks/ops-alerts.

Verifierar:
  - Token-validering (401 vid fel/saknad token).
  - Pub/Sub envelope-avkodning (base64 + JSON).
  - Cloud Billing budget-payload översätts till raise_alert(kind=budget_threshold)
    med rätt severity per threshold.
  - Generisk payload (kind+source) översätts till motsvarande raise_alert.

Routern importerar ops_alerts.raise_alert direkt — vi monkey-patchar den så vi
inte behöver Firestore.
"""
from __future__ import annotations

import base64
import json
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from config import settings
from routers import ops as ops_router


def _envelope(payload: dict) -> dict:
    data = base64.b64encode(json.dumps(payload).encode("utf-8")).decode("ascii")
    return {"message": {"data": data, "messageId": "test"}}


class OpsWebhookTest(unittest.TestCase):
    def setUp(self) -> None:
        # FastAPI-app som bara innehåller webhook_router — sliten från resten
        # av main.py så vi inte importerar tunga moduler i testet.
        from fastapi import FastAPI

        app = FastAPI()
        app.include_router(ops_router.webhook_router)
        self.client = TestClient(app)

        self._orig_token = settings.ops_webhook_token
        settings.ops_webhook_token = "test-token"
        self.raised: list[dict] = []

        def fake_raise(**kwargs):
            self.raised.append(kwargs)
            return "fake-alert-id"

        self._patch = patch.object(ops_router.ops_alerts, "raise_alert", side_effect=fake_raise)
        self._patch.start()

    def tearDown(self) -> None:
        self._patch.stop()
        settings.ops_webhook_token = self._orig_token

    def test_missing_token_returns_401(self):
        r = self.client.post("/api/webhooks/ops-alerts", json=_envelope({"kind": "x"}))
        self.assertEqual(r.status_code, 401)
        self.assertEqual(self.raised, [])

    def test_wrong_token_returns_401(self):
        r = self.client.post(
            "/api/webhooks/ops-alerts?token=nope",
            json=_envelope({"kind": "x"}),
        )
        self.assertEqual(r.status_code, 401)

    def test_budget_50pct_creates_info_alert(self):
        payload = {
            "budgetDisplayName": "Insider Graph monthly",
            "alertThresholdExceeded": 0.5,
            "costAmount": 1000,
            "budgetAmount": 2000,
            "currencyCode": "USD",
        }
        r = self.client.post(
            "/api/webhooks/ops-alerts?token=test-token",
            json=_envelope(payload),
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(self.raised), 1)
        call = self.raised[0]
        self.assertEqual(call["kind"], "budget_threshold")
        self.assertEqual(call["source"], "Insider Graph monthly")
        self.assertEqual(call["severity"], ops_router.ops_alerts.SEVERITY_INFO)
        self.assertIn("50% uppnådd", call["title"])

    def test_budget_80pct_creates_warning_alert(self):
        payload = {
            "budgetDisplayName": "default",
            "alertThresholdExceeded": 0.8,
            "costAmount": 1600,
            "budgetAmount": 2000,
            "currencyCode": "USD",
        }
        r = self.client.post(
            "/api/webhooks/ops-alerts?token=test-token",
            json=_envelope(payload),
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.raised[0]["severity"], ops_router.ops_alerts.SEVERITY_WARNING)

    def test_budget_100pct_creates_critical_alert(self):
        payload = {
            "budgetDisplayName": "default",
            "alertThresholdExceeded": 1.0,
            "costAmount": 2000,
            "budgetAmount": 2000,
            "currencyCode": "USD",
        }
        r = self.client.post(
            "/api/webhooks/ops-alerts?token=test-token",
            json=_envelope(payload),
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.raised[0]["severity"], ops_router.ops_alerts.SEVERITY_CRITICAL)

    def test_forecast_alert_is_critical(self):
        payload = {
            "budgetDisplayName": "default",
            "forecastThresholdExceeded": 1.2,
            "costAmount": 1500,
            "budgetAmount": 2000,
            "currencyCode": "USD",
        }
        r = self.client.post(
            "/api/webhooks/ops-alerts?token=test-token",
            json=_envelope(payload),
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.raised[0]["severity"], ops_router.ops_alerts.SEVERITY_CRITICAL)
        self.assertIn("prognos", self.raised[0]["title"])

    def test_generic_payload_passes_through(self):
        payload = {
            "kind": "uptime",
            "source": "monitoring-check",
            "title": "Uptime fail",
            "severity": ops_router.ops_alerts.SEVERITY_CRITICAL,
            "detail": "service down >5min",
        }
        r = self.client.post(
            "/api/webhooks/ops-alerts?token=test-token",
            json=_envelope(payload),
        )
        self.assertEqual(r.status_code, 200)
        call = self.raised[0]
        self.assertEqual(call["kind"], "uptime")
        self.assertEqual(call["source"], "monitoring-check")
        self.assertEqual(call["severity"], ops_router.ops_alerts.SEVERITY_CRITICAL)

    def test_unparseable_payload_is_200_no_raise(self):
        # Pub/Sub retryar evigt på non-2xx; ren parse-bugg ska loggas men inte retryas.
        r = self.client.post(
            "/api/webhooks/ops-alerts?token=test-token",
            json={"not": "a real envelope"},
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.raised, [])

    def test_direct_json_without_envelope(self):
        # Manuell curl-anrop utan Pub/Sub-wrap: payload skickas direkt som body.
        payload = {"kind": "uptime", "source": "manual", "title": "Direct"}
        r = self.client.post(
            "/api/webhooks/ops-alerts?token=test-token",
            json=payload,
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.raised[0]["kind"], "uptime")


if __name__ == "__main__":
    unittest.main()
