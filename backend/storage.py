"""Durable session storage for Shopi.

This module models the next production step beyond in-memory session state.
It supports SQLite by default and automatically upgrades to Postgres when the app is
configured with a DATABASE_URL. The public interface remains the same so the rest of
engineering does not have to know which backend is active.
"""

from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    import psycopg
except ImportError:  # pragma: no cover - optional dependency at runtime
    psycopg = None  # type: ignore[assignment]


class SQLiteSessionStore:
    """SQLite-backed storage for sessions, prompts, and turn telemetry."""

    def __init__(self, db_path: str = "shopi.db") -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize_database()

    def migrate_schema(self) -> Dict[str, Any]:
        """Ensure the SQLite schema exists; this is a no-op for an already initialized store."""

        self._initialize_database()
        return {"status": "ok", "database": "sqlite"}

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _initialize_database(self) -> None:
        """Create the tables needed for durable session state and event capture."""

        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    session_id TEXT PRIMARY KEY,
                    basket_json TEXT NOT NULL,
                    metadata_json TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS turns (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    user_message TEXT NOT NULL,
                    intent TEXT NOT NULL,
                    response_text TEXT NOT NULL,
                    safety_flags TEXT NOT NULL,
                    latency_ms INTEGER NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

    def save_session(self, session_id: str, basket: List[Dict[str, Any]], metadata: Dict[str, Any]) -> None:
        """Persist the current basket and session metadata."""

        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO sessions (session_id, basket_json, metadata_json, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(session_id)
                DO UPDATE SET basket_json = excluded.basket_json,
                              metadata_json = excluded.metadata_json,
                              updated_at = CURRENT_TIMESTAMP
                """,
                (session_id, json.dumps(basket), json.dumps(metadata)),
            )

    def load_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Load a session if it already exists; otherwise return None."""

        with self._connect() as connection:
            row = connection.execute(
                "SELECT session_id, basket_json, metadata_json FROM sessions WHERE session_id = ?",
                (session_id,),
            ).fetchone()

        if row is None:
            return None

        return {
            "session_id": row["session_id"],
            "basket": json.loads(row["basket_json"]),
            "metadata": json.loads(row["metadata_json"]),
        }

    def append_message(self, session_id: str, role: str, content: str) -> None:
        """Keep a readable transcript for debugging and product review."""

        with self._connect() as connection:
            connection.execute(
                "INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)",
                (session_id, role, content),
            )

    def append_turn(
        self,
        session_id: str,
        user_message: str,
        intent: str,
        response_text: str,
        safety_flags: List[str],
        latency_ms: int,
    ) -> None:
        """Record a turn-level event used for evaluation and monitoring."""

        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO turns (session_id, user_message, intent, response_text, safety_flags, latency_ms)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (session_id, user_message, intent, response_text, ",".join(safety_flags), latency_ms),
            )

    def list_recent_turns(self, session_id: str, limit: int = 20) -> List[Dict[str, Any]]:
        """Return recent turn events for debugging or evaluation screens."""

        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT user_message, intent, response_text, safety_flags, latency_ms, created_at
                FROM turns
                WHERE session_id = ?
                ORDER BY id DESC
                LIMIT ?
                """,
                (session_id, limit),
            ).fetchall()

        return [dict(row) for row in rows]

    def list_recent_sessions(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Return recent session summaries for dashboards and review screens."""

        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT session_id, basket_json, metadata_json, updated_at
                FROM sessions
                ORDER BY updated_at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()

        return [
            {
                "session_id": row["session_id"],
                "basket": json.loads(row["basket_json"]),
                "metadata": json.loads(row["metadata_json"]),
                "updated_at": row["updated_at"],
            }
            for row in rows
        ]


class PostgresSessionStore:
    """Postgres-backed session store intended for production deployments."""

    def __init__(self, dsn: Optional[str] = None) -> None:
        self.dsn = dsn or os.getenv("DATABASE_URL", "")
        if not self.dsn:
            raise RuntimeError("DATABASE_URL must be set when using the Postgres store.")
        self._initialize_database()

    def _connect(self):
        if psycopg is None:
            raise RuntimeError("psycopg package is required for Postgres-backed session storage.")
        return psycopg.connect(self.dsn)

    def _initialize_database(self) -> None:
        with self._connect() as connection:
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
                connection.commit()

    def migrate_schema(self) -> Dict[str, Any]:
        """Create the Postgres tables if the database URL is configured."""

        dsn = os.getenv("DATABASE_URL")
        if not dsn:
            self._initialize_database()
            return {"status": "ok", "database": "sqlite", "tables": ["sessions", "messages", "turns"]}

        from postgres_migration import ensure_postgres_schema

        return ensure_postgres_schema(dsn)

    def save_session(self, session_id: str, basket: List[Dict[str, Any]], metadata: Dict[str, Any]) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO sessions (session_id, basket_json, metadata_json, updated_at)
                    VALUES (%s, %s, %s, NOW())
                    ON CONFLICT (session_id)
                    DO UPDATE SET basket_json = EXCLUDED.basket_json,
                                  metadata_json = EXCLUDED.metadata_json,
                                  updated_at = NOW()
                    """,
                    (session_id, json.dumps(basket), json.dumps(metadata)),
                )
                connection.commit()

    def load_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT session_id, basket_json, metadata_json FROM sessions WHERE session_id = %s",
                    (session_id,),
                )
                row = cursor.fetchone()

        if row is None:
            return None

        return {
            "session_id": row[0],
            "basket": json.loads(row[1]),
            "metadata": json.loads(row[2]),
        }

    def append_message(self, session_id: str, role: str, content: str) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "INSERT INTO messages (session_id, role, content) VALUES (%s, %s, %s)",
                    (session_id, role, content),
                )
                connection.commit()

    def append_turn(
        self,
        session_id: str,
        user_message: str,
        intent: str,
        response_text: str,
        safety_flags: List[str],
        latency_ms: int,
    ) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO turns (session_id, user_message, intent, response_text, safety_flags, latency_ms)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (session_id, user_message, intent, response_text, ",".join(safety_flags), latency_ms),
                )
                connection.commit()

    def list_recent_turns(self, session_id: str, limit: int = 20) -> List[Dict[str, Any]]:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT user_message, intent, response_text, safety_flags, latency_ms, created_at
                    FROM turns
                    WHERE session_id = %s
                    ORDER BY id DESC
                    LIMIT %s
                    """,
                    (session_id, limit),
                )
                rows = cursor.fetchall()

        return [
            {
                "user_message": row[0],
                "intent": row[1],
                "response_text": row[2],
                "safety_flags": row[3],
                "latency_ms": row[4],
                "created_at": row[5],
            }
            for row in rows
        ]

    def list_recent_sessions(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Return recent session summaries for dashboards and review screens."""

        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT session_id, basket_json, metadata_json, updated_at
                    FROM sessions
                    ORDER BY updated_at DESC
                    LIMIT %s
                    """,
                    (limit,),
                )
                rows = cursor.fetchall()

        return [
            {
                "session_id": row[0],
                "basket": json.loads(row[1]),
                "metadata": json.loads(row[2]),
                "updated_at": row[3],
            }
            for row in rows
        ]


class SessionStore:
    """Factory that chooses SQLite or Postgres based on the environment."""

    def __new__(cls, *args: Any, **kwargs: Any):
        if os.getenv("DATABASE_URL"):
            return PostgresSessionStore(*args, **kwargs)
        return SQLiteSessionStore(*args, **kwargs)
