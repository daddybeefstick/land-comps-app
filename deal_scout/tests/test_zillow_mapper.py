"""Tests for Zillow mapper using saved fixture payloads."""
import json
from pathlib import Path

import pytest

from modules.zillow.mapper import (
    extract_candidates,
    extract_candidates_with_path,
    map_search_payload,
    normalize_state_code,
)


FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"


def _load_fixture(name: str) -> dict:
    with open(FIXTURES_DIR / name, encoding="utf-8") as f:
        return json.load(f)


def test_extract_candidates_search_results():
    payload = _load_fixture("zillow_search_bymapbounds.json")
    candidates, path = extract_candidates_with_path(payload)
    assert path == "searchResults"
    assert len(candidates) == 2
    assert candidates[0].get("property", {}).get("zpid") == "2123947089"


def test_extract_candidates_nested():
    payload = _load_fixture("zillow_search_nested.json")
    candidates, path = extract_candidates_with_path(payload)
    assert "listResults" in path or "searchResults" in path
    assert len(candidates) >= 1
    assert extract_candidates(payload) == candidates


def test_map_search_payload_nc():
    payload = _load_fixture("zillow_search_bymapbounds.json")
    rows = map_search_payload(payload, "NC")
    assert len(rows) == 2
    r0 = rows[0]
    assert r0["state"] == "NC"
    assert r0["zpid"] == "2123947089"
    assert r0["price"] == 225000.0
    assert r0["acres"] == 43.84
    assert r0["county"] == "Nash County"
    assert "zillow.com" in r0["url"]
    assert "raw_json" in r0


def test_map_search_payload_state_filter():
    payload = _load_fixture("zillow_search_bymapbounds.json")
    rows_nc = map_search_payload(payload, "NC")
    rows_tx = map_search_payload(payload, "TX")
    assert len(rows_nc) == 2
    assert len(rows_tx) == 0


def test_normalize_state_code():
    assert normalize_state_code("NC") == "NC"
    assert normalize_state_code("nc") == "NC"
    assert normalize_state_code(" North Carolina ") == "NO"
    assert normalize_state_code("") == ""
