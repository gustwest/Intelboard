"""Shared helpers used across routers.

Centralises file-based JSON persistence (GCS-backed), slugification,
safe JSON encoding, and the GCS client setup.
"""
import json
import math
import os
import re
import uuid
from datetime import datetime
from typing import Any, Dict

import numpy as np

# ------------------------------------------------------------------
# Constants
# ------------------------------------------------------------------
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
ISSUES_FILE = os.path.join(DATA_DIR, "issues.json")
UPLOADS_DIR = os.path.join(DATA_DIR, "uploads")
CONVOS_FILE = os.path.join(DATA_DIR, "conversations.json")
AGENT_FILE = os.path.join(DATA_DIR, "agent_sessions.json")
FILES_META = os.path.join(DATA_DIR, "files.json")

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(UPLOADS_DIR, exist_ok=True)


# ------------------------------------------------------------------
# GCS persistence layer
# ------------------------------------------------------------------
_GCS_BUCKET_NAME = os.environ.get("DATA_GCS_BUCKET")
_gcs_client = None
_gcs_bucket = None
if _GCS_BUCKET_NAME:
    from google.cloud import storage as _gcs_storage  # type: ignore
    _gcs_client = _gcs_storage.Client()
    _gcs_bucket = _gcs_client.bucket(_GCS_BUCKET_NAME)


def _gcs_blob_for(path: str):
    key = os.path.relpath(path, DATA_DIR).replace(os.sep, "/")
    return _gcs_bucket.blob(key)


def file_json(path: str, default):
    """Read a JSON file — from GCS when available, disk otherwise."""
    if _gcs_bucket is not None:
        blob = _gcs_blob_for(path)
        if not blob.exists():
            return default
        return json.loads(blob.download_as_text())
    if not os.path.exists(path):
        return default
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: str, data):
    """Write a JSON file — to GCS when available, disk otherwise."""
    payload = json.dumps(data, indent=2, ensure_ascii=False, default=str)
    if _gcs_bucket is not None:
        _gcs_blob_for(path).upload_from_string(payload, content_type="application/json")
        return
    with open(path, "w", encoding="utf-8") as f:
        f.write(payload)


# ------------------------------------------------------------------
# Utilities
# ------------------------------------------------------------------
def slugify(name: str) -> str:
    s = name.lower().strip()
    s = s.replace("å", "a").replace("ä", "a").replace("ö", "o")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or uuid.uuid4().hex[:8]


class SafeJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (np.integer,)):
            return int(obj)
        if isinstance(obj, (np.floating,)):
            val = float(obj)
            if math.isnan(val) or math.isinf(val):
                return 0
            return val
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        if isinstance(obj, np.bool_):
            return bool(obj)
        if hasattr(obj, "isoformat"):
            return obj.isoformat()
        return super().default(obj)


def safe_json_dumps(obj):
    return json.dumps(obj, cls=SafeJSONEncoder, ensure_ascii=False)
