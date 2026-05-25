from dataclasses import asdict

from connectors.base import BaseConnector, ConnectorConfig, InputField, RawItem
from connectors.bolagsverket import BolagsverketConnector
from connectors.gleif import GleifConnector
from connectors.linkedin import LinkedInConnector
from connectors.rss import RssConnector
from connectors.website import WebsiteConnector

REGISTRY: dict[str, type[BaseConnector]] = {
    LinkedInConnector.id: LinkedInConnector,
    RssConnector.id: RssConnector,
    BolagsverketConnector.id: BolagsverketConnector,
    GleifConnector.id: GleifConnector,
    WebsiteConnector.id: WebsiteConnector,
}


def get(connector_id: str) -> type[BaseConnector]:
    if connector_id not in REGISTRY:
        raise KeyError(f"unknown connector: {connector_id}")
    return REGISTRY[connector_id]


def all_metadata() -> list[dict[str, object]]:
    """UI-vänlig sammanfattning av tillgängliga connectors."""
    out: list[dict[str, object]] = []
    for cid, cls in REGISTRY.items():
        out.append(
            {
                "id": cid,
                "fetch_method": cls.fetch_method,
                "output_types": list(cls.output_types),
                "frequency": cls.frequency,
                "tier": cls.tier,
                "input_fields": [asdict(f) for f in cls.input_fields],
            }
        )
    return out


__all__ = ["BaseConnector", "ConnectorConfig", "InputField", "RawItem", "REGISTRY", "all_metadata", "get"]
