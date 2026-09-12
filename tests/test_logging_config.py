from __future__ import annotations

import io
import json
import logging

from app.infrastructure.logging_config import JsonFormatter, RequestContextLogFilter, configure_logging
from app.settings import GatewaySettings


def test_request_context_filter_copies_contextvars():
    from app.infrastructure.request_context import bind, reset

    record = logging.LogRecord("realmm.test", logging.INFO, __file__, 1, "hi", (), None)
    tokens = bind("req_filter", "id_filter")
    try:
        assert RequestContextLogFilter().filter(record) is True
        assert record.request_id == "req_filter"
        assert record.identity_id == "id_filter"
    finally:
        reset(tokens)


def test_json_formatter_emits_base_fields():
    record = logging.LogRecord("realmm.test", logging.INFO, __file__, 12, "hello %s", ("world",), None)
    payload = json.loads(JsonFormatter().format(record))
    assert payload["level"] == "INFO"
    assert payload["logger"] == "realmm.test"
    assert payload["message"] == "hello world"
    assert "ts" in payload
    assert "request_id" not in payload
    assert "identity_id" not in payload
    assert "event" not in payload


def test_json_formatter_emits_optional_fields_when_present():
    record = logging.LogRecord("realmm.test", logging.WARNING, __file__, 22, "blocked", (), None)
    record.request_id = "req_123"
    record.identity_id = "agent_1"
    record.event = "policy_block"
    payload = json.loads(JsonFormatter().format(record))
    assert payload["request_id"] == "req_123"
    assert payload["identity_id"] == "agent_1"
    assert payload["event"] == "policy_block"


def test_configure_logging_injects_request_context(monkeypatch):
    monkeypatch.setenv("STRUCTURED_LOGS", "1")
    settings = GatewaySettings()
    root = logging.getLogger()
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setLevel(logging.INFO)
    original_handlers = list(root.handlers)
    original_filters = list(root.filters)
    original_level = root.level
    try:
        root.handlers = [handler]
        root.filters = []
        root.setLevel(logging.INFO)
        configure_logging(settings)
        from app.infrastructure.request_context import bind, reset

        tokens = bind("req_context_1", "agent_ctx")
        try:
            logging.getLogger("realmm.test").error("correlated")
        finally:
            reset(tokens)
        lines = [line for line in stream.getvalue().splitlines() if line.strip()]
        payload = json.loads(lines[-1])
        assert payload["request_id"] == "req_context_1"
        assert payload["identity_id"] == "agent_ctx"
        assert payload["message"] == "correlated"
    finally:
        root.handlers = original_handlers
        root.filters = original_filters
        root.setLevel(original_level)


def test_configure_logging_noop_when_structured_logs_disabled(monkeypatch):
    monkeypatch.delenv("STRUCTURED_LOGS", raising=False)
    settings = GatewaySettings()
    root = logging.getLogger()
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    plain = logging.Formatter("%(levelname)s %(message)s")
    handler.setFormatter(plain)
    original_handlers = list(root.handlers)
    try:
        root.handlers = [handler]
        configure_logging(settings)
        assert handler.formatter is plain
    finally:
        root.handlers = original_handlers


def test_configure_logging_sets_json_formatter_when_enabled(monkeypatch):
    monkeypatch.setenv("STRUCTURED_LOGS", "1")
    settings = GatewaySettings()
    root = logging.getLogger()
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(logging.Formatter("%(message)s"))
    original_handlers = list(root.handlers)
    try:
        root.handlers = [handler]
        configure_logging(settings)
        assert isinstance(handler.formatter, JsonFormatter)
    finally:
        root.handlers = original_handlers
