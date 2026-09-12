from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from app.infrastructure.request_context import get_identity_id, get_request_id
from app.settings import GatewaySettings


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        request_id = getattr(record, "request_id", None)
        if request_id:
            payload["request_id"] = request_id
        identity_id = getattr(record, "identity_id", None)
        if identity_id:
            payload["identity_id"] = identity_id
        event = getattr(record, "event", None)
        if event:
            payload["event"] = event
        return json.dumps(payload, ensure_ascii=True)


class RequestContextLogFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if not getattr(record, "request_id", None):
            record.request_id = get_request_id()
        if not getattr(record, "identity_id", None):
            record.identity_id = get_identity_id()
        return True


def configure_logging(settings: GatewaySettings) -> None:
    if not settings.structured_logs_on():
        return
    root = logging.getLogger()
    formatter = JsonFormatter()
    context_filter = RequestContextLogFilter()
    for handler in root.handlers:
        handler.setFormatter(formatter)
        if not any(isinstance(item, RequestContextLogFilter) for item in handler.filters):
            handler.addFilter(context_filter)
    if not any(isinstance(item, RequestContextLogFilter) for item in root.filters):
        root.addFilter(context_filter)
