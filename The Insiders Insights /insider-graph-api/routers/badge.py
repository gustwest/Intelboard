"""Endpoint som genererar badge-snutten (lager 3) att lämna till kunden.

Admin-verktyg: ops hämtar snutten och ger den till kunden att klistra in. Badgen
i sig är statisk och behöver ingen live-tjänst — detta är bara generatorn.
"""
from typing import Literal

from fastapi import APIRouter, HTTPException

import firestore_client as fs
from schema_org.badge import profile_url, render_badge, render_badge_js

router = APIRouter(prefix="/api/badge", tags=["badge"])


@router.get("/{client_id}")
def get_badge(
    client_id: str,
    theme: Literal["light", "dark"] = "light",
    variant: Literal["footer", "pill"] = "footer",
    accent: str | None = None,
    delivery: Literal["static", "js"] = "static",
) -> dict[str, str]:
    if not fs.client_doc(client_id).get().exists:
        raise HTTPException(404, f"client not found: {client_id}")

    kwargs = {"theme": theme, "variant": variant, "accent": accent}
    snippet = render_badge_js(client_id, **kwargs) if delivery == "js" else render_badge(client_id, **kwargs)
    # preview = alltid statisk inline-variant så den kan visas i UI:t (pill är fixed).
    preview = render_badge(client_id, theme=theme, accent=accent, variant="footer")
    return {
        "client_id": client_id,
        "profile_url": profile_url(client_id),
        "delivery": delivery,
        "snippet": snippet,
        "preview": preview,
    }
