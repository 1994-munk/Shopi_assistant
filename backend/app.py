"""Shopi backend scaffold for an LLM-ready shopping assistant.

This file is intentionally easy to read and extend. The goal is to make the project
look and feel like a real production architecture rather than a black-box frontend demo.

The structure is deliberately simple:
- the FastAPI app exposes a small set of HTTP endpoints
- safety checks and intent detection are separated into readable functions
- basket state is modeled explicitly, so it is easy to replace with a database later
- tool-like operations are represented as simple Python functions that can later
  call an LLM orchestration layer or a retrieval service

This is a scaffold, not a production model runtime. It gives humans a clear path to
understand the system and extend it with a real LLM/agent orchestrator.
"""

from __future__ import annotations

from typing import Any, Dict, List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Basic application metadata
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Shopi LLM Platform API",
    description="A readable backend scaffold for an AI shopping assistant.",
    version="0.1.0",
)

# CORS is enabled here because the frontend and backend will commonly run on different
# local ports during development. This keeps the system easy to test without disabling
# security in production environments.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Mock catalog data
# ---------------------------------------------------------------------------
# In a real implementation, this should come from a database or vector index.
# Keeping it in-memory here makes the architecture easy for humans to follow.
CATALOG: List[Dict[str, Any]] = [
    {
        "id": "avocado",
        "name": "Avocado",
        "category": "produce",
        "price_cents": 260,
        "description": "Creamy and rich, great in salads or toast.",
        "tags": ["vegan", "organic"],
        "in_stock": True,
    },
    {
        "id": "almond-milk",
        "name": "Almond Milk",
        "category": "dairy",
        "price_cents": 420,
        "description": "Unsweetened almond milk for smoothies and cereal.",
        "tags": ["vegan", "dairy-free"],
        "in_stock": True,
    },
    {
        "id": "oat-crackers",
        "name": "Oat Crackers",
        "category": "snacks",
        "price_cents": 340,
        "description": "Crunchy, lightly salted snack for quick bites.",
        "tags": ["vegetarian"],
        "in_stock": True,
    },
    {
        "id": "spinach",
        "name": "Spinach",
        "category": "produce",
        "price_cents": 210,
        "description": "Fresh greens for salads, smoothies, and sandwiches.",
        "tags": ["vegan", "organic"],
        "in_stock": True,
    },
]

# ---------------------------------------------------------------------------
# Request and response models
# ---------------------------------------------------------------------------
# FastAPI models make the API explicit and easy to reason about during review.


class BasketItem(BaseModel):
    """A single basket line item.

    We keep it intentionally simple because the frontend already has a similar shape.
    """

    product_id: str
    quantity: int = Field(default=1, ge=1)


class ChatRequest(BaseModel):
    """The user message plus the state needed to continue a shopping session."""

    session_id: str
    user_message: str = Field(..., min_length=1)
    basket: List[BasketItem] = Field(default_factory=list)
    context: Dict[str, Any] = Field(default_factory=dict)


class ProductResult(BaseModel):
    """Structured product data returned to the frontend or orchestration layer."""

    id: str
    name: str
    category: str
    price_cents: int
    description: str
    tags: List[str]
    in_stock: bool


class ChatResponse(BaseModel):
    """Minimal contract for an agent response.

    In production, this would likely include tool traces and model metadata.
    """

    session_id: str
    intent: str
    response_text: str
    basket: List[BasketItem]
    matches: List[ProductResult] = Field(default_factory=list)
    safety_flags: List[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Simple session memory for demonstration purposes
# ---------------------------------------------------------------------------
# This is not production persistence, but it mirrors how a real memory layer would
# keep conversation context and cart state alive across turns.
SESSION_STATE: Dict[str, Dict[str, Any]] = {}


# ---------------------------------------------------------------------------
# Safety and orchestrator helpers
# ---------------------------------------------------------------------------
# These functions are intentionally readable and explicit so a human can follow the
# decision flow without reading a giant abstraction layer.


def run_safety_checks(message: str) -> List[str]:
    """Perform deterministic checks before an agent acts on a user request.

    The rules here are intentionally simple but they illustrate the exact shape of a
    production guardrail layer:
    - reject suspicious prompt manipulation
    - reject personal data requests
    - reject off-topic shopping requests
    """

    flags: List[str] = []
    lowered = message.lower()

    if "ignore previous instructions" in lowered:
        flags.append("prompt_injection")

    if any(token in lowered for token in ["password", "card number", "ssn", "cvv"]):
        flags.append("personal_data")

    if any(token in lowered for token in ["weather", "politics", "write a poem"]):
        flags.append("off_topic")

    return flags


def detect_intent(message: str) -> str:
    """Map a user request to a high-level shopping intent.

    This function is intentionally small. In production, this would be handled by a
    model or a rule-based routing layer connected to real tool execution.
    """

    lowered = message.lower()

    if "basket" in lowered or "what is in my basket" in lowered:
        return "show_basket"
    if "add" in lowered:
        return "add_to_basket"
    if "remove" in lowered:
        return "remove_from_basket"
    if "checkout" in lowered:
        return "checkout"
    if "search" in lowered or "find" in lowered or any(keyword in lowered for keyword in ["vegan", "milk", "snack"]):
        return "search_products"
    return "help"


def search_products(query: str) -> List[Dict[str, Any]]:
    """Search the product catalog with a simple textual heuristic.

    In a real LLM platform, this method would call a retrieval service or vector store
    and then rank the results with a more advanced model or business logic.
    """

    lowered = query.lower()
    matches: List[Dict[str, Any]] = []

    for product in CATALOG:
        haystack = " ".join(
            [
                product["name"],
                product["description"],
                " ".join(product["tags"]),
                product["category"],
            ]
        ).lower()

        if lowered in haystack or any(word in haystack for word in lowered.split()):
            matches.append(product)

    return matches


def update_basket(existing: List[BasketItem], product_id: str, quantity: int = 1) -> List[BasketItem]:
    """Add or update a product in the basket.

    This function is intentionally simple and deterministic so it is easy to test and
    replace with a database-backed cart service later.
    """

    updated = list(existing)
    for item in updated:
        if item.product_id == product_id:
            item.quantity += quantity
            return updated

    updated.append(BasketItem(product_id=product_id, quantity=quantity))
    return updated


# ---------------------------------------------------------------------------
# API endpoints
# ---------------------------------------------------------------------------


@app.get("/health")
def health() -> Dict[str, str]:
    """A lightweight readiness check for infrastructure and deployment health checks."""

    return {"status": "ok", "service": "shopi-backend"}


@app.get("/products")
def list_products() -> List[ProductResult]:
    """Return the product catalog to the frontend or orchestration layer.

    In production, this would usually be paginated and filtered by search or ranking
    results rather than returning the full catalog on every request.
    """

    return [
        ProductResult(
            id=product["id"],
            name=product["name"],
            category=product["category"],
            price_cents=product["price_cents"],
            description=product["description"],
            tags=product["tags"],
            in_stock=product["in_stock"],
        )
        for product in CATALOG
    ]


@app.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest) -> ChatResponse:
    """Main orchestration endpoint for a shopping conversation turn.

    This is the key entry point for turning a raw user message into a structured,
    observable AI workflow. The code reads cleanly because each step is separated:
    1. evaluate safety
    2. detect intent
    3. fetch search results
    4. update state
    5. return a structured response
    """

    if not request.user_message.strip():
        raise HTTPException(status_code=400, detail="The user message cannot be empty.")

    # Step 1: run the deterministic safety layer first.
    safety_flags = run_safety_checks(request.user_message)
    if safety_flags:
        return ChatResponse(
            session_id=request.session_id,
            intent="blocked",
            response_text="I can only help with grocery shopping. Please ask for a product, basket update, or checkout flow.",
            basket=request.basket,
            safety_flags=safety_flags,
        )

    # Step 2: determine the shopping task.
    intent = detect_intent(request.user_message)

    # Step 3: fetch matching products from the catalog.
    # In production you would call a retrieval service here instead of simple in-memory
    # matching. The important thing is that this layer stays easy to replace.
    matches = search_products(request.user_message)

    # Step 4: update the basket when the user asks to add an item.
    next_basket = list(request.basket)
    if intent == "add_to_basket":
        for product in matches[:1]:
            next_basket = update_basket(next_basket, product["id"], quantity=1)

    # Step 5: persist the state in memory for a simple session store.
    SESSION_STATE[request.session_id] = {
        "basket": [item.model_dump() for item in next_basket],
        "last_intent": intent,
        "last_message": request.user_message,
    }

    # Step 6: generate a readable response.
    if intent == "search_products" and matches:
        response_text = f"I found {len(matches)} product(s) that match your request."
    elif intent == "add_to_basket" and matches:
        response_text = f"I added {matches[0]['name']} to your basket."
    elif intent == "show_basket":
        response_text = "Here is the current basket state for this shopping session."
    elif intent == "checkout":
        response_text = "Checkout is ready. In production, this would trigger the payment workflow."
    else:
        response_text = "I can help you search, add items, review your basket, or start checkout."

    return ChatResponse(
        session_id=request.session_id,
        intent=intent,
        response_text=response_text,
        basket=next_basket,
        matches=[
            ProductResult(
                id=product["id"],
                name=product["name"],
                category=product["category"],
                price_cents=product["price_cents"],
                description=product["description"],
                tags=product["tags"],
                in_stock=product["in_stock"],
            )
            for product in matches
        ],
        safety_flags=safety_flags,
    )
