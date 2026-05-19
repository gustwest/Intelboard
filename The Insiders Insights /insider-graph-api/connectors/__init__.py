from connectors.base import BaseConnector, ConnectorConfig, RawItem
from connectors.linkedin import LinkedInConnector

REGISTRY: dict[str, type[BaseConnector]] = {
    LinkedInConnector.id: LinkedInConnector,
}


def get(connector_id: str) -> type[BaseConnector]:
    if connector_id not in REGISTRY:
        raise KeyError(f"unknown connector: {connector_id}")
    return REGISTRY[connector_id]


__all__ = ["BaseConnector", "ConnectorConfig", "RawItem", "REGISTRY", "get"]
