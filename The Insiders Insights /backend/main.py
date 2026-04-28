"""The Insiders Insights — API

Thin application entry-point. All business logic lives in the routers/ directory.
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from db import init_db
from logging_config import log
from routers import agent, ai_chat, chat, customers, dashboard, datasets, issues, misc, modules, notes, reports, sources

# ------------------------------------------------------------------
# App setup
# ------------------------------------------------------------------
init_db()
app = FastAPI(title="The Insiders Insights — API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_logger(request: Request, call_next):
    """Log every HTTP request with status + latency. Skips /api/logs and /health to avoid noise."""
    import time as _t
    start = _t.perf_counter()
    try:
        response = await call_next(request)
    except Exception as exc:
        elapsed_ms = int((_t.perf_counter() - start) * 1000)
        log.exception("http.error", method=request.method, path=request.url.path, elapsed_ms=elapsed_ms)
        raise
    elapsed_ms = int((_t.perf_counter() - start) * 1000)
    if request.url.path not in ("/api/logs", "/health"):
        log.info(
            "http.request",
            method=request.method,
            path=request.url.path,
            status=response.status_code,
            elapsed_ms=elapsed_ms,
        )
    return response


# ------------------------------------------------------------------
# Health check
# ------------------------------------------------------------------
@app.get("/health")
def health():
    return {"status": "ok", "service": "insiders-api"}


# ------------------------------------------------------------------
# Register routers
# ------------------------------------------------------------------
app.include_router(customers.router)
app.include_router(sources.router)
app.include_router(datasets.router)
app.include_router(modules.router)
app.include_router(notes.router)
app.include_router(dashboard.router)
app.include_router(reports.router)
app.include_router(issues.router)
app.include_router(chat.router)
app.include_router(agent.router)
app.include_router(ai_chat.router)
app.include_router(misc.router)
