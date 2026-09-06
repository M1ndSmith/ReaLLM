from __future__ import annotations

import json
import re
from typing import Any

from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError as JsonSchemaDraftError
from jsonschema.exceptions import ValidationError

_MAX_FORMAT_BYTES = 32 * 1024
_NAME_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_FENCE = re.compile(r"^```(?:json)?\s*\n(.*)\n```\s*$", re.DOTALL | re.IGNORECASE)


class SchemaError(ValueError):
    """Raised when response_format is invalid or the assistant JSON does not match. HTTP 400."""

    def __init__(self, message: str, path: str | None = None):
        super().__init__(message)
        self.path = path


def normalize_response_format(payload: dict | None) -> dict | None:
    if payload is None:
        return None
    if not isinstance(payload, dict):
        raise SchemaError("response_format must be an object.")
    _assert_size(payload)
    kind = payload.get("type")
    if kind == "json_object":
        return {"type": "json_object"}
    if kind != "json_schema":
        raise SchemaError("response_format.type must be json_object or json_schema.")
    spec = payload.get("json_schema")
    if not isinstance(spec, dict):
        raise SchemaError("response_format.json_schema must be an object.")
    name = spec.get("name")
    if not isinstance(name, str) or not _NAME_RE.match(name):
        raise SchemaError("response_format.json_schema.name must be 1–64 letters, digits, '_' or '-'.")
    schema = spec.get("schema")
    if not isinstance(schema, dict):
        raise SchemaError("response_format.json_schema.schema must be an object.")
    try:
        Draft202012Validator.check_schema(schema)
    except JsonSchemaDraftError as exc:
        raise SchemaError("response_format.json_schema.schema is not a valid JSON Schema.") from exc
    out: dict[str, Any] = {
        "type": "json_schema",
        "json_schema": {"name": name, "schema": schema},
    }
    if "strict" in spec:
        if not isinstance(spec["strict"], bool):
            raise SchemaError("response_format.json_schema.strict must be a boolean.")
        out["json_schema"]["strict"] = spec["strict"]
    description = spec.get("description")
    if description is not None:
        if not isinstance(description, str):
            raise SchemaError("response_format.json_schema.description must be a string.")
        out["json_schema"]["description"] = description
    return out


def validate_output(text: str, response_format: dict | None) -> None:
    if response_format is None:
        return
    payload = _parse_json(text)
    if response_format.get("type") == "json_object":
        return
    schema = response_format["json_schema"]["schema"]
    try:
        Draft202012Validator(schema).validate(payload)
    except ValidationError as exc:
        raise SchemaError("Assistant output does not match the schema.", path=_error_path(exc)) from exc


def _assert_size(payload: dict) -> None:
    encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    if len(encoded) > _MAX_FORMAT_BYTES:
        raise SchemaError("response_format is too large.")


def _parse_json(text: str) -> object:
    cleaned = (text or "").strip()
    if not cleaned:
        raise SchemaError("Assistant output is not valid JSON.")
    fenced = _FENCE.match(cleaned)
    if fenced:
        cleaned = fenced.group(1).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise SchemaError("Assistant output is not valid JSON.") from exc


def _error_path(exc: ValidationError) -> str | None:
    parts = [str(part) for part in exc.absolute_path]
    if exc.validator == "additionalProperties":
        for name in re.findall(r"'([^']+)'", exc.message or ""):
            if name not in parts:
                parts.append(name)
    return ".".join(parts) if parts else None
