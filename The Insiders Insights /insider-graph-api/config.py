from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    firestore_project_id: str = ""
    cdn_bucket: str = ""
    cdn_base_url: str = "https://cdn.insidergraph.io"
    # Clean-URL-läge: bakom HTTPS-LB med MainPageSuffix serveras profilsidorna på
    # egen domän med rena katalog-URL:er (…/<id>/) och innehåll utan clients/-prefix.
    # Default False = GCS path-style (explicit …/index.html). Flippas vid cutover
    # tillsammans med CDN_BASE_URL — se docs/clean-url-cutover.md.
    cdn_clean_urls: bool = False

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
    vertex_location: str = "europe-west1"  # EU-region för Vertex AI (Gemini)
    # Cloud Scheduler ligger i europe-west1 (ej tillgängligt i europe-north1). Speglar
    # SCHEDULER_LOCATION i scripts/bootstrap.sh. Styr schema-status/paus-API:t.
    scheduler_location: str = "europe-west1"

    # Modellvalet för resonemangsmodellerna (generator/validator) bor i services/llm.py
    # (GEO_GENERATOR_MODEL / GEO_VALIDATOR_MODEL, env-överstyrbara). BÅDA rollerna körs på
    # Gemini via Vertex EU — Claude är inte EU-resident i regionen, så ingen Claude-väg.

    brightdata_api_key: str = ""
    brightdata_linkedin_profile_dataset_id: str = ""
    brightdata_linkedin_company_dataset_id: str = ""
    brightdata_linkedin_posts_dataset_id: str = ""
    sendgrid_api_key: str = ""

    admin_api_key: str = ""
    sendgrid_webhook_secret: str = ""
    # Kvartals-påminnelsen (spec §4.1) är INTERN — vi samlar in LinkedIn-datan själva.
    # notify_from_email = avsändare, ops_notify_email = vårt interna mottagar-team.
    # Saknas någon → inget mejl skickas (To-Do:n i dashboarden skapas ändå).
    notify_from_email: str = ""
    ops_notify_email: str = ""
    # Privat GCS-bucket för kunduppladdat verifieringsunderlag (LinkedIn-skärmklipp,
    # spec §4.2). EU-only: ska INTE vara den publika CDN-bucketen. Tom → underlaget
    # lagras inte (endast filnamnet sparas, som tidigare).
    upload_bucket: str = ""

    # MVP: hämta bara bolagets LinkedIn-sida, inte individuella personprofiler.
    # Sätt SCRAPE_EMPLOYEE_LINKEDIN=true för att slå på per-medarbetare-scrape igen.
    scrape_employee_linkedin: bool = False

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
