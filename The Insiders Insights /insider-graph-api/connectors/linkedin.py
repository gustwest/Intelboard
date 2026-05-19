"""LinkedIn-connector — stub.

Skickar scrape-requests via Bright Data proxy. Implementation kommer i nästa
iteration; idag returnerar fetch() en tom lista så övriga lager kan utvecklas
parallellt.
"""
from connectors.base import BaseConnector, ConnectorConfig, RawItem


class LinkedInConnector(BaseConnector):
    id = "linkedin"
    fetch_method = "scrape"
    output_types = ("Organization", "Person", "SocialMediaPosting", "JobPosting")
    frequency = "daily"
    tier = "standard"

    def fetch(self, config: ConnectorConfig) -> list[RawItem]:
        return []
