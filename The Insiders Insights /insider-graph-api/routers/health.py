import os

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def health():
    return {
        "status": "ok",
        "service": "insider-graph-api",
        "revision": os.environ.get("K_REVISION"),
        "commit_sha": os.environ.get("COMMIT_SHA"),
    }
