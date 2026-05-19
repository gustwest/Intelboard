from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    firestore_project_id: str = ""
    cdn_bucket: str = ""
    cdn_base_url: str = "https://cdn.insidergraph.io"

    openai_api_key: str = ""
    gemini_api_key: str = ""

    brightdata_api_key: str = ""
    sendgrid_api_key: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
