"""Tester för LLM-kostnadsspårning (cost_tracking + AIUsageLog + AIChatMessage).

Kör med: cd backend && python test_cost_tracking.py

Använder in-memory SQLite för att slippa konfigurera DATABASE_URL — speglar
db.py:s create_all-flöde mot en helt isolerad engine."""
from __future__ import annotations

import os
import sys
import unittest
from types import SimpleNamespace

# Säkerställ att backend/ är importerbart oavsett varifrån testet körs.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Tvinga DATABASE_URL till in-memory SQLite INNAN vi importerar db/models.
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import cost_tracking
import models
from db import Base


def _fake_response(prompt_tokens: int, completion_tokens: int) -> SimpleNamespace:
    """Mimik av google-genai-svar med usage_metadata."""
    return SimpleNamespace(
        usage_metadata=SimpleNamespace(
            prompt_token_count=prompt_tokens,
            candidates_token_count=completion_tokens,
        ),
        text="dummy",
    )


def _isolated_session():
    """Färsk in-memory-SQLite per test så raderna är isolerade."""
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, future=True)()


class UsageFromResponseTest(unittest.TestCase):
    def test_known_model_returns_tokens_and_cost(self):
        u = cost_tracking.usage_from_response("gemini-2.5-flash", _fake_response(1000, 500))
        self.assertEqual(u.input_tokens, 1000)
        self.assertEqual(u.output_tokens, 500)
        # 1000/1M * 0.30 + 500/1M * 2.50 = 0.0003 + 0.00125 = 0.00155
        self.assertAlmostEqual(u.cost_usd, 0.00155, places=6)

    def test_unknown_model_returns_tokens_but_no_cost(self):
        u = cost_tracking.usage_from_response("future-model-9000", _fake_response(1000, 500))
        self.assertEqual(u.input_tokens, 1000)
        self.assertEqual(u.output_tokens, 500)
        self.assertIsNone(u.cost_usd)

    def test_missing_usage_metadata_returns_all_none(self):
        broken = SimpleNamespace(text="dummy")  # ingen usage_metadata
        u = cost_tracking.usage_from_response("gemini-2.5-flash", broken)
        self.assertIsNone(u.input_tokens)
        self.assertIsNone(u.output_tokens)
        self.assertIsNone(u.cost_usd)

    def test_corrupted_response_does_not_crash(self):
        # Säkerhetsnät: usage_from_response måste tåla skräp utan att kasta.
        u = cost_tracking.usage_from_response("gemini-2.5-flash", None)
        self.assertIsNone(u.input_tokens)


class LogSurfaceUsageTest(unittest.TestCase):
    def test_writes_row_to_ai_usage_log(self):
        db = _isolated_session()
        cost_tracking.log_surface_usage(
            db, surface="dataset_summarizer", model="gemini-3.5-flash",
            response=_fake_response(2000, 800),
            customer_id="cust-1",
            detail={"filename": "abc.csv"},
        )
        rows = db.query(models.AIUsageLog).all()
        self.assertEqual(len(rows), 1)
        r = rows[0]
        self.assertEqual(r.surface, "dataset_summarizer")
        self.assertEqual(r.customer_id, "cust-1")
        self.assertEqual(r.model, "gemini-3.5-flash")
        self.assertEqual(r.input_tokens, 2000)
        self.assertEqual(r.output_tokens, 800)
        # 2000/1M * 0.35 + 800/1M * 2.80 = 0.0007 + 0.00224 = 0.00294
        self.assertAlmostEqual(r.cost_usd, 0.00294, places=6)
        self.assertEqual(r.detail_json, {"filename": "abc.csv"})

    def test_unknown_model_logs_with_zero_cost(self):
        db = _isolated_session()
        cost_tracking.log_surface_usage(
            db, surface="dataset_summarizer", model="totally-new-model",
            response=_fake_response(100, 50),
        )
        rows = db.query(models.AIUsageLog).all()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].cost_usd, 0.0)
        self.assertEqual(rows[0].input_tokens, 100)


class ChatMessageWiringTest(unittest.TestCase):
    """ai_chat-routern sätter token-fälten direkt på AIChatMessage. Verifiera att
    fälten faktiskt persisteras (kolumnerna lades till via auto-migrate)."""

    def test_chat_message_persists_token_fields(self):
        db = _isolated_session()
        u = cost_tracking.usage_from_response("gemini-3.5-flash", _fake_response(1500, 600))
        msg = models.AIChatMessage(
            session_id="sess-1",
            role="assistant",
            content="hej",
            customer_id="cust-1",
            page_context="customer_detail",
            model="gemini-3.5-flash",
            input_tokens=u.input_tokens,
            output_tokens=u.output_tokens,
            cost_usd=u.cost_usd,
        )
        db.add(msg)
        db.commit()
        round_tripped = db.query(models.AIChatMessage).first()
        self.assertEqual(round_tripped.model, "gemini-3.5-flash")
        self.assertEqual(round_tripped.input_tokens, 1500)
        self.assertEqual(round_tripped.output_tokens, 600)
        # 1500/1M * 0.35 + 600/1M * 2.80 = 0.000525 + 0.00168 = 0.002205
        self.assertAlmostEqual(round_tripped.cost_usd, 0.002205, places=6)


if __name__ == "__main__":
    unittest.main()
