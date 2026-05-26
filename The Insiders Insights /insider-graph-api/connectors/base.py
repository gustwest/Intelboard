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

FetchMethod = Literal["api", "rss", "scrape", "email", "upload"]
Frequency = Literal["realtime", "daily", "weekly", "monthly", "quarterly"]
Tier = Literal["standard", "optional", "custom"]
FieldType = Literal["text", "url", "bool", "feed_list"]


@dataclass(frozen=True)
class InputField:
    """Ett input-fält som connectorn behöver för att fungera.

    Onboarding-UI:t renderar fälten generiskt utifrån `all_metadata()` och
    blockerar skapande om ett `required`-fält för en påslagen connector saknas.
    `name` matchar nyckeln i onboarding-payloaden (se routers/onboard.py).
    """

    name: str
    label: str
    type: FieldType = "text"
    required: bool = True
    placeholder: str = ""
    help: str = ""


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
    # Stabilt dokument-id. None → jobbet använder .add() (slumpmässigt id, som
    # tidigare). Sätt ett deterministiskt id (t.ex. hash av url+chunk_index) för
    # idempotent persist: omkörning skriver över i stället för att hopa dubbletter.
    item_id: str | None = None


class BaseConnector(ABC):
    id: ClassVar[str]
    fetch_method: ClassVar[FetchMethod]
    output_types: ClassVar[tuple[str, ...]]
    frequency: ClassVar[Frequency]
    tier: ClassVar[Tier]
    # Fält som onboarding-UI:t ska visa när connectorn slås på. Tom = inget
    # företagsfält behövs (t.ex. om connectorn bara körs per medarbetare).
    input_fields: ClassVar[tuple[InputField, ...]] = ()

    @abstractmethod
    def fetch(self, config: ConnectorConfig) -> list[RawItem]:
        """Hämta nya items sedan senaste körningen.

        Vid blockering / 429 / temporärt fel: logga, returnera tom lista,
        kasta inget undantag. Schemalägg om vid nästa cron-tick.
        """

    def health_check(self) -> bool:
        return True
