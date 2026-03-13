"""
Low-level Zillow RapidAPI HTTP client.
Handles: base URL/host, API key, retry/backoff for 429/5xx, rate limiting, request counting.
"""
from __future__ import annotations

import time
from typing import Any, Optional

import requests

from config import (
    MIN_SECONDS_BETWEEN_REQUESTS,
    RAPIDAPI_BASE_URL,
    RAPIDAPI_HOST,
    RAPIDAPI_KEY,
    REQUEST_429_BASE_DELAY,
    REQUEST_429_MAX_RETRIES,
    REQUEST_TIMEOUT,
)


class ZillowClient:
    """HTTP client for Zillow RapidAPI with retry, backoff, rate limiting."""

    def __init__(
        self,
        base_url: Optional[str] = None,
        host: Optional[str] = None,
        api_key: Optional[str] = None,
        min_seconds_between_requests: Optional[float] = None,
    ):
        self.base_url = (base_url or RAPIDAPI_BASE_URL).rstrip("/")
        self.host = host or RAPIDAPI_HOST
        self.api_key = api_key or RAPIDAPI_KEY
        if not self.api_key:
            raise RuntimeError("Missing RAPIDAPI_KEY. Set it in .env or pass api_key to ZillowClient.")
        self.min_sec = min_seconds_between_requests if min_seconds_between_requests is not None else MIN_SECONDS_BETWEEN_REQUESTS
        self._last_request_time: float = 0.0
        self._request_count: int = 0

    @property
    def request_count(self) -> int:
        return self._request_count

    def _rate_limit_wait(self) -> None:
        now = time.monotonic()
        elapsed = now - self._last_request_time
        if elapsed < self.min_sec:
            time.sleep(self.min_sec - elapsed)
        self._last_request_time = time.monotonic()

    def _do_request(self, method: str, path: str, params: Optional[dict] = None, **kwargs: Any) -> requests.Response:
        self._rate_limit_wait()
        self._request_count += 1
        url = f"{self.base_url}{path}" if path.startswith("/") else f"{self.base_url}/{path}"
        params = params or {}
        headers = {
            "X-RapidAPI-Key": self.api_key,
            "X-RapidAPI-Host": self.host,
        }
        kwargs.setdefault("timeout", REQUEST_TIMEOUT)
        kwargs.setdefault("headers", {}).update(headers)
        return requests.request(method, url, params=params, **kwargs)

    def _request_with_retry(self, method: str, path: str, params: Optional[dict] = None, **kwargs: Any) -> Any:
        last_exc: Optional[Exception] = None
        for attempt in range(REQUEST_429_MAX_RETRIES + 1):
            resp = self._do_request(method, path, params=params, **kwargs)
            if resp.status_code == 429:
                last_exc = Exception(f"429 Too Many Requests")
                if attempt < REQUEST_429_MAX_RETRIES:
                    delay = REQUEST_429_BASE_DELAY * (2 ** attempt)
                    time.sleep(delay)
                continue
            if 500 <= resp.status_code < 600:
                last_exc = Exception(f"Server error {resp.status_code}")
                if attempt < REQUEST_429_MAX_RETRIES:
                    delay = REQUEST_429_BASE_DELAY * (2 ** attempt)
                    time.sleep(delay)
                continue
            resp.raise_for_status()
            return resp.json()
        if last_exc:
            raise last_exc
        resp.raise_for_status()
        return resp.json()

    def get(self, path: str, params: Optional[dict] = None, **kwargs: Any) -> Any:
        return self._request_with_retry("GET", path, params=params, **kwargs)
