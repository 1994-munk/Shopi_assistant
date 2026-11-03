"""Monitoring and telemetry for Shopi.

This module is intentionally small but meaningful: it captures the structured data
needed to evaluate customer-facing AI quality in production.

A real production system would likely send events to OpenTelemetry or a hosted
analytics stack, but this version stays local and readable so the architecture is
obvious to a human reviewer.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any, Dict, List


@dataclass
class TurnMetric:
    session_id: str
    user_message: str
    intent: str
    response_text: str
    safety_flags: List[str]
    latency_ms: int


class TelemetryLogger:
    """A lightweight telemetry sink that records turn-level metrics."""

    def __init__(self) -> None:
        self.events: List[TurnMetric] = []

    def record_turn(self, **kwargs: Any) -> TurnMetric:
        """Record a single interaction so it can be inspected later."""

        event = TurnMetric(**kwargs)
        self.events.append(event)
        return event

    def get_recent_events(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Return sanitized recent events for dashboards or debugging."""

        return [asdict(event) for event in self.events[-limit:]]
