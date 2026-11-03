"""Environment configuration for the next production layer.

This file keeps the runtime settings explicit and easy to review. It reduces the
chance that secrets or connection settings are buried inside application code.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass
class Settings:
    """Centralized application configuration for the backend."""

    app_env: str = os.getenv("APP_ENV", "development")
    app_port: int = int(os.getenv("APP_PORT", "8000"))

    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    openai_api_base: str = os.getenv("OPENAI_API_BASE", "")
    llm_provider: str = os.getenv("LLM_PROVIDER", "openai")

    vector_backend: str = os.getenv("VECTOR_BACKEND", "in_memory")
    qdrant_url: str = os.getenv("QDRANT_URL", "")
    qdrant_api_key: str = os.getenv("QDRANT_API_KEY", "")
    qdrant_collection: str = os.getenv("QDRANT_COLLECTION", "shopi-products")

    database_url: str = os.getenv("DATABASE_URL", "")
    postgres_host: str = os.getenv("POSTGRES_HOST", "localhost")
    postgres_db: str = os.getenv("POSTGRES_DB", "shopi")
    postgres_user: str = os.getenv("POSTGRES_USER", "shopi")
    postgres_password: str = os.getenv("POSTGRES_PASSWORD", "shopi")


SETTINGS = Settings()
