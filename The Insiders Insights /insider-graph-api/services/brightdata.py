"""Bright Data Datasets API-klient.

Bright Data är async: man triggar en collection och poll:ar tills den är klar.
Dataset-IDs sätts via env (de skiljer sig mellan profiles/companies/posts).

Om BRIGHTDATA_API_KEY saknas är klienten "disabled" och alla anrop returnerar
tomma resultat — det låter resten av systemet utvecklas utan riktig nyckel.
"""
from __future__ import annotations

import logging
import time
from typing import Any

import httpx

from config import settings

log = logging.getLogger(__name__)

BASE_URL = "https://api.brightdata.com/datasets/v3"


class BrightDataClient:
    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key if api_key is not None else settings.brightdata_api_key

    @property
    def enabled(self) -> bool:
        return bool(self.api_key)

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def trigger(self, dataset_id: str, inputs: list[dict[str, Any]]) -> str | None:
        if not self.enabled or not dataset_id or not inputs:
            return None
        try:
            with httpx.Client(timeout=30) as client:
                resp = client.post(
                    f"{BASE_URL}/trigger",
                    params={"dataset_id": dataset_id, "include_errors": "true"},
                    json=inputs,
                    headers=self._headers(),
                )
        except httpx.HTTPError as exc:
            log.warning("brightdata trigger failed: %s", exc)
            return None

        if resp.status_code >= 400:
            log.warning("brightdata trigger %s: %s", resp.status_code, resp.text[:200])
            return None
        data = resp.json()
        return data.get("snapshot_id") if isinstance(data, dict) else None

    def wait_for_snapshot(
        self,
        snapshot_id: str,
        *,
        max_wait_seconds: int = 300,
        poll_interval_seconds: int = 10,
    ) -> list[dict[str, Any]]:
        if not self.enabled or not snapshot_id:
            return []

        deadline = time.time() + max_wait_seconds
        with httpx.Client(timeout=60) as client:
            while time.time() < deadline:
                try:
                    resp = client.get(
                        f"{BASE_URL}/snapshot/{snapshot_id}",
                        params={"format": "json"},
                        headers=self._headers(),
                    )
                except httpx.HTTPError as exc:
                    log.warning("brightdata snapshot poll failed: %s", exc)
                    time.sleep(poll_interval_seconds)
                    continue

                if resp.status_code == 200:
                    body = resp.json()
                    if isinstance(body, list):
                        return body
                    if isinstance(body, dict) and body.get("status") == "running":
                        time.sleep(poll_interval_seconds)
                        continue
                    return []

                if resp.status_code == 202:
                    time.sleep(poll_interval_seconds)
                    continue

                log.warning(
                    "brightdata snapshot %s returned %s",
                    snapshot_id,
                    resp.status_code,
                )
                return []

        log.info("brightdata snapshot %s timed out after %ss", snapshot_id, max_wait_seconds)
        return []

    def fetch_sync(self, dataset_id: str, urls: list[str]) -> list[dict[str, Any]]:
        snapshot_id = self.trigger(dataset_id, [{"url": u} for u in urls])
        if not snapshot_id:
            return []
        return self.wait_for_snapshot(snapshot_id)
