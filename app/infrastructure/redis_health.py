from __future__ import annotations

import logging
import threading
from typing import Any

from app.settings import GatewaySettings

logger = logging.getLogger(__name__)


class RedisHealth:
    def __init__(self, settings: GatewaySettings):
        self._settings = settings
        self._lock = threading.Lock()
        self._reachable_cache: bool | None = None
        self._client: Any = None

    def configured(self) -> bool:
        return bool(self._settings.redis_url_value())

    def _build_client(self):
        url = self._settings.redis_url_value()
        if not url:
            return None
        try:
            import redis as redis_lib
        except ImportError:
            return None
        return redis_lib.Redis.from_url(url, decode_responses=True)

    def reachable(self, *, refresh: bool = False) -> bool:
        if not self.configured():
            with self._lock:
                self._reachable_cache = None
            return False
        with self._lock:
            if not refresh and self._reachable_cache is not None:
                return self._reachable_cache
            client = self._client
            if client is None:
                client = self._build_client()
                self._client = client
        if client is None:
            with self._lock:
                self._reachable_cache = False
            return False
        ok = False
        try:
            client.ping()
            ok = True
        except Exception:
            ok = False
            logger.debug("Redis ping failed", exc_info=True)
        with self._lock:
            self._reachable_cache = ok
            if not ok:
                self._client = None
        return ok

    def mode(self) -> str:
        if not self.configured():
            return "unconfigured"
        return "shared" if self.reachable() else "local"

    def redis_kwargs(self) -> dict[str, str]:
        if self.mode() != "shared":
            return {}
        url = self._settings.redis_url_value()
        if not url:
            return {}
        return {"redis_url": url}
