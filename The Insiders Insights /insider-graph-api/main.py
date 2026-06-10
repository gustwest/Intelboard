"""Insider Graph — API entry point.

Webhooks (inbound mail parse) and admin endpoints. Background work runs as
separate Cloud Run Jobs — see jobs/.
"""
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from auth import ApiKeyMiddleware
from config import settings
from routers import attested, badge, clients, connectors_router, delivery, esg, forecast, health, inbox, jobs as jobs_router, linkedin, model_registry_router, onboard, ops as ops_router, output_quality, personas as personas_router, polling, proof_archive, proof_receipt, recipes as recipes_router, reports, review, schedules, verification, webhooks

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("insider-graph-api")

app = FastAPI(title="Insider Graph — API")

if not settings.admin_api_key:
    log.warning("ADMIN_API_KEY not set — admin endpoints are unauthenticated")

# P1-E: rate limiting (flood-backstop). Generös global gräns per IP — admin-trafiken
# kommer via Next-proxyns enda egress-IP, så taket är högt satt för att inte strypa
# teamet; det fångar egregious flooding mot de publika endpoints (badge m.m.). In-memory
# per instans (räcker som backstop; Redis för delat tak senare).
limiter = Limiter(key_func=get_remote_address, default_limits=["1200/minute"])
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Middlewares körs OUTERMOST = sist tillagd. ApiKeyMiddleware + CORS + rate limiting;
# säkerhetsheaders läggs ytterst (via @app.middleware nedan) → på ALLA svar inkl. 401/429.
app.add_middleware(ApiKeyMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    # P1-F: vi autentiserar med X-API-Key, inte cookies → wildcard UTAN credentials är
    # säkert (wildcard + credentials är annars ett rejält antimönster).
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SlowAPIMiddleware)


@app.middleware("http")
async def _security_headers(request: Request, call_next):
    """P1-F: säkerhetsheaders på alla svar."""
    resp = await call_next(request)
    resp.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    # Badgen embeddas på KUNDENS sajt (iframe/snutt) → ingen frame-deny där; allt annat
    # (rapport-HTML, admin) skyddas mot clickjacking.
    if not request.url.path.startswith("/api/badge/"):
        resp.headers.setdefault("X-Frame-Options", "DENY")
    return resp

app.include_router(health.router)
app.include_router(attested.router)
app.include_router(badge.router)
app.include_router(delivery.router)
app.include_router(clients.router)
app.include_router(connectors_router.router)
app.include_router(esg.router)
app.include_router(forecast.router)
app.include_router(inbox.router)
app.include_router(jobs_router.router)
app.include_router(linkedin.router)
app.include_router(model_registry_router.router)
app.include_router(onboard.router)
app.include_router(ops_router.router)
app.include_router(ops_router.webhook_router)
app.include_router(output_quality.router)
app.include_router(personas_router.router)
app.include_router(polling.router)
app.include_router(proof_archive.router)
app.include_router(proof_receipt.router)
app.include_router(recipes_router.router)
app.include_router(reports.router)
app.include_router(review.router)
app.include_router(schedules.router)
app.include_router(verification.router)
app.include_router(webhooks.router)
