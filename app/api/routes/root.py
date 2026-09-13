from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse

from app.api.dependencies import get_runtime
from app.container import GatewayRuntime

router = APIRouter()


def _pointer_page(dest: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ReaLMM gateway</title>
    <style>
      :root {{
        --ink: #07141f;
        --paper: #e7f2f6;
        --signal: #2ec4b6;
        --mute: #8ba4b7;
      }}
      body {{
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: var(--ink);
        color: var(--paper);
        font-family: "IBM Plex Sans", system-ui, sans-serif;
      }}
      main {{
        max-width: 36rem;
        padding: 2rem;
      }}
      h1 {{
        font-family: Syne, system-ui, sans-serif;
        font-weight: 800;
        letter-spacing: -0.04em;
        margin: 0 0 0.75rem;
      }}
      p {{ color: var(--mute); line-height: 1.5; }}
      a {{ color: var(--signal); }}
    </style>
  </head>
  <body>
    <main>
      <h1>ReaLMM</h1>
      <p>Opinionated LiteLLM operator stack: memory, PII, guards, and a console. Completions go through <code>POST /chat</code> or <code>POST /v1/chat/completions</code>.</p>
      <p>Open the Next.js console at <a href="{dest}">{dest}</a>. Provider keys stay in <code>.env</code>. This is not a Portkey or LiteLLM Proxy replacement. <code>GATEWAY_API_KEY</code> protects inbound access; <code>GATEWAY_ALLOW_OPEN=1</code> is for loopback development only.</p>
      <p>API docs: <a href="/docs">/docs</a>.</p>
    </main>
  </body>
</html>
"""


@router.get("/", include_in_schema=False)
async def index(request: Request, runtime: GatewayRuntime = Depends(get_runtime)) -> HTMLResponse:
    return HTMLResponse(_pointer_page(runtime.settings.console_href()))


@router.get("/healthz")
async def healthz() -> dict:
    return {"status": "ok"}
