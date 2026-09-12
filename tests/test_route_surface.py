from __future__ import annotations

from fastapi.testclient import TestClient


def test_route_surface_includes_gateway_contract(make_app):
    client = TestClient(make_app())
    paths = set(client.get("/openapi.json").json()["paths"].keys())
    expected = {
        "/health",
        "/providers",
        "/models",
        "/prompts",
        "/budget",
        "/config",
        "/memory",
        "/memory/{memory_id}",
        "/chat",
        "/v1/chat/completions",
        "/v1/models",
        "/v1/embeddings",
        "/healthz",
        "/ready",
        "/metrics",
        "/admin/keys",
        "/admin/keys/{key_id}",
    }
    assert expected.issubset(paths)
    assert client.get("/").status_code == 200


def test_admin_routes_expose_expected_methods(make_app):
    spec = TestClient(make_app()).get("/openapi.json").json()["paths"]
    assert {"get", "post"}.issubset(spec["/admin/keys"].keys())
    assert {"patch", "delete"}.issubset(spec["/admin/keys/{key_id}"].keys())
