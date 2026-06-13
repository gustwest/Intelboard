from dataclasses import asdict

from connectors.base import BaseConnector, ConnectorConfig, InputField, RawItem
from connectors.gleif import GleifConnector
from connectors.jobfeed import JobFeedConnector
from connectors.linkedin_capacity import LinkedInCapacityConnector
from connectors.rss import RssConnector
from connectors.ted import TedConnector
from connectors.website import WebsiteConnector
from connectors.wikipedia import WikipediaConnector

REGISTRY: dict[str, type[BaseConnector]] = {
    LinkedInCapacityConnector.id: LinkedInCapacityConnector,
    RssConnector.id: RssConnector,
    JobFeedConnector.id: JobFeedConnector,
    GleifConnector.id: GleifConnector,
    WebsiteConnector.id: WebsiteConnector,
    WikipediaConnector.id: WikipediaConnector,
    TedConnector.id: TedConnector,
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
