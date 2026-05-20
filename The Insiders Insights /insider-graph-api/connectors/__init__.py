from connectors.base import BaseConnector, ConnectorConfig, RawItem
from connectors.bolagsverket import BolagsverketConnector
from connectors.linkedin import LinkedInConnector
from connectors.rss import RssConnector

REGISTRY: dict[str, type[BaseConnector]] = {
    LinkedInConnector.id: LinkedInConnector,
    RssConnector.id: RssConnector,
    BolagsverketConnector.id: BolagsverketConnector,
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
            }
        )
    return out


__all__ = ["BaseConnector", "ConnectorConfig", "RawItem", "REGISTRY", "all_metadata", "get"]
