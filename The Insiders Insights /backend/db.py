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
    if not DATABASE_URL.startswith("sqlite"):
        _pg_auto_migrate()


def _pg_auto_migrate():
    """Add columns that exist in models but not in PostgreSQL.
    Safe to call repeatedly — each ALTER uses IF NOT EXISTS."""
    migrations = [
        "ALTER TABLE sources ADD COLUMN IF NOT EXISTS platform VARCHAR DEFAULT ''",
        "ALTER TABLE sources ADD COLUMN IF NOT EXISTS category VARCHAR DEFAULT ''",
    ]
    with engine.begin() as conn:
        for sql in migrations:
            try:
                conn.execute(sqlalchemy.text(sql))
            except Exception:
                pass  # column already exists or other non-critical issue
