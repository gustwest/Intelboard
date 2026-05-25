from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    firestore_project_id: str = ""
    cdn_bucket: str = ""
    cdn_base_url: str = "https://cdn.insidergraph.io"

    openai_api_key: str = ""
    gemini_api_key: str = ""

    brightdata_api_key: str = ""
    brightdata_linkedin_profile_dataset_id: str = ""
    brightdata_linkedin_company_dataset_id: str = ""
    brightdata_linkedin_posts_dataset_id: str = ""
    sendgrid_api_key: str = ""

    admin_api_key: str = ""
    sendgrid_webhook_secret: str = ""
    bolagsverket_api_key: str = ""

    # MVP: hämta bara bolagets LinkedIn-sida, inte individuella personprofiler.
    # Sätt SCRAPE_EMPLOYEE_LINKEDIN=true för att slå på per-medarbetare-scrape igen.
    scrape_employee_linkedin: bool = False

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
