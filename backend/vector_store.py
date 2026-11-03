"""Search and retrieval adapter for the next production layer.

This file is intentionally designed as a migration point: the system now has a clear
retrieval boundary, but the actual implementation is still easy to swap out.

Production path:
- start with in-memory lexical ranking
- move to a vector DB like Qdrant or pgvector
- keep the interface stable so the orchestrator does not need to change much
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Sequence

try:
    from qdrant_client import QdrantClient
except ImportError:  # pragma: no cover - optional dependency at runtime
    QdrantClient = None  # type: ignore[assignment]


class VectorStoreAdapter:
    """Retrieval adapter with a stable interface and a real Qdrant-ready path."""

    def __init__(self, catalog: Sequence[Dict[str, Any]]) -> None:
        self.catalog = list(catalog)
        self.backend = os.getenv("VECTOR_BACKEND", "in_memory").lower()
        self.qdrant_url = os.getenv("QDRANT_URL", "")
        self.qdrant_collection = os.getenv("QDRANT_COLLECTION", "shopi-products")
        self.qdrant_client = None

        if self.backend == "qdrant" and QdrantClient is not None and self.qdrant_url:
            try:
                self.qdrant_client = QdrantClient(
                    url=self.qdrant_url,
                    api_key=os.getenv("QDRANT_API_KEY", ""),
                )
                self._ensure_collection()
                self._sync_catalog()
            except Exception:  # pragma: no cover - runtime connection is optional
                self.qdrant_client = None

    def _normalize(self, value: str) -> str:
        return " ".join(value.lower().strip().split())

    def _tokenize(self, value: str) -> List[str]:
        return [token for token in self._normalize(value).split() if token]

    def _embedding_for_text(self, text: str) -> List[float]:
        """Create a deterministic vector representation for Qdrant indexing.

        This is intentionally simple and stable: it does not require an external embedding
        model for local validation, but it gives the system a real vector search path once
        Qdrant is configured.
        """

        tokens = self._tokenize(text)
        if not tokens:
            return [0.0] * 8

        ordered = sorted(set(tokens))
        vector = [0.0] * 8
        for index, token in enumerate(ordered[:8]):
            vector[index] = float(sum(1 for candidate in tokens if candidate == token))
        return vector

    def _score_product(self, product: Dict[str, Any], query: str) -> float:
        """A simple lexical scoring function that remains easy to audit."""

        normalized = self._normalize(query)
        if not normalized:
            return 0.0

        haystack = " ".join(
            [
                str(product.get("name", "")),
                str(product.get("description", "")),
                str(product.get("category", "")),
                " ".join(product.get("tags", [])),
            ]
        ).lower()

        score = 0.0
        if normalized in haystack:
            score += 4.0

        for token in normalized.split():
            if token in haystack:
                score += 2.0

        if product.get("category") and product["category"] in normalized:
            score += 3.0

        if product.get("in_stock"):
            score += 1.0

        return score

    def _lexical_search(self, query: str, limit: int = 6) -> List[Dict[str, Any]]:
        """Use in-memory ranking as the default fallback implementation."""

        normalized = self._normalize(query)
        if not normalized:
            return []

        scored: List[tuple[float, Dict[str, Any]]] = []
        for product in self.catalog:
            score = self._score_product(product, normalized)
            if score > 0:
                scored.append((score, product))

        scored.sort(key=lambda item: item[0], reverse=True)
        return [product for _, product in scored[:limit]]

    def _ensure_collection(self) -> None:
        """Create the collection if a Qdrant-backed deployment is configured."""

        if self.qdrant_client is None:
            return

        try:
            self.qdrant_client.get_collection(collection_name=self.qdrant_collection)
        except Exception:
            try:
                self.qdrant_client.create_collection(
                    collection_name=self.qdrant_collection,
                    vectors_config={"size": 8, "distance": "cosine"},
                )
            except Exception:
                pass

    def _sync_catalog(self) -> None:
        """Upsert the local catalog into Qdrant when a real collection is configured."""

        if self.qdrant_client is None:
            return

        try:
            points = [
                {
                    "id": product["id"],
                    "vector": self._embedding_for_text(
                        " ".join(
                            [
                                str(product.get("name", "")),
                                str(product.get("description", "")),
                                str(product.get("category", "")),
                                " ".join(product.get("tags", [])),
                            ]
                        )
                    ),
                    "payload": product,
                }
                for product in self.catalog
            ]
            self.qdrant_client.upsert(
                collection_name=self.qdrant_collection,
                points=points,
            )
        except Exception:  # pragma: no cover - defer to lexical fallback when Qdrant cannot be reached
            pass

    def _qdrant_search(self, query: str, limit: int = 6) -> List[Dict[str, Any]]:
        """Query Qdrant when enabled and available; otherwise return an empty list."""

        if self.qdrant_client is None:
            return []

        try:
            results = self.qdrant_client.search(
                collection_name=self.qdrant_collection,
                query_vector=self._embedding_for_text(query),
                limit=limit,
                with_payload=True,
            )

            hits = results if isinstance(results, list) else getattr(results, "points", [])
            return [
                payload
                for hit in hits
                if isinstance((payload := getattr(hit, "payload", None) or {}), dict)
            ]
        except Exception:
            return []

    def search(self, query: str, limit: int = 6) -> List[Dict[str, Any]]:
        """Return ranked product matches using the active retrieval backend."""

        if self.backend == "qdrant":
            qdrant_hits = self._qdrant_search(query, limit=limit)
            if qdrant_hits:
                return qdrant_hits

        return self._lexical_search(query, limit=limit)

    def status(self) -> Dict[str, str]:
        """Return the configured backend so the runtime remains easy to inspect."""

        return {
            "backend": self.backend,
            "qdrant_url": self.qdrant_url,
            "collection": self.qdrant_collection,
            "qdrant_connected": "true" if self.qdrant_client is not None else "false",
        }
