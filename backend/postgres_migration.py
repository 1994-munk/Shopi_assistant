"""Database migration helpers for the production Postgres session layer.

This file intentionally keeps the migration path explicit and readable so it can be
reviewed by a human before or during deployment.
"""

from __future__ import annotations

import os
from typing import Any, Dict

try:
    import psycopg
except ImportError:  # pragma: no cover - optional dependency at runtime
    psycopg = None  # type: ignore[assignment]


def ensure_postgres_schema(dsn: str | None = None) -> Dict[str, Any]:
    """Create the required Postgres tables and return a simple status payload."""

    target_dsn = dsn or os.getenv("DATABASE_URL")
    if not target_dsn:
        return {"status": "skipped", "reason": "DATABASE_URL is not configured"}

    if psycopg is None:
        return {"status": "error", "reason": "psycopg is not installed"}

    try:
        with psycopg.connect(target_dsn) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS sessions (
                        session_id TEXT PRIMARY KEY,
                        basket_json TEXT NOT NULL,
                        metadata_json TEXT NOT NULL,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS messages (
                        id SERIAL PRIMARY KEY,
                        session_id TEXT NOT NULL,
                        role TEXT NOT NULL,
                        content TEXT NOT NULL,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS turns (
                        id SERIAL PRIMARY KEY,
                        session_id TEXT NOT NULL,
                        user_message TEXT NOT NULL,
                        intent TEXT NOT NULL,
                        response_text TEXT NOT NULL,
                        safety_flags TEXT NOT NULL,
                        latency_ms INTEGER NOT NULL,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
                cursor.execute(
                    "CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages (session_id)"
                )
                cursor.execute(
                    "CREATE INDEX IF NOT EXISTS idx_turns_session_id ON turns (session_id)"
                )
                connection.commit()
    except Exception as exc:  # pragma: no cover - runtime migration result is reported, not raised
        return {"status": "error", "reason": str(exc)}

    return {"status": "ok", "database": "postgres", "tables": ["sessions", "messages", "turns"]}
