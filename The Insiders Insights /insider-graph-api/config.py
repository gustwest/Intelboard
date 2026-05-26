from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    firestore_project_id: str = ""
    cdn_bucket: str = ""
    cdn_base_url: str = "https://cdn.insidergraph.io"

    # Probe-motorer (de publika AI-assistenterna vi MÄTER, inte våra egna). Kvar som
    # första-parts tills EU-kompatibel probe-routning beslutats (se llm.py / projektminne).
    openai_api_key: str = ""
    gemini_api_key: str = ""
    anthropic_api_key: str = ""  # legacy/probe; våra resonemangsmodeller går via Vertex EU.

    # EU-only (hårt krav): våra egna resonemangsmodeller (generator/validator) körs via
    # Vertex AI i EU-region — ingen första-parts US-väg. Service-account-auth (ADC).
    gcp_project: str = ""
    vertex_location: str = "europe-west1"  # EU-region som har både Gemini och Claude på Vertex
    # När True (default) routas ALLT EU: probe-GPT kräver Azure OpenAI EU, annars stängs
    # den av (fail-closed). False = escape hatch för icke-EU-miljöer (första-parts US-GPT).
    eu_only: bool = True

    # Probe-motorer i EU: Gemini via Vertex (samma modell, EU-region → mätneutralt),
    # GPT-4o via Azure OpenAI EU (identisk modell, EU-region). Se services/llm.py.
    probe_gemini_model: str = "gemini-1.5-pro"
    azure_openai_endpoint: str = ""
    azure_openai_api_key: str = ""
    azure_openai_deployment: str = ""  # deployment-namn för gpt-4o i Azure
    azure_openai_api_version: str = "2024-10-21"

    # Modellval för claims-pipelinen (hybrid). Konfig-överstyrbart eftersom exakta
    # API-modellsträngar rör sig — ops kan rätta utan kodändring.
    # Generera/relevans: stort kontextfönster sväljer hela korpusen i ett anrop.
    generator_model: str = "gemini-3.1-pro"
    # Validering: vassaste resonemanget på det precisionskritiska steget.
    validator_model: str = "claude-opus-4-7"

    brightdata_api_key: str = ""
    brightdata_linkedin_profile_dataset_id: str = ""
    brightdata_linkedin_company_dataset_id: str = ""
    brightdata_linkedin_posts_dataset_id: str = ""
    sendgrid_api_key: str = ""

    admin_api_key: str = ""
    sendgrid_webhook_secret: str = ""

    # MVP: hämta bara bolagets LinkedIn-sida, inte individuella personprofiler.
    # Sätt SCRAPE_EMPLOYEE_LINKEDIN=true för att slå på per-medarbetare-scrape igen.
    scrape_employee_linkedin: bool = False

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
