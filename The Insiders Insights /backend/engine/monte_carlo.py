import numpy as np
from typing import Dict, Any

def run_multi_domain_simulation(
    followers: int,
    impressions_90d: int,
    linkedin_engagement_rate: float,
    network_density: float,
    lurker_ratio: float,
    trust_multiplier: float,
    iterations: int = 10000
) -> Dict[str, Any]:
    """
    Monte Carlo simulation for Sales, Recruiting, and Valuation over a defined period (e.g. 1 year).
    Instead of hardcoded constants, uses LinkedIn Analytics inputs for dynamic baseline metrics.
    """
    
    # Base normalization (convert 90d to an annual rolling impact base)
    annualized_impressions = impressions_90d * 4
    
    # 1. CORE REACH (Liquidity & Spridningshastighet)
    base_reach_mu = np.log(annualized_impressions * (0.5 + network_density * 0.5))
    base_reach_sigma = 0.5 * (1 - network_density) + 0.1
    simulated_reach = np.random.lognormal(mean=base_reach_mu, sigma=base_reach_sigma, size=iterations)

    # Core active base
    active_ratio = 1.0 - lurker_ratio
    
    # --- DOMAIN 1: SÄLJMOTOR (Sales Velocity) ---
    # Lead conversion heavily relies on Trust and direct active engagement
    sales_eng_mu = np.log((linkedin_engagement_rate + 0.01) * active_ratio * 0.5)
    sales_eng_rates = np.random.lognormal(mean=sales_eng_mu, sigma=0.3, size=iterations)
    simulated_sales_eng = simulated_reach * sales_eng_rates
    
    dark_social_sales = lurker_ratio * 0.0005 * trust_multiplier
    direct_sales = 0.01 * trust_multiplier
    
    conv_rates_sales = np.random.normal(loc=(direct_sales + dark_social_sales), scale=0.002, size=iterations)
    conv_rates_sales = np.clip(conv_rates_sales, 0.0001, None)
    
    simulated_leads = simulated_sales_eng * conv_rates_sales
    
    # --- DOMAIN 2: REKRYTERING (Human Capital) ---
    # Top talent is often passive. Lurker ratio is POSITIVE for recruiting if Trust is high (Halo Effect).
    recruiting_pool_factor = (lurker_ratio * 1.5) + (trust_multiplier * 0.5)
    
    top_talent_conversion = 0.0001 * recruiting_pool_factor # 1 in 10000 becomes a viable candidate
    candidates = np.random.normal(loc=(simulated_reach * top_talent_conversion), scale=2.0, size=iterations)
    simulated_hires = np.clip(candidates * 0.1, 0, None) # 10% of candidates hired

    # --- DOMAIN 3: BOLAGSVÄRDERING (Intangible Assets / Brand Equity) ---
    # Pure Share of Voice value. Valued based on CPM offsets and investor perception compounding.
    sov_multiplier = trust_multiplier * (1.0 + network_density)
    # Assume 1 impression = $0.05 in brand equity over time if high trust, less if low trust
    base_cpm_value = 0.05 * sov_multiplier 
    
    value_variance = np.random.normal(loc=1.0, scale=0.1, size=iterations)
    simulated_valuation = simulated_reach * base_cpm_value * value_variance


    # HELPER: Compute percentiles and chart data
    def get_metrics(data: np.ndarray) -> Dict[str, float]:
        return {
            "p10": float(np.percentile(data, 10)),
            "p50": float(np.percentile(data, 50)),
            "p90": float(np.percentile(data, 90)),
        }

    def get_histogram(data: np.ndarray) -> list:
        hist_counts, hist_bins = np.histogram(data, bins=25)
        hist_data = []
        for i in range(len(hist_counts)):
            hist_data.append({
                "value": int((hist_bins[i] + hist_bins[i+1])/2),
                "probability": int(hist_counts[i])
            })
        return hist_data

    # Return grouped domains
    return {
        "sales": {
            "reach": get_metrics(simulated_reach),
            "engagements": get_metrics(simulated_sales_eng),
            "leads": get_metrics(simulated_leads),
            "histogram": get_histogram(simulated_leads)
        },
        "recruiting": {
            "candidates": get_metrics(candidates),
            "hires": get_metrics(simulated_hires),
            "histogram": get_histogram(simulated_hires)
        },
        "valuation": {
            "impressions": get_metrics(simulated_reach), 
            "brand_equity_usd": get_metrics(simulated_valuation),
            "histogram": get_histogram(simulated_valuation)
        }
    }
