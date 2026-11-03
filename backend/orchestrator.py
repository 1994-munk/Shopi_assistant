"""Orchestration layer for the Shopi assistant.

This file represents the next major production step: the assistant is no longer just
front-end logic. It becomes a service with clear stages:

1. safety validation
2. intent routing
3. retrieval with product ranking
4. basket and checkout tool execution
5. state persistence
6. telemetry + evaluation capture

This is intentionally designed to feel like a real agent framework, while staying
readable enough for humans to understand without a huge amount of abstraction.
"""

from __future__ import annotations

import os
import time
from typing import Any, Dict, List, Optional

from langgraph_ready import build_langgraph_graph
from llm_agent import LLMShoppingAgent
from monitoring import TelemetryLogger
from retrieval import CatalogRetriever
from storage import SessionStore
from vector_store import VectorStoreAdapter


class ShoppingOrchestrator:
    """Coordinate the Shopi shopping workflow."""

    def __init__(
        self,
        catalog: List[Dict[str, Any]],
        retriever: Optional[CatalogRetriever] = None,
        session_store: Optional[SessionStore] = None,
        telemetry: Optional[TelemetryLogger] = None,
        llm_agent: Optional[LLMShoppingAgent] = None,
        vector_store: Optional[VectorStoreAdapter] = None,
    ) -> None:
        self.catalog = catalog
        self.retriever = retriever or CatalogRetriever(catalog)
        self.session_store = session_store or SessionStore()
        self.telemetry = telemetry or TelemetryLogger()
        self.llm_agent = llm_agent or LLMShoppingAgent()
        self.vector_store = vector_store or VectorStoreAdapter(catalog)
        self.langgraph_enabled = os.getenv("USE_LANGGRAPH", "false").lower() == "true"
        self.langgraph = build_langgraph_graph() if self.langgraph_enabled else None

    def build_langgraph_state(
        self,
        session_id: str,
        user_message: str,
        basket: List[Dict[str, Any]],
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Create the shape of a graph state object that can later be passed to LangGraph."""

        return {
            "session_id": session_id,
            "user_message": user_message,
            "basket": list(basket),
            "context": context or {},
            "intent": "",
            "safety_flags": [],
            "matches": [],
            "response_text": "",
        }

    def build_graph_definition(self) -> Dict[str, Any]:
        """Return a lightweight graph blueprint; this is the preparation needed for LangGraph."""

        return {
            "graph_name": "shopi_assistant",
            "entry_point": "safety_gate",
            "nodes": [
                {"id": "safety_gate", "type": "guardrail"},
                {"id": "intent_router", "type": "classifier"},
                {"id": "retrieval", "type": "vector_retriever"},
                {"id": "basket_update", "type": "tool"},
                {"id": "llm_response", "type": "model"},
                {"id": "persist_state", "type": "memory"},
            ],
            "edges": [
                ["safety_gate", "intent_router"],
                ["intent_router", "retrieval"],
                ["retrieval", "basket_update"],
                ["basket_update", "llm_response"],
                ["llm_response", "persist_state"],
            ],
        }

    def run_safety_checks(self, message: str) -> List[str]:
        """Apply the same guardrail logic used by the product-facing demo."""

        lowered = message.lower()
        flags: List[str] = []

        if "ignore previous instructions" in lowered:
            flags.append("prompt_injection")
        if any(token in lowered for token in ["password", "cvv", "ssn", "card number"]):
            flags.append("personal_data")
        if any(token in lowered for token in ["weather", "politics", "write a poem"]):
            flags.append("off_topic")

        return flags

    def detect_intent(self, message: str) -> str:
        """Roughly classify the user request into a shopping workflow."""

        lowered = message.lower()

        if "basket" in lowered or "what is in my basket" in lowered:
            return "show_basket"
        if "add" in lowered:
            return "add_to_basket"
        if "remove" in lowered:
            return "remove_from_basket"
        if "checkout" in lowered:
            return "checkout"
        if any(keyword in lowered for keyword in ["search", "find", "vegan", "milk", "snack", "bread"]):
            return "search_products"
        return "help"

    def _update_basket(self, existing: List[Dict[str, Any]], product_id: str, quantity: int = 1) -> List[Dict[str, Any]]:
        """Update the basket in a simple, explicit way before later moving to a database-backed cart."""

        updated = list(existing)
        for item in updated:
            if item.get("product_id") == product_id:
                item["quantity"] = int(item.get("quantity", 0)) + quantity
                return updated

        updated.append({"product_id": product_id, "quantity": quantity})
        return updated

    def _response_for_intent(self, intent: str, matches: List[Dict[str, Any]], basket: List[Dict[str, Any]]) -> str:
        """Compose a shopping response in human-readable language."""

        if intent == "search_products" and matches:
            return f"I found {len(matches)} product(s) that match your request."
        if intent == "add_to_basket" and matches:
            return f"I added {matches[0]['name']} to your basket."
        if intent == "show_basket":
            return "Here is the current basket state for this shopping session."
        if intent == "checkout":
            return "Checkout is ready. In production, this would trigger the payment workflow."
        return "I can help you search, add items, review your basket, or start checkout."

    def handle_turn(
        self,
        session_id: str,
        user_message: str,
        basket: List[Dict[str, Any]],
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Execute the full orchestration pipeline for one user message."""

        started_at = time.perf_counter()

        # Build a graph-like state object so the system is ready for LangGraph adoption.
        graph_state = self.build_langgraph_state(session_id, user_message, basket, context)

        # Optional LangGraph path: if enabled, we run the graph state through a real workflow.
        if self.langgraph_enabled and self.langgraph is not None:
            graph_state = self.build_langgraph_state(session_id, user_message, basket, context)
            graph_result = self.langgraph.invoke(graph_state)
            response_text = graph_result.get("response_text") or "I can help you search for products, review your basket, or check out."
            next_basket = list(graph_result.get("basket", basket))
            response = {
                "session_id": session_id,
                "intent": graph_result.get("intent", self.detect_intent(user_message)),
                "response_text": response_text,
                "basket": next_basket,
                "matches": graph_result.get("matches", []),
                "safety_flags": graph_result.get("safety_flags", []),
                "graph_state": graph_result,
            }

            self.session_store.save_session(session_id, next_basket, {"context": context or {}, "last_intent": response["intent"], "last_message": user_message})
            self.session_store.append_message(session_id, "user", user_message)
            self.session_store.append_message(session_id, "assistant", response_text)

            latency_ms = int((time.perf_counter() - started_at) * 1000)
            self.telemetry.record_turn(
                session_id=session_id,
                user_message=user_message,
                intent=response["intent"],
                response_text=response_text,
                safety_flags=response["safety_flags"],
                latency_ms=latency_ms,
            )
            self.session_store.append_turn(
                session_id=session_id,
                user_message=user_message,
                intent=response["intent"],
                response_text=response_text,
                safety_flags=response["safety_flags"],
                latency_ms=latency_ms,
            )
            return response

        # Step 1: validate safety before the assistant takes any action.
        safety_flags = self.run_safety_checks(user_message)
        graph_state["safety_flags"] = safety_flags

        if safety_flags:
            self.session_store.append_message(session_id, "user", user_message)
            self.session_store.append_message(session_id, "assistant", "I can only help with grocery shopping requests.")
            response = {
                "session_id": session_id,
                "intent": "blocked",
                "response_text": "I can only help with grocery shopping. Please ask for a product, basket update, or checkout flow.",
                "basket": basket,
                "matches": [],
                "safety_flags": safety_flags,
            }
            self.telemetry.record_turn(
                session_id=session_id,
                user_message=user_message,
                intent="blocked",
                response_text=response["response_text"],
                safety_flags=safety_flags,
                latency_ms=int((time.perf_counter() - started_at) * 1000),
            )
            return response

        # Step 2: resolve the intent and retrieve the best product matches.
        intent = self.detect_intent(user_message)
        graph_state["intent"] = intent

        # Prefer the vector-backed adapter if it is configured, while keeping a stable interface.
        matches = self.vector_store.search(user_message, limit=6)
        if not matches:
            matches = self.retriever.search(user_message, limit=6)
        graph_state["matches"] = matches

        # Step 3: apply tool-like actions to the basket state.
        next_basket = list(basket)
        if intent == "add_to_basket" and matches:
            next_basket = self._update_basket(next_basket, matches[0]["id"], quantity=1)

        # Step 4: persist the session so the conversation remains durable across turns.
        self.session_store.save_session(
            session_id,
            next_basket,
            {
                "context": context or {},
                "last_intent": intent,
                "last_message": user_message,
            },
        )

        # Step 5: optionally use an LLM to generate the final customer-facing response.
        response_text = self.llm_agent.generate_response(user_message, matches, next_basket)
        if intent == "blocked":
            response_text = "I can only help with grocery shopping. Please ask for a product, basket update, or checkout flow."
        graph_state["response_text"] = response_text

        self.session_store.append_message(session_id, "user", user_message)
        self.session_store.append_message(session_id, "assistant", response_text)

        # Step 6: emit turn-level telemetry for monitoring and evaluation.
        latency_ms = int((time.perf_counter() - started_at) * 1000)
        self.telemetry.record_turn(
            session_id=session_id,
            user_message=user_message,
            intent=intent,
            response_text=response_text,
            safety_flags=safety_flags,
            latency_ms=latency_ms,
        )
        self.session_store.append_turn(
            session_id=session_id,
            user_message=user_message,
            intent=intent,
            response_text=response_text,
            safety_flags=safety_flags,
            latency_ms=latency_ms,
        )

        return {
            "session_id": session_id,
            "intent": intent,
            "response_text": response_text,
            "basket": next_basket,
            "matches": matches,
            "safety_flags": safety_flags,
            "graph_state": graph_state,
        }
