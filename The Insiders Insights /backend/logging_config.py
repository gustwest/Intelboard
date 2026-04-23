"""Structured logging: every event gets timestamp, level, logger, event,
and any extra kwargs. Also keeps the most recent N entries in memory so the
UI can poll /api/logs for debugging.

Usage:
    from logging_config import log, event_log
    log.info("ingest.start", customer_id=cid, filename=f)
"""
from __future__ import annotations

import json
import logging
import sys
import time
from collections import deque
from datetime import datetime
from typing import Any, Deque, Dict

MAX_RECENT = 1000
_recent: Deque[Dict[str, Any]] = deque(maxlen=MAX_RECENT)


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        base: Dict[str, Any] = {
            "ts": datetime.utcfromtimestamp(record.created).isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "event": record.getMessage(),
        }
        # any extra kwargs attached via log.info(msg, extra={"data": {...}}) or our helper
        extras = getattr(record, "data", None)
        if isinstance(extras, dict):
            base.update(extras)
        if record.exc_info:
            base["exc"] = self.formatException(record.exc_info)
        return json.dumps(base, ensure_ascii=False, default=str)


class RecentBufferHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        try:
            entry: Dict[str, Any] = {
                "ts": datetime.utcfromtimestamp(record.created).isoformat() + "Z",
                "level": record.levelname,
                "logger": record.name,
                "event": record.getMessage(),
            }
            extras = getattr(record, "data", None)
            if isinstance(extras, dict):
                entry.update(extras)
            if record.exc_info:
                entry["exc"] = self.format(record)
            _recent.append(entry)
        except Exception:
            pass


def get_recent(limit: int = 200, level: str | None = None) -> list[dict]:
    entries = list(_recent)[-limit:]
    if level:
        entries = [e for e in entries if e.get("level") == level.upper()]
    return entries


def clear_recent() -> None:
    _recent.clear()


def _configure() -> logging.Logger:
    root = logging.getLogger()
    if getattr(root, "_insiders_configured", False):
        return logging.getLogger("insiders")

    root.setLevel(logging.INFO)
    for h in list(root.handlers):
        root.removeHandler(h)

    stream = logging.StreamHandler(sys.stdout)
    stream.setFormatter(JsonFormatter())
    root.addHandler(stream)
    root.addHandler(RecentBufferHandler())

    # quiet down noisy libs — these shouldn't reach our in-memory buffer
    for noisy in ("httpx", "httpcore", "sqlalchemy.engine", "urllib3", "asyncio", "watchfiles"):
        logger = logging.getLogger(noisy)
        logger.setLevel(logging.WARNING)
        logger.propagate = False
    logging.getLogger("uvicorn.access").setLevel(logging.INFO)

    setattr(root, "_insiders_configured", True)
    return logging.getLogger("insiders")


class EventLogger:
    """Thin wrapper: log.info('event.name', key=value, ...) flattens kwargs into `extra`."""
    def __init__(self, base: logging.Logger):
        self._base = base

    def _emit(self, level: int, event: str, **kwargs: Any) -> None:
        self._base.log(level, event, extra={"data": kwargs})

    def info(self, event: str, **kwargs: Any) -> None:
        self._emit(logging.INFO, event, **kwargs)

    def warn(self, event: str, **kwargs: Any) -> None:
        self._emit(logging.WARNING, event, **kwargs)

    def error(self, event: str, **kwargs: Any) -> None:
        self._emit(logging.ERROR, event, **kwargs)

    def exception(self, event: str, **kwargs: Any) -> None:
        self._base.exception(event, extra={"data": kwargs})


log = EventLogger(_configure())


class RequestTimer:
    """Context manager for timing + logging a request/operation."""
    def __init__(self, event: str, **ctx: Any):
        self.event = event
        self.ctx = ctx
        self.start = 0.0

    def __enter__(self):
        self.start = time.perf_counter()
        return self

    def __exit__(self, exc_type, exc, tb):
        elapsed_ms = int((time.perf_counter() - self.start) * 1000)
        if exc is not None:
            log.error(self.event + ".error", elapsed_ms=elapsed_ms, error=str(exc), **self.ctx)
        else:
            log.info(self.event + ".done", elapsed_ms=elapsed_ms, **self.ctx)
        return False
