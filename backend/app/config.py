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

    # Model toggle
    use_mock_models: bool = True

    # Model paths — point to ML_DL_Models/ subdirectories
    roberta_model_path: str = "./ML_DL_Models/Email/"
    url_model_path: str = "./ML_DL_Models/Url/"
    web_model_path: str = "./ML_DL_Models/Web/"
    voice_model_path: str = "./ML_DL_Models/DeepFake Voice Detection/"
    whisper_model_size: str = "base"

    # Web analysis config
    screenshot_bucket: str = "screenshots"
    playwright_timeout_ms: int = 15000

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
