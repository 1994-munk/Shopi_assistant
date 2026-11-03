"""LLM-backed agent layer for Shopi.

This file creates the next production step: a real model integration point.
It deliberately keeps the logic readable and safe:
- if the environment is not configured, the system uses the existing deterministic logic
- if an API key is present, it calls the LLM to generate a richer response
- all failures fall back to the local heuristic path so the app still works

This is designed to be a migration layer toward LangGraph or PydanticAI without
forcing the rest of the codebase to know the details.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from config import SETTINGS

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover - optional dependency at runtime
    OpenAI = None  # type: ignore[assignment]


class LLMShoppingAgent:
    """Thin wrapper around an LLM for response generation and tool planning."""

    def __init__(self, settings: Optional[Any] = None) -> None:
        self.settings = settings or SETTINGS

    def available(self) -> bool:
        """Return whether a real model is configured and available to use."""

        return bool(self.settings.openai_api_key) and OpenAI is not None

    def build_prompt(self, user_message: str, matches: List[Dict[str, Any]], basket: List[Dict[str, Any]]) -> str:
        """Create a compact prompt that keeps the context readable and useful."""

        basket_summary = ", ".join(
            f"{item.get('product_id', 'unknown')} x {item.get('quantity', 1)}" for item in basket
        ) or "empty"

        product_summary = "\n".join(
            f"- {item.get('name', 'unknown')} ({item.get('category', 'unknown')}, ${item.get('price_cents', 0) / 100:.2f})"
            for item in matches[:5]
        ) or "No products matched."

        return (
            "You are Shopi, a grocery shopping agent. "
            "Respond clearly and helpfully to the user while staying within grocery shopping use cases.\n\n"
            f"User request: {user_message}\n"
            f"Current basket: {basket_summary}\n"
            f"Candidate products:\n{product_summary}\n\n"
            "Give a concise, natural shopping assistant reply."
        )

    def generate_response(self, user_message: str, matches: List[Dict[str, Any]], basket: List[Dict[str, Any]]) -> str:
        """Attempt LLM generation and gracefully fall back on deterministic text."""

        if not self.available():
            if matches:
                return f"I found {len(matches)} product(s) that match your request."
            return "I can help you search for products, review your basket, or check out."

        client = OpenAI(api_key=self.settings.openai_api_key, base_url=self.settings.openai_api_base or None)

        try:
            response = client.responses.create(
                model=self.settings.openai_model,
                input=[
                    {
                        "role": "system",
                        "content": "You are a helpful grocery shopping assistant. Be concise, practical, and stay within shopping tasks.",
                    },
                    {
                        "role": "user",
                        "content": self.build_prompt(user_message, matches, basket),
                    },
                ],
            )

            if hasattr(response, "output_text") and response.output_text:
                return response.output_text.strip()

            if hasattr(response, "output"):
                blocks = []
                for item in response.output:
                    if hasattr(item, "content"):
                        for part in item.content:
                            text = getattr(part, "text", None)
                            if text:
                                blocks.append(text)
                if blocks:
                    return "".join(blocks).strip()
        except Exception:  # pragma: no cover - runtime integration only
            pass

        if matches:
            return f"I found {len(matches)} product(s) that match your request."
        return "I can help you search for products, review your basket, or check out."
