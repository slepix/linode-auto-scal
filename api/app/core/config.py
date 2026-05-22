from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    database_url: str = "postgresql://autoscaler:autoscaler@postgres:5432/autoscaler"
    autoscaler_secret_key: str = "change-me-in-production-32-chars!!"
    debug: bool = False
    api_title: str = "Linode Instance Autoscaler"
    api_version: str = "v1"
    linode_api_base_url: str = "https://api.linode.com/v4"
    linode_api_max_rps: int = 5
    linode_api_max_retries: int = 5

    class Config:
        env_file = ".env"


settings = Settings()
