from __future__ import annotations

import asyncio

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


def test_multi_worker_warning_without_redis(monkeypatch, tmp_path, caplog):
    import logging

    monkeypatch.setenv("WEB_CONCURRENCY", "2")
    caplog.set_level(logging.WARNING)
    rt = runtime(tmp_path)
    asyncio.run(rt.start())
    assert "WEB_CONCURRENCY" in caplog.text
    assert "REDIS_URL" in caplog.text
