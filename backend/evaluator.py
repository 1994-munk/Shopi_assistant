"""Evaluation framework for Shopi.

This file creates a simple but realistic quality loop for a customer-facing assistant.
It is intentionally small and readable, but it follows the same pattern used by
production eval systems:

- define golden prompts
- run them through the orchestration layer
- compare behaviour to expected outcomes
- report aggregate quality metrics

This is not a replacement for a full evaluation platform, but it gives the project a
clear path to deeper model and product quality monitoring.
"""

from __future__ import annotations

from typing import Any, Dict, List, Tuple

from orchestrator import ShoppingOrchestrator


class EvaluationRunner:
    """Run product-focused checks against the orchestrator."""

    def __init__(self, orchestrator: ShoppingOrchestrator) -> None:
        self.orchestrator = orchestrator

    def _golden_cases(self) -> List[Tuple[str, str, List[str]]]:
        """Return a minimal test set that covers the most important user flows."""

        return [
            ("show vegan snacks under $5", "search_products", ["vegan", "snack"]),
            ("add two avocados", "add_to_basket", ["avocado"]),
            ("what is in my basket", "show_basket", []),
            ("checkout", "checkout", []),
        ]

    def run(self) -> Dict[str, Any]:
        """Execute a simple evaluation pass and summarize the result."""

        passed = 0
        total = 0
        details: List[Dict[str, Any]] = []

        for user_message, expected_intent, expected_tokens in self._golden_cases():
            total += 1
            result = self.orchestrator.handle_turn(
                session_id=f"eval-{total}",
                user_message=user_message,
                basket=[],
                context={"source": "eval"},
            )

            matched = result["intent"] == expected_intent
            token_hits = sum(1 for token in expected_tokens if token.lower() in result["response_text"].lower())
            result_passed = bool(matched or token_hits > 0)

            if result_passed:
                passed += 1

            details.append(
                {
                    "user_message": user_message,
                    "expected_intent": expected_intent,
                    "actual_intent": result["intent"],
                    "passed": result_passed,
                }
            )

        return {
            "total_cases": total,
            "passed_cases": passed,
            "pass_rate": round((passed / total) * 100, 2) if total else 0.0,
            "details": details,
        }
