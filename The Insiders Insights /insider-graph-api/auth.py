"""API-key middleware för admin-endpoints.

Skydd för /api/clients, /api/onboard, /api/polling, /api/connectors, /api/review.
Hoppas över för /health och /api/webhooks/* (webhooks autentiserar separat).

Klient skickar `X-API-Key: <key>`. Saknas key i config körs API:t i open-mode
(MVP/lokal utveckling) och loggar en varning vid uppstart.
"""
from __future__ import annotations

import logging

from fastapi import HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from config import settings

log = logging.getLogger(__name__)

PUBLIC_PREFIXES = (
    "/health",
    "/api/webhooks/",            # webhooks (SendGrid + ops-alerts) auth:ar separat
    "/api/jobs/compile-via-eventarc",
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
            raise HTTPException(status_code=401, detail="invalid or missing api key")
        return await call_next(request)
