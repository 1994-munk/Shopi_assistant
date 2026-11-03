"""Graph-oriented workflow definition for a real LangGraph migration.

This module intentionally stays lightweight and explicit. It does not force the app
into a heavyweight dependency immediately, but it does define the node structure that
would be used in a production LangGraph agent graph.
"""

from __future__ import annotations

from typing import Any, Dict, List


def build_langgraph_graph() -> Dict[str, Any]:
    """Return the agent graph blueprint a real LangGraph implementation can consume."""

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


def make_graph_state(session_id: str, user_message: str, basket: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Create a state shape ready for a LangGraph node pipeline."""

    return {
        "session_id": session_id,
        "user_message": user_message,
        "basket": basket,
        "context": {},
        "intent": "",
        "safety_flags": [],
        "matches": [],
        "response_text": "",
    }
