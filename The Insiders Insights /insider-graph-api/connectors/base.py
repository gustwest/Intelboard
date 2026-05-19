"""BaseConnector — alla datakällor implementerar samma interface.

Design: GEO-motorn vet aldrig vilken connector som levererade ett objekt. Den
ser bara `RawItem`-objekt med `schema_type` och kompilerar dem till JSON-LD.

Nya connectors läggs till genom att subclassa BaseConnector och registrera
i connectors/__init__.py REGISTRY.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, ClassVar, Literal

FetchMethod = Literal["api", "rss", "scrape", "email"]
Frequency = Literal["realtime", "daily", "weekly", "monthly"]
Tier = Literal["standard", "optional", "custom"]


@dataclass
class ConnectorConfig:
    client_id: str
    employee_id: str | None = None
    params: dict[str, Any] = field(default_factory=dict)


@dataclass
class RawItem:
    source: str
    schema_type: str
    content: str
    url: str
    published_at: datetime
    extra: dict[str, Any] = field(default_factory=dict)


class BaseConnector(ABC):
    id: ClassVar[str]
    fetch_method: ClassVar[FetchMethod]
    output_types: ClassVar[tuple[str, ...]]
    frequency: ClassVar[Frequency]
    tier: ClassVar[Tier]

    @abstractmethod
    def fetch(self, config: ConnectorConfig) -> list[RawItem]:
        """Hämta nya items sedan senaste körningen.

        Vid blockering / 429 / temporärt fel: logga, returnera tom lista,
        kasta inget undantag. Schemalägg om vid nästa cron-tick.
        """

    def health_check(self) -> bool:
        return True
