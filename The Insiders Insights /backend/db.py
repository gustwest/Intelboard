"""SQLAlchemy setup — PostgreSQL on Cloud SQL (fallback: SQLite for local dev).

Set DATABASE_URL env var for production. When unset, falls back to local SQLite
at data/insiders.db for development.
"""
import os
import sqlalchemy
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.environ.get("DATABASE_URL")

if not DATABASE_URL:
    # Local development fallback — SQLite
    DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
    os.makedirs(DATA_DIR, exist_ok=True)
    DB_PATH = os.path.join(DATA_DIR, "insiders.db")
    DATABASE_URL = f"sqlite:///{DB_PATH}"

# SQLite needs check_same_thread=False; PostgreSQL doesn't use connect_args
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,  # reconnect on stale connections (important for Cloud SQL)
    future=True,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    import models  # noqa: F401 — register models
    Base.metadata.create_all(bind=engine)  # creates new tables but won't add columns

    # Auto-migrate: add missing columns to existing tables
    if DATABASE_URL.startswith("sqlite"):
        _sqlite_auto_migrate()
    else:
        _pg_auto_migrate()


def _pg_auto_migrate():
    """Add columns that exist in models but not in PostgreSQL.
    Safe to call repeatedly — each ALTER uses IF NOT EXISTS."""
    migrations = [
        "ALTER TABLE sources ADD COLUMN IF NOT EXISTS platform VARCHAR DEFAULT ''",
        "ALTER TABLE sources ADD COLUMN IF NOT EXISTS category VARCHAR DEFAULT ''",
        "ALTER TABLE datasets ADD COLUMN IF NOT EXISTS ai_summary TEXT DEFAULT ''",
        "ALTER TABLE datasets ADD COLUMN IF NOT EXISTS granularity VARCHAR DEFAULT 'unknown'",
        "ALTER TABLE datasets ADD COLUMN IF NOT EXISTS period_start DATE",
        "ALTER TABLE datasets ADD COLUMN IF NOT EXISTS period_end DATE",
        "ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS cancel_requested BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS image_path VARCHAR",
        # Per-product admin workspaces (The Insiders / Insider Graph)
        "ALTER TABLE issues ADD COLUMN IF NOT EXISTS product VARCHAR NOT NULL DEFAULT 'the-insiders'",
        "ALTER TABLE admin_files ADD COLUMN IF NOT EXISTS product VARCHAR NOT NULL DEFAULT 'the-insiders'",
        "ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS product VARCHAR NOT NULL DEFAULT 'the-insiders'",
    ]
    for sql in migrations:
        try:
            with engine.begin() as conn:
                conn.execute(sqlalchemy.text(sql))
        except Exception:
            pass  # column already exists or other non-critical issue


def _sqlite_auto_migrate():
    """SQLite (local dev) has no ADD COLUMN IF NOT EXISTS — attempt each ALTER
    in its own transaction and swallow 'duplicate column' errors. Mirrors the
    PostgreSQL migrations so a long-lived local insiders.db stays in sync."""
    migrations = [
        "ALTER TABLE sources ADD COLUMN platform VARCHAR DEFAULT ''",
        "ALTER TABLE sources ADD COLUMN category VARCHAR DEFAULT ''",
        "ALTER TABLE datasets ADD COLUMN ai_summary TEXT DEFAULT ''",
        "ALTER TABLE datasets ADD COLUMN granularity VARCHAR DEFAULT 'unknown'",
        "ALTER TABLE datasets ADD COLUMN period_start DATE",
        "ALTER TABLE datasets ADD COLUMN period_end DATE",
        "ALTER TABLE agent_tasks ADD COLUMN cancel_requested BOOLEAN NOT NULL DEFAULT 0",
        "ALTER TABLE agent_tasks ADD COLUMN image_path VARCHAR",
        # Per-product admin workspaces (The Insiders / Insider Graph)
        "ALTER TABLE issues ADD COLUMN product VARCHAR NOT NULL DEFAULT 'the-insiders'",
        "ALTER TABLE admin_files ADD COLUMN product VARCHAR NOT NULL DEFAULT 'the-insiders'",
        "ALTER TABLE agent_sessions ADD COLUMN product VARCHAR NOT NULL DEFAULT 'the-insiders'",
    ]
    for sql in migrations:
        try:
            with engine.begin() as conn:
                conn.execute(sqlalchemy.text(sql))
        except Exception:
            pass  # column already exists or other non-critical issue
