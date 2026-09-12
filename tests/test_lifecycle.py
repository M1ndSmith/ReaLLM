from __future__ import annotations

import asyncio

import pytest
from tests.factories import runtime


def test_memory_drain_cancels_slow_tasks(tmp_path):
    rt = runtime(tmp_path)

    async def _run():
        async def hang():
            await asyncio.sleep(30)

        task = asyncio.get_running_loop().create_task(hang())
        rt.memory._background.add(task)
        task.add_done_callback(rt.memory._background.discard)
        await rt.memory.drain(timeout=0.05)
        assert task.cancelled() or task.done()
        assert rt.memory._accepting is False

    asyncio.run(_run())


def test_lifespan_start_and_shutdown(make_app, caplog):
    import logging

    from fastapi.testclient import TestClient

    caplog.set_level(logging.INFO)
    app = make_app()
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
        assert "gateway auth: off" in caplog.text
    assert app.state.runtime.memory._accepting is False


def test_start_requires_auth_unless_allow_open(monkeypatch, tmp_path):
    monkeypatch.delenv("GATEWAY_API_KEY", raising=False)
    monkeypatch.setenv("GATEWAY_ALLOW_OPEN", "0")
    rt = runtime(tmp_path)
    with pytest.raises(RuntimeError, match="GATEWAY_API_KEY"):
        asyncio.run(rt.start())


def test_start_requires_pepper_when_auth_is_on(monkeypatch, tmp_path):
    monkeypatch.setenv("GATEWAY_API_KEY", "secret-gateway")
    monkeypatch.setenv("GATEWAY_ALLOW_OPEN", "0")
    monkeypatch.delenv("GATEWAY_KEY_PEPPER", raising=False)
    with pytest.raises(RuntimeError, match="GATEWAY_KEY_PEPPER"):
        runtime(tmp_path)


def test_start_accepts_auth_with_pepper(monkeypatch, tmp_path):
    monkeypatch.setenv("GATEWAY_API_KEY", "secret-gateway")
    monkeypatch.setenv("GATEWAY_ALLOW_OPEN", "0")
    monkeypatch.setenv("GATEWAY_KEY_PEPPER", "unit-test-pepper")
    rt = runtime(tmp_path)
    asyncio.run(rt.start())


def test_start_allows_open_when_opted_in(monkeypatch, tmp_path, caplog):
    import logging

    monkeypatch.delenv("GATEWAY_API_KEY", raising=False)
    monkeypatch.setenv("GATEWAY_ALLOW_OPEN", "1")
    caplog.set_level(logging.WARNING)
    rt = runtime(tmp_path)
    asyncio.run(rt.start())
    assert "GATEWAY_ALLOW_OPEN=1" in caplog.text


def test_multi_worker_warning_without_redis(monkeypatch, tmp_path, caplog):
    import logging

    monkeypatch.setenv("WEB_CONCURRENCY", "2")
    caplog.set_level(logging.WARNING)
    rt = runtime(tmp_path)
    asyncio.run(rt.start())
    assert "WEB_CONCURRENCY" in caplog.text
    assert "REDIS_URL" in caplog.text
