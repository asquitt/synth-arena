"""Tests for syntharena.webhooks module."""

import json

import pytest

from syntharena.webhooks import (
    WebhookEvent,
    WebhookConfig,
    WebhookReceiver,
    sign_payload,
    create_event,
    serialize_event,
)


class TestWebhookReceiver:
    def test_parse_valid_event(self) -> None:
        receiver = WebhookReceiver()
        payload = json.dumps({
            "id": "evt-1",
            "event": "evaluation.completed",
            "timestamp": "2026-01-01T00:00:00Z",
            "data": {"runId": "run-1"},
        })
        event = receiver.parse_event(payload)

        assert event.id == "evt-1"
        assert event.event == "evaluation.completed"
        assert event.data["runId"] == "run-1"

    def test_parse_bytes_payload(self) -> None:
        receiver = WebhookReceiver()
        payload = json.dumps({
            "event": "evaluation.started",
            "data": {},
        }).encode("utf-8")
        event = receiver.parse_event(payload)
        assert event.event == "evaluation.started"

    def test_parse_invalid_json(self) -> None:
        receiver = WebhookReceiver()
        with pytest.raises(ValueError, match="Invalid JSON"):
            receiver.parse_event("not json")

    def test_parse_missing_event(self) -> None:
        receiver = WebhookReceiver()
        with pytest.raises(ValueError, match="Missing 'event'"):
            receiver.parse_event('{"data": {}}')

    def test_verify_signature_valid(self) -> None:
        secret = "whsec_test123"
        receiver = WebhookReceiver(secret=secret)
        payload = '{"event": "evaluation.completed"}'
        signature = sign_payload(payload, secret)

        assert receiver.verify_signature(payload, signature) is True

    def test_verify_signature_invalid(self) -> None:
        receiver = WebhookReceiver(secret="whsec_test123")
        payload = '{"event": "evaluation.completed"}'

        assert receiver.verify_signature(payload, "sha256=invalid") is False

    def test_verify_signature_no_secret(self) -> None:
        receiver = WebhookReceiver()
        # Without a secret, all signatures are valid
        assert receiver.verify_signature("any payload", "any signature") is True

    def test_verify_and_parse_with_secret(self) -> None:
        secret = "whsec_abc"
        receiver = WebhookReceiver(secret=secret)
        payload = json.dumps({
            "event": "evaluation.completed",
            "data": {"runId": "r1"},
        })
        sig = sign_payload(payload, secret)

        event = receiver.verify_and_parse(payload, sig)
        assert event.event == "evaluation.completed"

    def test_verify_and_parse_missing_signature(self) -> None:
        receiver = WebhookReceiver(secret="whsec_abc")
        with pytest.raises(ValueError, match="Missing signature"):
            receiver.verify_and_parse('{"event": "test"}')

    def test_verify_and_parse_bad_signature(self) -> None:
        receiver = WebhookReceiver(secret="whsec_abc")
        with pytest.raises(ValueError, match="Invalid webhook signature"):
            receiver.verify_and_parse('{"event": "test"}', "sha256=bad")


class TestDispatch:
    def test_event_specific_handler(self) -> None:
        receiver = WebhookReceiver()
        events_received: list[str] = []

        receiver.on("evaluation.completed", lambda e: events_received.append(e.event))

        event = WebhookEvent(
            id="evt-1",
            event="evaluation.completed",
            timestamp="",
            data={},
        )
        count = receiver.dispatch(event)

        assert count == 1
        assert events_received == ["evaluation.completed"]

    def test_global_handler(self) -> None:
        receiver = WebhookReceiver()
        events_received: list[str] = []

        receiver.on_any(lambda e: events_received.append(e.event))

        for event_type in ["evaluation.started", "evaluation.completed"]:
            event = WebhookEvent(id="e", event=event_type, timestamp="", data={})
            receiver.dispatch(event)

        assert len(events_received) == 2

    def test_no_matching_handlers(self) -> None:
        receiver = WebhookReceiver()
        receiver.on("evaluation.completed", lambda e: None)

        event = WebhookEvent(id="e", event="evaluation.started", timestamp="", data={})
        count = receiver.dispatch(event)
        assert count == 0

    def test_multiple_handlers(self) -> None:
        receiver = WebhookReceiver()
        call_count = 0

        def handler(e: WebhookEvent) -> None:
            nonlocal call_count
            call_count += 1

        receiver.on("evaluation.completed", handler)
        receiver.on("evaluation.completed", handler)
        receiver.on_any(handler)

        event = WebhookEvent(id="e", event="evaluation.completed", timestamp="", data={})
        count = receiver.dispatch(event)

        assert count == 3
        assert call_count == 3


class TestSignPayload:
    def test_consistent_signatures(self) -> None:
        payload = '{"test": true}'
        sig1 = sign_payload(payload, "secret")
        sig2 = sign_payload(payload, "secret")
        assert sig1 == sig2

    def test_different_secrets(self) -> None:
        payload = '{"test": true}'
        sig1 = sign_payload(payload, "secret1")
        sig2 = sign_payload(payload, "secret2")
        assert sig1 != sig2

    def test_signature_format(self) -> None:
        sig = sign_payload("test", "secret")
        assert sig.startswith("sha256=")

    def test_bytes_payload(self) -> None:
        sig_str = sign_payload("test", "secret")
        sig_bytes = sign_payload(b"test", "secret")
        assert sig_str == sig_bytes


class TestCreateEvent:
    def test_creates_event(self) -> None:
        event = create_event("evaluation.completed", {"runId": "r1"})
        assert event.event == "evaluation.completed"
        assert event.data["runId"] == "r1"
        assert event.id  # auto-generated
        assert event.timestamp  # auto-generated

    def test_custom_id(self) -> None:
        event = create_event("evaluation.started", {}, event_id="custom-id")
        assert event.id == "custom-id"


class TestSerializeEvent:
    def test_roundtrip(self) -> None:
        event = create_event("evaluation.completed", {"runId": "r1"}, event_id="evt-1")
        serialized = serialize_event(event)
        parsed = json.loads(serialized)

        assert parsed["id"] == "evt-1"
        assert parsed["event"] == "evaluation.completed"
        assert parsed["data"]["runId"] == "r1"
