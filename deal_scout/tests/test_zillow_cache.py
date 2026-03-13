"""Tests for Zillow enrichment cache."""
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from modules.zillow.cache import get_enrichment, set_enrichment


def test_cache_miss():
    with tempfile.TemporaryDirectory() as tmp:
        with patch("modules.zillow.cache.CACHE_DIR", Path(tmp)):
            with patch("modules.zillow.cache.ZILLOW_CACHE_TTL_HOURS", 24.0):
                result = get_enrichment("zpid:12345")
                assert result is None


def test_cache_set_and_get():
    with tempfile.TemporaryDirectory() as tmp:
        with patch("modules.zillow.cache.CACHE_DIR", Path(tmp)):
            with patch("modules.zillow.cache.ZILLOW_CACHE_TTL_HOURS", 24.0):
                payload = {"zpid": "12345", "price": 100000}
                set_enrichment("zpid:12345", payload)
                result = get_enrichment("zpid:12345")
                assert result == payload


def test_cache_different_keys():
    with tempfile.TemporaryDirectory() as tmp:
        with patch("modules.zillow.cache.CACHE_DIR", Path(tmp)):
            with patch("modules.zillow.cache.ZILLOW_CACHE_TTL_HOURS", 24.0):
                set_enrichment("zpid:111", {"a": 1})
                set_enrichment("zpid:222", {"b": 2})
                assert get_enrichment("zpid:111") == {"a": 1}
                assert get_enrichment("zpid:222") == {"b": 2}
