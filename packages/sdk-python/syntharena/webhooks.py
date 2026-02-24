"""Webhook handler for async evaluation notifications."""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Literal


EventType = Literal[
    "evaluation.started",
    "evaluation.completed",
    "evaluation.failed",
    "evaluation.progress",
    "scenario.completed",
]

ALL_EVENTS: list[EventType] = [
    "evaluation.started",
    "evaluation.completed",
    "evaluation.failed",
    "evaluation.progress",
    "scenario.completed",
]


@dataclass
class WebhookEvent:
    """A webhook event payload."""
    id: str
    event: EventType
    timestamp: str
    data: dict[str, Any]


@dataclass
class WebhookConfig:
    """Configuration for a webhook endpoint."""
    url: str
    secret: str | None = None
    events: list[EventType] = field(default_factory=lambda: list(ALL_EVENTS))
    headers: dict[str, str] = field(default_factory=dict)


HandlerFn = Callable[[WebhookEvent], None]


class WebhookReceiver:
    """Receives and verifies incoming webhook events.

    Example:
        receiver = WebhookReceiver(secret="whsec_...")
        receiver.on("evaluation.completed", handle_completed)
        receiver.on("evaluation.failed", handle_failed)

        # In your web framework handler:
        event = receiver.verify_and_parse(request_body, signature_header)
    """

    def __init__(self, secret: str | None = None):
        self._secret = secret
        self._handlers: dict[EventType, list[HandlerFn]] = {}
        self._global_handlers: list[HandlerFn] = []

    def on(self, event: EventType, handler: HandlerFn) -> None:
        """Register a handler for a specific event type."""
        self._handlers.setdefault(event, []).append(handler)

    def on_any(self, handler: HandlerFn) -> None:
        """Register a handler for all event types."""
        self._global_handlers.append(handler)

    def verify_signature(self, payload: str | bytes, signature: str) -> bool:
        """Verify webhook signature using HMAC-SHA256.

        Args:
            payload: Raw request body.
            signature: Signature from X-SynthArena-Signature header.

        Returns:
            True if signature is valid.
        """
        if not self._secret:
            return True

        if isinstance(payload, str):
            payload = payload.encode("utf-8")

        expected = hmac.new(
            self._secret.encode("utf-8"),
            payload,
            hashlib.sha256,
        ).hexdigest()

        return hmac.compare_digest(f"sha256={expected}", signature)

    def parse_event(self, payload: str | bytes) -> WebhookEvent:
        """Parse a webhook payload into a WebhookEvent.

        Args:
            payload: Raw JSON request body.

        Returns:
            Parsed WebhookEvent.

        Raises:
            ValueError: If the payload is invalid.
        """
        if isinstance(payload, bytes):
            payload = payload.decode("utf-8")

        try:
            data = json.loads(payload)
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON payload: {e}") from e

        if "event" not in data:
            raise ValueError("Missing 'event' field in webhook payload")

        return WebhookEvent(
            id=data.get("id", ""),
            event=data["event"],
            timestamp=data.get("timestamp", ""),
            data=data.get("data", {}),
        )

    def verify_and_parse(self, payload: str | bytes, signature: str | None = None) -> WebhookEvent:
        """Verify signature and parse the event.

        Args:
            payload: Raw request body.
            signature: Signature header value (required if secret is set).

        Returns:
            Verified and parsed WebhookEvent.

        Raises:
            ValueError: If signature is invalid or payload cannot be parsed.
        """
        if self._secret:
            if not signature:
                raise ValueError("Missing signature header")
            if not self.verify_signature(payload, signature):
                raise ValueError("Invalid webhook signature")

        return self.parse_event(payload)

    def dispatch(self, event: WebhookEvent) -> int:
        """Dispatch an event to registered handlers.

        Args:
            event: The webhook event to dispatch.

        Returns:
            Number of handlers called.
        """
        count = 0

        for handler in self._global_handlers:
            handler(event)
            count += 1

        for handler in self._handlers.get(event.event, []):
            handler(event)
            count += 1

        return count


def sign_payload(payload: str | bytes, secret: str) -> str:
    """Generate a webhook signature for a payload.

    Args:
        payload: The payload to sign.
        secret: The webhook secret.

    Returns:
        Signature string in format "sha256=<hex>".
    """
    if isinstance(payload, str):
        payload = payload.encode("utf-8")

    digest = hmac.new(
        secret.encode("utf-8"),
        payload,
        hashlib.sha256,
    ).hexdigest()

    return f"sha256={digest}"


def create_event(
    event_type: EventType,
    data: dict[str, Any],
    event_id: str | None = None,
) -> WebhookEvent:
    """Create a webhook event.

    Args:
        event_type: Type of event.
        data: Event payload data.
        event_id: Optional event ID (auto-generated if not provided).

    Returns:
        WebhookEvent ready for serialization.
    """
    import uuid

    return WebhookEvent(
        id=event_id or str(uuid.uuid4()),
        event=event_type,
        timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        data=data,
    )


def serialize_event(event: WebhookEvent) -> str:
    """Serialize a webhook event to JSON string."""
    return json.dumps({
        "id": event.id,
        "event": event.event,
        "timestamp": event.timestamp,
        "data": event.data,
    })
