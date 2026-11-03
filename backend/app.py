"""Shopi backend scaffold for a production-minded AI commerce platform.

This file is intentionally easy for a human to read. It demonstrates the next step
from a demo chatbot toward a real LLM platform:
- the app exposes a clean API
- orchestration is delegated to a dedicated service layer
- retrieval logic is separated from the API surface
- session state is stored in SQLite rather than in-process memory
- telemetry and evaluation hooks are explicit and inspectable

The code is still intentionally lightweight, but it follows the architecture of a
larger system without hiding too much behind framework magic.
"""

from __future__ import annotations

from typing import Any, Dict, List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from evaluator import EvaluationRunner
from orchestrator import ShoppingOrchestrator
from retrieval import CatalogRetriever
from storage import SessionStore

# ---------------------------------------------------------------------------
# Application metadata
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Shopi LLM Platform API",
    description="API scaffold for a production-grade shopping assistant with retrieval, state, telemetry, and evaluation.",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Catalog data
# ---------------------------------------------------------------------------
# This is still intentionally small and readable. In production, the catalog would
# come from a database or vector search index, but this keeps the app easy to reason
# about during architecture review.
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
    {
        "id": "eggs",
        "name": "Free-Range Eggs",
        "category": "dairy",
        "price_cents": 430,
        "description": "Farm-fresh eggs for breakfasts and baking.",
        "tags": ["vegetarian"],
        "in_stock": True,
    },
]

# ---------------------------------------------------------------------------
# Shared request / response models
# ---------------------------------------------------------------------------


class BasketItem(BaseModel):
    """A simple basket row used by the frontend and the API."""

    product_id: str
    quantity: int = Field(default=1, ge=1)


class ChatRequest(BaseModel):
    """Incoming request from the front end or another API consumer."""

    session_id: str
    user_message: str = Field(..., min_length=1)
    basket: List[BasketItem] = Field(default_factory=list)
    context: Dict[str, Any] = Field(default_factory=dict)


class ProductResult(BaseModel):
    """A product record returned to the UI or downstream orchestration layer."""

    id: str
    name: str
    category: str
    price_cents: int
    description: str
    tags: List[str]
    in_stock: bool


class ChatResponse(BaseModel):
    """The canonical response contract for an assistant turn."""

    session_id: str
    intent: str
    response_text: str
    basket: List[BasketItem]
    matches: List[ProductResult] = Field(default_factory=list)
    safety_flags: List[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Runtime services
# ---------------------------------------------------------------------------
# These services are simple enough to understand, but they mirror the architecture of
# a real platform: retrieval, durable stores, and orchestration are separated.

session_store = SessionStore(db_path="shopi.db")
retriever = CatalogRetriever(CATALOG)
orchestrator = ShoppingOrchestrator(
    catalog=CATALOG,
    retriever=retriever,
    session_store=session_store,
)
evaluator = EvaluationRunner(orchestrator)


# ---------------------------------------------------------------------------
# API endpoints
# ---------------------------------------------------------------------------


@app.get("/health")
def health() -> Dict[str, str]:
    """A lightweight readiness check for deployment and infrastructure monitoring."""

    return {"status": "ok", "service": "shopi-backend"}


@app.get("/products")
def list_products() -> List[ProductResult]:
    """Return the current product catalog to the frontend or downstream tooling."""

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
    """Process a user message through the orchestrator and return a structured reply."""

    if not request.user_message.strip():
        raise HTTPException(status_code=400, detail="The user message cannot be empty.")

    result = orchestrator.handle_turn(
        session_id=request.session_id,
        user_message=request.user_message,
        basket=[item.model_dump() for item in request.basket],
        context=request.context,
    )

    return ChatResponse(
        session_id=result["session_id"],
        intent=result["intent"],
        response_text=result["response_text"],
        basket=[BasketItem(**item) for item in result["basket"]],
        matches=[
            ProductResult(
                id=match["id"],
                name=match["name"],
                category=match["category"],
                price_cents=match["price_cents"],
                description=match["description"],
                tags=match.get("tags", []),
                in_stock=match.get("in_stock", True),
            )
            for match in result["matches"]
        ],
        safety_flags=result["safety_flags"],
    )


@app.get("/sessions/{session_id}")
def get_session(session_id: str) -> Dict[str, Any]:
    """Expose the persisted session state for debugging and review."""

    session = session_store.load_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found.")

    return {
        "session": session,
        "recent_turns": session_store.list_recent_turns(session_id, limit=20),
    }


@app.get("/eval")
def run_eval() -> Dict[str, Any]:
    """Run a minimal evaluation sweep and return pass/fail metrics."""

    return evaluator.run()
