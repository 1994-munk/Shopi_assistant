"""Graph-oriented workflow definition for a real LangGraph migration.

This file now provides both:
- a readable, human-friendly graph blueprint for review
- an actual compiled LangGraph workflow when the langgraph dependency is installed

The code intentionally avoids hard dependency failures: if the package is missing,
we simply return the JSON blueprint and keep the legacy orchestrator path working.
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, TypedDict

try:
    from langgraph.graph import END, START, StateGraph
except ImportError:  # pragma: no cover - optional dependency at runtime
    StateGraph = None
    START = END = None


class GraphState(TypedDict):
    """Typed state contract used by the LangGraph workflow."""

    session_id: str
    user_message: str
    basket: List[Dict[str, Any]]
    context: Dict[str, Any]
    intent: str
    safety_flags: List[str]
    matches: List[Dict[str, Any]]
    response_text: str


def build_langgraph_graph() -> Any:
    """Return a compiled graph when LangGraph is available, else a plain blueprint."""

    if StateGraph is None or os.getenv("USE_LANGGRAPH", "false").lower() != "true":
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

    graph = StateGraph(GraphState)

    def safety_gate(state: GraphState) -> GraphState:
        lowered = state["user_message"].lower()
        flags: List[str] = []
        if "ignore previous instructions" in lowered:
            flags.append("prompt_injection")
        if any(token in lowered for token in ["password", "cvv", "ssn", "card number"]):
            flags.append("personal_data")
        if any(token in lowered for token in ["weather", "politics", "write a poem"]):
            flags.append("off_topic")
        state["safety_flags"] = flags
        if flags:
            state["response_text"] = "I can only help with grocery shopping. Please ask for a product, basket update, or checkout flow."
            state["intent"] = "blocked"
        return state

    def intent_router(state: GraphState) -> GraphState:
        message = state["user_message"].lower()
        if "basket" in message or "what is in my basket" in message:
            state["intent"] = "show_basket"
        elif "add" in message:
            state["intent"] = "add_to_basket"
        elif "remove" in message:
            state["intent"] = "remove_from_basket"
        elif "checkout" in message:
            state["intent"] = "checkout"
        elif any(keyword in message for keyword in ["search", "find", "vegan", "milk", "snack", "bread"]):
            state["intent"] = "search_products"
        else:
            state["intent"] = "help"
        return state

    def retrieval_step(state: GraphState) -> GraphState:
        if state["safety_flags"]:
            return state

        # A real retrieval service would call Qdrant or pgvector here.
        # This keeps the workflow honest while still being easy to read.
        state["matches"] = [
            {"id": "avocado", "name": "Avocado", "category": "produce", "price_cents": 260, "description": "Creamy and rich, great in salads or toast.", "tags": ["vegan", "organic"], "in_stock": True}
        ] if "avocado" in state["user_message"].lower() else []
        return state

    def basket_update_step(state: GraphState) -> GraphState:
        if state["safety_flags"] or state["intent"] not in {"add_to_basket", "show_basket"}:
            return state

        if state["intent"] == "add_to_basket" and state["matches"]:
            state["basket"].append({"product_id": state["matches"][0]["id"], "quantity": 1})
        return state

    def llm_response_step(state: GraphState) -> GraphState:
        if state["safety_flags"]:
            state["response_text"] = state["response_text"] or "I can only help with grocery shopping."
            return state

        if state["intent"] == "add_to_basket" and state["matches"]:
            state["response_text"] = f"I added {state['matches'][0]['name']} to your basket."
        elif state["matches"]:
            state["response_text"] = f"I found {len(state['matches'])} product(s) that match your request."
        else:
            state["response_text"] = "I can help you search for products, review your basket, or check out."
        return state

    def persist_state_step(state: GraphState) -> GraphState:
        state["context"]["last_intent"] = state["intent"]
        state["context"]["last_message"] = state["user_message"]
        return state

    graph.add_node("safety_gate", safety_gate)
    graph.add_node("intent_router", intent_router)
    graph.add_node("retrieval", retrieval_step)
    graph.add_node("basket_update", basket_update_step)
    graph.add_node("llm_response", llm_response_step)
    graph.add_node("persist_state", persist_state_step)

    graph.add_edge(START, "safety_gate")
    graph.add_edge("safety_gate", "intent_router")
    graph.add_edge("intent_router", "retrieval")
    graph.add_edge("retrieval", "basket_update")
    graph.add_edge("basket_update", "llm_response")
    graph.add_edge("llm_response", "persist_state")
    graph.add_edge("persist_state", END)

    return graph.compile()


def make_graph_state(session_id: str, user_message: str, basket: List[Dict[str, Any]], context: Dict[str, Any] | None = None) -> Dict[str, Any]:
    """Create a state shape ready for a LangGraph node pipeline."""

    return {
        "session_id": session_id,
        "user_message": user_message,
        "basket": basket,
        "context": context or {},
        "intent": "",
        "safety_flags": [],
        "matches": [],
        "response_text": "",
    }
