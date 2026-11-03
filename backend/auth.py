"""User accounts, preference profiles, and per-user cart persistence.

This is intentionally simple and readable: it stores a user profile and basket in a
small JSON document for local or hosted environments. The shape is compatible with a
later move to a real database-backed auth provider or customer table.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional


class UserStore:
    """Persist simple profile and cart state keyed by user ID."""

    def __init__(self, storage_path: str = "shopi_users.json") -> None:
        self.storage_path = Path(storage_path)
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.storage_path.exists():
            self.storage_path.write_text("{}", encoding="utf-8")

    def _read(self) -> Dict[str, Any]:
        try:
            data = json.loads(self.storage_path.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except json.JSONDecodeError:
            return {}

    def _write(self, data: Dict[str, Any]) -> None:
        self.storage_path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def ensure_user(self, user_id: str, email: Optional[str] = None) -> Dict[str, Any]:
        users = self._read()
        user = users.get(user_id, {})
        user.update({
            "user_id": user_id,
            "email": email or user.get("email"),
            "preferences": {
                "favorite_categories": user.get("preferences", {}).get("favorite_categories", []),
                "dietary_preferences": user.get("preferences", {}).get("dietary_preferences", []),
            },
            "cart": user.get("cart", []),
        })
        users[user_id] = user
        self._write(users)
        return user

    def upsert_preferences(self, user_id: str, preferences: Dict[str, Any]) -> Dict[str, Any]:
        users = self._read()
        user = self.ensure_user(user_id)
        current = user.get("preferences", {})
        merged = {
            "favorite_categories": list(preferences.get("favorite_categories", current.get("favorite_categories", []))),
            "dietary_preferences": list(preferences.get("dietary_preferences", current.get("dietary_preferences", []))),
        }
        user["preferences"] = merged
        users[user_id] = user
        self._write(users)
        return user

    def set_cart(self, user_id: str, basket: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        users = self._read()
        user = self.ensure_user(user_id)
        user["cart"] = basket
        users[user_id] = user
        self._write(users)
        return basket

    def get_cart(self, user_id: str) -> List[Dict[str, Any]]:
        user = self.ensure_user(user_id)
        return list(user.get("cart", []))

    def get_user(self, user_id: str) -> Dict[str, Any]:
        users = self._read()
        user = users.get(user_id)
        if user is None:
            return self.ensure_user(user_id)
        return user
