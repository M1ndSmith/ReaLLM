from __future__ import annotations

import pytest

from app.structured import SchemaError, normalize_response_format, validate_output

REVIEW = {
    "type": "json_schema",
    "json_schema": {
        "name": "product_review",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "product_name": {"type": "string"},
                "rating": {"type": "number"},
            },
            "required": ["product_name", "rating"],
            "additionalProperties": False,
        },
    },
}


def test_normalize_none_and_json_object():
    assert normalize_response_format(None) is None
    assert normalize_response_format({"type": "json_object", "extra": 1}) == {"type": "json_object"}


def test_normalize_json_schema():
    out = normalize_response_format({**REVIEW, "json_schema": {**REVIEW["json_schema"], "description": "review"}})
    assert out["type"] == "json_schema"
    assert out["json_schema"]["name"] == "product_review"
    assert out["json_schema"]["strict"] is True
    assert out["json_schema"]["description"] == "review"
    assert out["json_schema"]["schema"]["required"] == ["product_name", "rating"]


def test_normalize_rejects_bad_payloads():
    with pytest.raises(SchemaError, match="object"):
        normalize_response_format(["json_object"])  # type: ignore[arg-type]
    with pytest.raises(SchemaError, match="json_object or json_schema"):
        normalize_response_format({"type": "xml"})
    with pytest.raises(SchemaError, match="json_schema must be an object"):
        normalize_response_format({"type": "json_schema", "json_schema": "nope"})
    with pytest.raises(SchemaError, match="name"):
        normalize_response_format({"type": "json_schema", "json_schema": {"name": "bad name", "schema": {}}})
    with pytest.raises(SchemaError, match="schema must be an object"):
        normalize_response_format({"type": "json_schema", "json_schema": {"name": "ok", "schema": []}})
    with pytest.raises(SchemaError, match="not a valid JSON Schema"):
        normalize_response_format(
            {"type": "json_schema", "json_schema": {"name": "ok", "schema": {"type": "object", "properties": "nope"}}}
        )
    with pytest.raises(SchemaError, match="strict"):
        normalize_response_format(
            {"type": "json_schema", "json_schema": {"name": "ok", "schema": {"type": "object"}, "strict": "yes"}}
        )
    with pytest.raises(SchemaError, match="description"):
        normalize_response_format(
            {"type": "json_schema", "json_schema": {"name": "ok", "schema": {"type": "object"}, "description": 1}}
        )


def test_normalize_size_cap():
    huge = {
        "type": "json_schema",
        "json_schema": {
            "name": "ok",
            "schema": {"type": "object", "description": "x" * 40_000},
        },
    }
    with pytest.raises(SchemaError, match="too large"):
        normalize_response_format(huge)


def test_validate_json_object_and_fence():
    fmt = {"type": "json_object"}
    validate_output('{"a": 1}', fmt)
    validate_output('```json\n{"a": 1}\n```', fmt)
    with pytest.raises(SchemaError, match="not valid JSON") as exc:
        validate_output('{"password": "hunter2"', fmt)
    assert "hunter2" not in str(exc.value)
    with pytest.raises(SchemaError, match="not valid JSON"):
        validate_output("", fmt)
    validate_output(None, None)  # type: ignore[arg-type]


def test_validate_json_schema_match_and_extra_fields():
    fmt = normalize_response_format(REVIEW)
    validate_output('{"product_name": "mug", "rating": 4}', fmt)
    validate_output('```JSON\n{"product_name": "mug", "rating": 4}\n```', fmt)
    with pytest.raises(SchemaError, match="does not match") as exc:
        validate_output('{"product_name": "mug", "rating": 4, "secret": "leak"}', fmt)
    assert exc.value.path == "secret"
    assert "leak" not in str(exc.value)
    with pytest.raises(SchemaError, match="does not match") as type_exc:
        validate_output('{"product_name": "mug", "rating": "nope"}', fmt)
    assert type_exc.value.path == "rating"
    assert "nope" not in str(type_exc.value)
