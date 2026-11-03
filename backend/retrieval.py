"""Retrieval and ranking layer for Shopi.

This is the first concrete layer that moves the project toward a real LLM product.
Instead of pure substring matching, the retriever scores candidate products using a
combination of lexical overlap, price fit, dietary tags, and category relevance.

Why this matters:
- better product ranking means the assistant feels more useful
- it creates a clean place to later replace the logic with a vector DB or ranking model
- it makes the architecture easier to evolve without rewriting the whole assistant
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Sequence

from personalization import score_for_user


class CatalogRetriever:
    """Rank and filter catalog items for search, basket, and recommendation tasks."""

    def __init__(self, catalog: Sequence[Dict[str, Any]]) -> None:
        self.catalog = list(catalog)

    def _normalize(self, text: str) -> List[str]:
        """Split a query into normalized tokens for keyword matching."""

        return [token for token in re.findall(r"[a-z0-9]+", text.lower()) if token]

    def _score_product(self, query: str, product: Dict[str, Any]) -> float:
        """Score a product using an explainable, deterministic heuristic."""

        tokens = set(self._normalize(query))
        if not tokens:
            return 0.0

        haystack = " ".join(
            [
                product.get("name", ""),
                product.get("description", ""),
                product.get("category", ""),
                " ".join(product.get("tags", [])),
            ]
        ).lower()

        text_tokens = self._normalize(haystack)
        overlap = len(tokens.intersection(set(text_tokens)))

        score = 0.0
        score += overlap * 4.0

        # A category match often tells us the user is shopping for a specific aisle.
        if product.get("category") and any(token == product["category"] for token in tokens):
            score += 3.0

        # Dietary tags often matter as much as the obvious product name.
        for tag in product.get("tags", []):
            if tag in tokens:
                score += 2.0

        # Price fit matters for shopping intent; cheaper queries should rank toward lower cost.
        if "cheap" in tokens or "budget" in tokens:
            if product.get("price_cents", 0) < 500:
                score += 2.0

        # The assistant should prefer in-stock products when multiple matches exist.
        if product.get("in_stock"):
            score += 1.5

        return score

    def search(
        self,
        query: str,
        limit: int = 6,
        user_profile: Optional[Dict[str, Any]] = None,
        cart: Optional[List[Dict[str, Any]]] = None,
    ) -> List[Dict[str, Any]]:
        """Return the top matches for a shopping query with optional personalization."""

        ranked = []
        for product in self.catalog:
            base_score = self._score_product(query, product)
            personalization_bonus = score_for_user(product, query, user_profile=user_profile, cart=cart)
            total_score = base_score + personalization_bonus
            if total_score > 0:
                ranked.append((total_score, product))

        ranked.sort(key=lambda item: item[0], reverse=True)
        return [product for _, product in ranked[:limit]]

    def find_by_id(self, product_id: str) -> Dict[str, Any] | None:
        """Look up a product by ID for basket actions and checkout flows."""

        for product in self.catalog:
            if product.get("id") == product_id:
                return product
        return None
