"""Environment-driven configuration. No secrets are ever hardcoded."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- core ---
    app_name: str = "LetMeLead"
    env: Literal["local", "staging", "production"] = "local"
    api_base_url: str = "http://localhost:8000"
    web_base_url: str = "http://localhost:3000"
    database_url: str = "postgresql+psycopg://letmelead:letmelead@localhost:5432/letmelead"
    redis_url: str = "redis://localhost:6379/0"

    # --- auth ---
    jwt_secret: str = Field(default="dev-only-change-me", min_length=8)
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 30
    refresh_token_days: int = 30
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/v1/auth/google/callback"
    # Encrypts LinkedIn session blobs at rest. Generate with: python -c "import secrets;print(secrets.token_urlsafe(32))"
    session_encryption_key: str = ""

    # --- product rules ---
    free_leads_per_tenant: int = 10
    lead_price_credits: int = 1
    signal_max_age_days: int = 90
    credits_per_pack: int = 100
    credits_pack_price_cents: int = 4900

    # --- providers ---
    llm_provider: Literal["none", "openai", "anthropic", "ollama"] = "none"
    llm_base_url: str = "https://api.openai.com/v1"
    llm_api_key: str = ""
    llm_model: str = "gpt-4o-mini"
    llm_timeout_seconds: int = 45

    enrichment_provider: Literal["none", "pattern"] = "pattern"
    enrichment_api_key: str = ""

    x_bearer_token: str = ""
    google_maps_api_key: str = ""
    maps_query: str = ""
    fb_access_token: str = ""
    fb_page_ids: str = ""
    reviews_feed_url: str = ""
    reddit_enabled: bool = True
    discovery_provider: Literal["static", "llm"] = "static"

    # --- billing ---
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""

    # --- outreach safety ---
    outreach_enabled: bool = False
    outreach_dry_run: bool = True
    outreach_min_seconds: int = 45
    outreach_max_seconds: int = 180
    outreach_new_account_daily_cap: int = 5
    outreach_max_daily_cap: int = 20
    outreach_withdraw_after_days: int = 21

    # --- infra ---
    s3_endpoint_url: str = ""
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_bucket: str = "letmelead-exports"
    sentry_dsn: str = ""
    log_level: str = "INFO"
    cors_origins: str = "http://localhost:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
