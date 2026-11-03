"""Durable session storage for Shopi.

This module models the next production step beyond in-memory session state.
It uses SQLite because it is simple, portable, and easy to reason about while the
system grows into a hosted product.

The design is intentionally explicit:
- sessions table stores the latest basket and metadata
- messages table keeps a readable history for later audits and debugging
- turns table records interaction-level events for monitoring and evaluation

This file should be replaced later by Postgres or a managed session store when the
project reaches real customer traffic, but the structure stays easy to understand.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional


class SessionStore:
    """SQLite-backed storage for sessions, prompts, and turn telemetry."""

    def __init__(self, db_path: str = "shopi.db") -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize_database()

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

        basket_json = __import__("json").dumps(basket)
        metadata_json = __import__("json").dumps(metadata)

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
                (session_id, basket_json, metadata_json),
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
            "basket": __import__("json").loads(row["basket_json"]),
            "metadata": __import__("json").loads(row["metadata_json"]),
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
