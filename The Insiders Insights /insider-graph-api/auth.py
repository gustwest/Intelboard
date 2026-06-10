"""API-key middleware för admin-endpoints.

Skydd för /api/clients, /api/onboard, /api/polling, /api/connectors, /api/review.
Hoppas över för /health och /api/webhooks/* (webhooks autentiserar separat).

Klient skickar `X-API-Key: <key>`. Saknas key i config körs API:t i open-mode
(MVP/lokal utveckling) och loggar en varning vid uppstart.
"""
from __future__ import annotations

import logging

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response

from config import settings

log = logging.getLogger(__name__)

PUBLIC_PREFIXES = (
    "/health",
    "/api/webhooks/",            # webhooks (inbound mail + ops-alerts) auth:ar separat
    "/api/jobs/compile-via-eventarc",
    "/api/badge/",               # trust-badgen embeddas på KUNDENS sajt → måste vara publik
    "/docs",
    "/openapi.json",
    "/redoc",
)


class ApiKeyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        if request.method == "OPTIONS" or any(path.startswith(p) for p in PUBLIC_PREFIXES):
            return await call_next(request)

        if not settings.admin_api_key:
            return await call_next(request)

        provided = request.headers.get("x-api-key") or request.query_params.get("api_key")
        if provided != settings.admin_api_key:
            # OBS: en HTTPException som RAISE:as i en BaseHTTPMiddleware blir 500, inte
            # 401 (Starlette-fälla — FastAPI:s exception-handlers körs bara i routinglagret).
            # Returnera därför ett explicit 401-svar.
            return JSONResponse({"detail": "invalid or missing api key"}, status_code=401)
        return await call_next(request)
