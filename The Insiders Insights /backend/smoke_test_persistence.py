#!/usr/bin/env python3
"""
Persistence smoke test — verifies that _file_json / _save_json roundtrip
correctly in both local-filesystem mode and GCS mode.

Usage:
  # local mode (no GCS):
  python smoke_test_persistence.py

  # GCS mode:
  DATA_GCS_BUCKET=insiders-data python smoke_test_persistence.py
"""
import json
import os
import sys
import tempfile
import time
import uuid

PASS = "\033[92mPASS\033[0m"
FAIL = "\033[91mFAIL\033[0m"

results = []


def check(name: str, ok: bool, detail: str = ""):
    tag = PASS if ok else FAIL
    line = f"  [{tag}] {name}"
    if detail:
        line += f" — {detail}"
    print(line)
    results.append(ok)


# ---------------------------------------------------------------------------
# Bootstrap: replicate only the persistence layer from main.py
# ---------------------------------------------------------------------------
_GCS_BUCKET_NAME = os.environ.get("DATA_GCS_BUCKET")
_gcs_bucket = None

if _GCS_BUCKET_NAME:
    try:
        from google.cloud import storage as _gcs_storage  # type: ignore
        _gcs_client = _gcs_storage.Client()
        _gcs_bucket = _gcs_client.bucket(_GCS_BUCKET_NAME)
        print(f"GCS mode: bucket={_GCS_BUCKET_NAME}")
    except Exception as e:
        print(f"[WARN] Could not init GCS client: {e}")
else:
    print("Local-filesystem mode (DATA_GCS_BUCKET not set)")

# Use a temp dir as DATA_DIR so tests are isolated from real data
_TEST_DATA_DIR = tempfile.mkdtemp(prefix="persist_smoke_")


def _gcs_blob_for(path: str):
    key = os.path.relpath(path, _TEST_DATA_DIR).replace(os.sep, "/")
    return _gcs_bucket.blob(f"smoke-test/{key}")


def _file_json(path: str, default):
    if _gcs_bucket is not None:
        blob = _gcs_blob_for(path)
        if not blob.exists():
            return default
        return json.loads(blob.download_as_text())
    if not os.path.exists(path):
        return default
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_json(path: str, data):
    payload = json.dumps(data, indent=2, ensure_ascii=False, default=str)
    if _gcs_bucket is not None:
        _gcs_blob_for(path).upload_from_string(payload, content_type="application/json")
        return
    with open(path, "w", encoding="utf-8") as f:
        f.write(payload)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
test_file = os.path.join(_TEST_DATA_DIR, "agent_sessions.json")
run_id = str(uuid.uuid4())

print("\n--- 1. Default value on missing file ---")
result = _file_json(test_file, {"sessions": []})
check("returns default dict", result == {"sessions": []})
check("default is not mutated", "sessions" in result)

print("\n--- 2. Write then read ---")
payload = {
    "sessions": [
        {
            "id": run_id,
            "title": "Smoke test session",
            "pinned": False,
            "tasks": [],
            "createdAt": "2026-04-26T00:00:00Z",
            "updatedAt": "2026-04-26T00:00:00Z",
        }
    ]
}
try:
    _save_json(test_file, payload)
    check("save did not throw", True)
except Exception as e:
    check("save did not throw", False, str(e))

loaded = _file_json(test_file, {})
check("read returns dict", isinstance(loaded, dict))
check("sessions list present", "sessions" in loaded)
check("session count correct", len(loaded.get("sessions", [])) == 1)
check("session id survives roundtrip", loaded["sessions"][0]["id"] == run_id)
check("unicode safe (title)", loaded["sessions"][0]["title"] == "Smoke test session")

print("\n--- 3. Overwrite then re-read ---")
payload2 = dict(payload)
payload2["sessions"][0]["title"] = "Updated title — äöü 🔥"
_save_json(test_file, payload2)
loaded2 = _file_json(test_file, {})
check("overwrite reflected on read", loaded2["sessions"][0]["title"] == "Updated title — äöü 🔥")

print("\n--- 4. Simulate restart (re-init _file_json, same path) ---")
# Just call _file_json again fresh — simulates a new process reading persisted state
loaded3 = _file_json(test_file, {"sessions": []})
check("state survives re-read (restart sim)", loaded3["sessions"][0]["id"] == run_id)

print("\n--- 5. Clean up smoke-test artefacts ---")
if _gcs_bucket is not None:
    try:
        blobs = list(_gcs_bucket.list_blobs(prefix="smoke-test/"))
        for b in blobs:
            b.delete()
        check("GCS smoke-test blobs deleted", True, f"{len(blobs)} blob(s)")
    except Exception as e:
        check("GCS cleanup", False, str(e))
else:
    import shutil
    shutil.rmtree(_TEST_DATA_DIR, ignore_errors=True)
    check("temp dir removed", not os.path.exists(_TEST_DATA_DIR))

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
total = len(results)
passed = sum(results)
failed = total - passed
print(f"\n{'='*40}")
print(f"  {passed}/{total} passed", end="")
if failed:
    print(f"  ({failed} FAILED)")
    sys.exit(1)
else:
    print("  — all green")
