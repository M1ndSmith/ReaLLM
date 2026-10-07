from __future__ import annotations

import json
import urllib.error
import urllib.request
from collections.abc import Callable
from typing import Any

from app.application.errors import BillingUnavailableError

DEFAULT_RPC_URL = "https://rpc.testnet.arc.io"
DEFAULT_USDC_ADDRESS = "0x3600000000000000000000000000000000000000"
_BALANCE_OF = "70a08231"
_UNAVAILABLE = "Arc USDC balance is unavailable."


class ArcUsdcReader:
    """Read the Arc testnet USDC balance through the ERC-20 interface (6 decimals)."""

    def __init__(
        self,
        rpc_url: str = DEFAULT_RPC_URL,
        usdc_address: str = DEFAULT_USDC_ADDRESS,
        *,
        timeout: float = 10.0,
        transport: Callable[[dict[str, Any]], dict[str, Any]] | None = None,
    ):
        self.rpc_url = (rpc_url or DEFAULT_RPC_URL).strip()
        self.usdc_address = (usdc_address or DEFAULT_USDC_ADDRESS).strip()
        self.timeout = timeout
        self._transport = transport

    def balance_usdc(self, address: str) -> float:
        body = address.lower().removeprefix("0x")
        if len(body) != 40:
            raise BillingUnavailableError(_UNAVAILABLE)
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "eth_call",
            "params": [
                {
                    "to": self.usdc_address,
                    "data": "0x" + _BALANCE_OF + body.rjust(64, "0"),
                },
                "latest",
            ],
        }
        result = self._post(payload)
        raw = result.get("result")
        if result.get("error") is not None or not isinstance(raw, str) or not raw.startswith("0x"):
            raise BillingUnavailableError(_UNAVAILABLE)
        hex_body = raw[2:]
        try:
            units = 0 if hex_body == "" else int(hex_body, 16)
        except ValueError as exc:
            raise BillingUnavailableError(_UNAVAILABLE) from exc
        return units / 1_000_000

    def _post(self, payload: dict[str, Any]) -> dict[str, Any]:
        if self._transport is not None:
            try:
                parsed = self._transport(payload)
            except BillingUnavailableError:
                raise
            except Exception as exc:
                raise BillingUnavailableError(_UNAVAILABLE) from exc
            if not isinstance(parsed, dict):
                raise BillingUnavailableError(_UNAVAILABLE)
            return parsed
        request = urllib.request.Request(
            self.rpc_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"content-type": "application/json", "user-agent": "ReaLMM/0.1"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                raw = response.read()
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise BillingUnavailableError(_UNAVAILABLE) from exc
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise BillingUnavailableError(_UNAVAILABLE) from exc
        if not isinstance(parsed, dict):
            raise BillingUnavailableError(_UNAVAILABLE)
        return parsed
