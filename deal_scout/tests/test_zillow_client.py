"""Tests for Zillow client (rate limit, retry, request counting)."""
from unittest.mock import MagicMock, patch

import pytest

from modules.zillow.client import ZillowClient


def test_client_raises_without_api_key():
    with patch("modules.zillow.client.RAPIDAPI_KEY", None):
        with pytest.raises(RuntimeError, match="RAPIDAPI_KEY"):
            ZillowClient()


def test_client_request_count():
    client = ZillowClient(api_key="fake-key-for-test")
    assert client.request_count == 0
    with patch("modules.zillow.client.requests.request") as mock_req:
        mock_req.return_value = MagicMock(status_code=200, json=lambda: {"ok": True})
        client.get("/test", params={"a": 1})
        assert client.request_count == 1
        client.get("/test2")
        assert client.request_count == 2
