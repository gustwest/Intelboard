"""ApiKeyMiddleware (auth.py): avvisning ska bli 401 (inte 500 — Starlette-fällan där
en HTTPException raise:ad i en BaseHTTPMiddleware blir 500), publika prefix öppna,
och öppet läge när ingen nyckel är konfigurerad."""
import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient

from auth import ApiKeyMiddleware
from config import settings


def _client() -> TestClient:
    app = FastAPI()
    app.add_middleware(ApiKeyMiddleware)

    @app.get("/api/clients")
    def clients():
        return {"ok": True}

    @app.get("/health")
    def health():
        return {"ok": True}

    @app.get("/api/badge/{cid}")
    def badge(cid: str):
        return {"cid": cid}

    return TestClient(app, raise_server_exceptions=False)


class ApiKeyMiddlewareTest(unittest.TestCase):
    def setUp(self):
        self._orig = settings.admin_api_key

    def tearDown(self):
        settings.admin_api_key = self._orig

    def test_missing_key_is_401_not_500(self):
        settings.admin_api_key = "secret"
        self.assertEqual(_client().get("/api/clients").status_code, 401)

    def test_wrong_key_is_401(self):
        settings.admin_api_key = "secret"
        self.assertEqual(_client().get("/api/clients", headers={"x-api-key": "nope"}).status_code, 401)

    def test_correct_key_passes(self):
        settings.admin_api_key = "secret"
        self.assertEqual(_client().get("/api/clients", headers={"x-api-key": "secret"}).status_code, 200)

    def test_query_param_key_also_works(self):
        settings.admin_api_key = "secret"
        self.assertEqual(_client().get("/api/clients?api_key=secret").status_code, 200)

    def test_public_prefixes_open_without_key(self):
        settings.admin_api_key = "secret"
        c = _client()
        self.assertEqual(c.get("/health").status_code, 200)
        self.assertEqual(c.get("/api/badge/acme").status_code, 200)  # badge embeddas publikt

    def test_open_mode_when_no_key_configured(self):
        settings.admin_api_key = ""
        self.assertEqual(_client().get("/api/clients").status_code, 200)


if __name__ == "__main__":
    unittest.main()
