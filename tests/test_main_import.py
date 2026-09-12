from __future__ import annotations

import importlib

from fastapi import FastAPI


def test_main_module_exposes_fastapi_app():
    main = importlib.import_module("app.main")
    assert isinstance(main.app, FastAPI)
    assert main.app.title == "ReaLMM"
