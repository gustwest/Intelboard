"""Insider Graph — API entry point.

Webhooks (SendGrid Inbound Parse) and admin endpoints. Background work runs as
separate Cloud Run Jobs — see jobs/.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import health, onboard, polling, webhooks

app = FastAPI(title="Insider Graph — API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(onboard.router)
app.include_router(polling.router)
app.include_router(webhooks.router)
