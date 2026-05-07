from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Supabase
    supabase_url: str
    supabase_anon_key: str
    supabase_service_key: str

    # Redis
    redis_url: str = "redis://localhost:6379"
    redis_ttl_seconds: int = 3600

    # App
    app_env: str = "development"
    secret_key: str = "change-me"
    frontend_url: str = "http://localhost:3000"

    # Rate Limiting
    rate_limit_analyses_per_minute: int = 20
    rate_limit_feedback_per_hour: int = 50

    # ⚠️  MODEL CHANGE POINT:
    # Toggle this to false when real models are placed in ml_models/
    use_mock_models: bool = True

    roberta_model_path: str = "./ml_models/roberta/"
    url_model_path: str = "./ml_models/url_xgb_bilstm/"
    web_model_path: str = "./ml_models/web_xgb_phash/"
    whisper_model_size: str = "base"

    # Cascade: skip web engine if URL score >= threshold
    cascade_threshold: float = 0.90

    # Campaign detection config
    campaign_min_reports: int = 3
    campaign_window_days: int = 2

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
