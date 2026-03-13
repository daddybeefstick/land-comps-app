"""Tests for Zillow service."""
import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from modules.zillow.service import ZillowService


FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"


def _load_fixture(name: str) -> dict:
    with open(FIXTURES_DIR / name, encoding="utf-8") as f:
        return json.load(f)


def test_search_uses_mapper():
    fixture = _load_fixture("zillow_search_bymapbounds.json")
    with patch("modules.zillow.service.ZillowClient") as mock_client_class:
        mock_client = MagicMock()
        mock_client.get.return_value = fixture
        mock_client.request_count = 0
        mock_client_class.return_value = mock_client
        svc = ZillowService(client=mock_client)
        result = svc.search(
            {"west": -78, "east": -77, "south": 35, "north": 36},
            page=1,
            state_code="NC",
        )
        assert "payload" in result
        assert "rows" in result
        assert len(result["rows"]) == 2
        assert result["rows"][0]["zpid"] == "2123947089"


def test_enrich_by_zpid_unconfigured_returns_none():
    with patch("modules.zillow.service.ZILLOW_PROPERTY_BY_ZPID_ENDPOINT", None):
        svc = ZillowService()
        result = svc.enrich_by_zpid("2123947089")
        assert result is None
