"""Insider Graph — API entry point.

Webhooks (SendGrid Inbound Parse) and admin endpoints. Background work runs as
separate Cloud Run Jobs — see jobs/.
"""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from auth import ApiKeyMiddleware
from config import settings
from routers import attested, badge, clients, connectors_router, delivery, esg, forecast, health, inbox, jobs as jobs_router, linkedin, model_registry_router, onboard, ops as ops_router, output_quality, personas as personas_router, polling, proof_archive, proof_receipt, recipes as recipes_router, reports, review, schedules, verification, webhooks

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("insider-graph-api")

app = FastAPI(title="Insider Graph — API")

if not settings.admin_api_key:
    log.warning("ADMIN_API_KEY not set — admin endpoints are unauthenticated")

app.add_middleware(ApiKeyMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
