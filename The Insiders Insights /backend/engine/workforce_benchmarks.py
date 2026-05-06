"""Default workforce distribution benchmarks by job function.

These represent approximate shares of LinkedIn's global professional workforce.
Can be overridden per customer via ICP configuration (icp_json.workforce_shares).
"""
from typing import Dict, Optional

# Default shares (must sum to ~1.0)
# Source: Generalized from LinkedIn Talent Insights averages across Nordic markets.
DEFAULT_WORKFORCE_SHARES: Dict[str, float] = {
    "Engineering": 0.12,
    "Operations": 0.13,
    "Sales": 0.10,
    "Marketing": 0.06,
    "Human Resources": 0.05,
    "Finance": 0.07,
    "Information Technology": 0.09,
    "Business Development": 0.04,
    "Administrative": 0.06,
    "Healthcare Services": 0.08,
    "Education": 0.05,
    "Legal": 0.03,
    "Research": 0.02,
    "Consulting": 0.03,
    "Support": 0.04,
    "Other": 0.03,
}

# Seniority level benchmarks (approximate LinkedIn distribution)
DEFAULT_SENIORITY_SHARES: Dict[str, float] = {
    "Entry": 0.20,
    "Senior": 0.30,
    "Manager": 0.20,
    "Director": 0.12,
    "VP": 0.08,
    "CXO": 0.05,
    "Owner": 0.03,
    "Unpaid": 0.02,
}

# Activity index thresholds for decision funnel placement
FUNNEL_THRESHOLDS = {
    "ovetandes": (0.0, 0.3),        # Unaware — barely visiting
    "medvetenhet": (0.3, 0.7),      # Awareness — low activity
    "overvagande": (0.7, 1.3),      # Consideration — normal
    "konvertering": (1.3, 2.5),     # Conversion — high activity
    "ambassadorskap": (2.5, float("inf")),  # Ambassadorship — superfans
}

FUNNEL_LABELS = {
    "ovetandes": "Ovetandes",
    "medvetenhet": "Medvetenhet",
    "overvagande": "Övervägande",
    "konvertering": "Konvertering",
    "ambassadorskap": "Ambassadörskap",
}

FUNNEL_STRATEGIES = {
    "ovetandes": "Bred varumärkesbyggande räckvidd — sponsrade inlägg, thought leadership, branschsamarbeten.",
    "medvetenhet": "Engagemangskampanjer — video, medarbetarberättelser, karriärsidor med riktade CTA:er.",
    "overvagande": "Nurtureflöden — e-böcker, webinarier, djupgående artiklar, retargeting.",
    "konvertering": "Direkt konvertering — jobbannonsering, apply-CTA:er, personlig outreach, events.",
    "ambassadorskap": "Aktivera som ambassadörer — medarbetaradvocacy, referral-program, testimonials.",
}


def get_workforce_shares(customer_icp: Optional[dict]) -> Dict[str, float]:
    """Get workforce shares, using customer ICP overrides if available."""
    if customer_icp and customer_icp.get("workforce_shares"):
        return customer_icp["workforce_shares"]
    return DEFAULT_WORKFORCE_SHARES.copy()


def get_seniority_shares(customer_icp: Optional[dict]) -> Dict[str, float]:
    """Get seniority shares, using customer ICP overrides if available."""
    if customer_icp and customer_icp.get("seniority_shares"):
        return customer_icp["seniority_shares"]
    return DEFAULT_SENIORITY_SHARES.copy()
