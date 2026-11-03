"""Simple personalization layer for ranking and recommendation decisions.

This intentionally stays lightweight and explainable. The goal is to reward products
that align with a shopper's dietary preferences, category habits, and active basket,
without making the whole stack dependent on a heavy model at this phase.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional


def score_for_user(
    product: Dict[str, Any],
    query: str,
    user_profile: Optional[Dict[str, Any]] = None,
    cart: Optional[List[Dict[str, Any]]] = None,
) -> float:
    """Return an additive score that biases ranking toward a shopper's preferences."""

    profile = user_profile or {}
    preferences = profile.get("preferences", {})
    favorite_categories = set(preferences.get("favorite_categories", []))
    dietary_preferences = set(preferences.get("dietary_preferences", []))
    query_tokens = {token.lower() for token in query.replace("-", " ").split() if token}

    bonus = 0.0
    product_tags = {tag.lower() for tag in product.get("tags", [])}
    product_category = str(product.get("category", "")).lower()

    if product_category in {category.lower() for category in favorite_categories}:
        bonus += 3.0

    if product_tags.intersection({tag.lower() for tag in dietary_preferences}):
        bonus += 2.5

    if cart:
        cart_categories = {
            str(item.get("category", "")).lower()
            for item in cart
            if isinstance(item, dict) and item.get("category")
        }
        if product_category in cart_categories:
            bonus += 1.5

    if query_tokens:
        query_has_tag = bool(product_tags.intersection(query_tokens))
        query_has_category = product_category in query_tokens
        if query_has_tag:
            bonus += 2.0
        if query_has_category:
            bonus += 2.0

    return bonus
