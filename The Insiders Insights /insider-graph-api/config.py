from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    firestore_project_id: str = ""
    cdn_bucket: str = ""
    cdn_base_url: str = "https://cdn.insidergraph.io"

    # Probe-motorer (de publika AI-assistenterna vi MÄTER, inte våra egna). Avsiktligt
    # första-parts US: probe-payloaden är publik (bolagsnamn + generisk fråga) och poängen
    # är att mäta de motorer användare faktiskt träffar. Se services/llm.py + projektminne.
    openai_api_key: str = ""
    gemini_api_key: str = ""
    # (Ingen anthropic_api_key: validatorn (Claude) går via Vertex AI EU, inte
    # förstaparts-API. EU-only-beslut 2026-05-26. Se services/llm.py.)

    # EU-only där det betyder något: våra egna resonemangsmodeller (generator/validator)
    # behandlar full kunddata internt och körs via Vertex AI i EU-region — ingen
    # första-parts US-väg. Service-account-auth (ADC).
    gcp_project: str = ""
    vertex_location: str = "europe-west1"  # EU-region som har både Gemini och Claude på Vertex

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
