"""LinkedIn-kapacitetsdata (kvartal) — connector-markör för uppladdningsflödet (spec §4).

Till skillnad från övriga connectors hämtar den inget själv: kvartalsdatan samlas in
av oss och laddas upp + verifieras manuellt (routers/linkedin.py, routers/review.py),
varefter kompetenserna korsvalideras mot jobfeed-annonserna (schema_org/claims.py).

Den finns i registret så att den kan slås på per kund i Connectors-UI:t. Påslaget
styr den kvartalsvisa interna påminnelsen (jobs/quarterly_todo.py) — verifierad data
används i grafen oavsett, men påminnelsen skickas bara för påslagna kunder.
"""
from __future__ import annotations

from connectors.base import BaseConnector, ConnectorConfig, RawItem


class LinkedInCapacityConnector(BaseConnector):
    id = "linkedin_capacity"
    fetch_method = "upload"
    output_types = ("Organization",)
    frequency = "quarterly"
    tier = "standard"

    def fetch(self, config: ConnectorConfig) -> list[RawItem]:
        # Datan kommer via manuell uppladdning + verifiering, inte scraping.
        return []
