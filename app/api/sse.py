from __future__ import annotations

import json


def sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


DONE = "data: [DONE]\n\n"
