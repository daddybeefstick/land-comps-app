"""
Zillow search and enrichment service.
Search: confirmed /search/bymapbounds.
Enrichment: config-gated; only enrich_by_zpid when endpoint is confirmed.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from config import ZILLOW_PROPERTY_BY_ZPID_ENDPOINT, ZILLOW_SEARCH_BY_BOUNDS_ENDPOINT
from modules.zillow.cache import get_enrichment, set_enrichment
from modules.zillow.client import ZillowClient
from modules.zillow.mapper import extract_candidates, map_search_payload


# Default search params used by collector (20-50 acres, Lots-Land, For_Sale)
DEFAULT_SEARCH_PARAMS = {
    "listingStatus": "For_Sale",
    "sortOrder": "Homes_for_you",
    "homeType": "Lots-Land",
    "listPriceRange": "min:1,max:500000",
    "lotSizeRange": "min:871200,max:2178000",  # 20-50 acres in sqft
    "bed_min": "No_Min",
    "bed_max": "No_Max",
    "bathrooms": "Any",
    "maxHOA": "Any",
    "parkingSpots": "Any",
    "mustHaveBasement": "No",
    "daysOnZillow": "Any",
}


class ZillowService:
    """Orchestrates Zillow search and optional enrichment."""

    def __init__(self, client: Optional[ZillowClient] = None):
        self._client = client or ZillowClient()

    @property
    def request_count(self) -> int:
        return self._client.request_count

    def search(
        self,
        bounds: Dict[str, float],
        page: int = 1,
        state_code: str = "",
        extra_params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Search by map bounds. Returns raw payload plus normalized rows if state_code given.
        """
        params = {**DEFAULT_SEARCH_PARAMS, **(extra_params or {})}
        params.update(
            page=page,
            eastLongitude=bounds["east"],
            westLongitude=bounds["west"],
            southLatitude=bounds["south"],
            northLatitude=bounds["north"],
        )
        payload = self._client.get(ZILLOW_SEARCH_BY_BOUNDS_ENDPOINT, params=params)
        result: Dict[str, Any] = {"payload": payload, "rows": []}
        if state_code:
            result["rows"] = map_search_payload(payload, state_code)
        return result

    def search_raw_candidates(self, payload: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Extract raw candidate list from search payload (for counting/logging)."""
        return extract_candidates(payload)

    def enrich_by_zpid(self, zpid: str) -> Optional[Dict[str, Any]]:
        """
        Enrich by zpid. Only works when ZILLOW_PROPERTY_BY_ZPID_ENDPOINT is set in env.
        Uses cache first. Returns None if endpoint not configured or on error.
        TODO: param name for zpid not verified — assumed "zpid" until confirmed.
        """
        endpoint = ZILLOW_PROPERTY_BY_ZPID_ENDPOINT
        if not endpoint:
            return None
        cache_key = f"zpid:{zpid}"
        cached = get_enrichment(cache_key)
        if cached is not None:
            return cached
        try:
            # Param name assumed; verify in RapidAPI docs
            payload = self._client.get(endpoint, params={"zpid": zpid})
            if isinstance(payload, dict):
                set_enrichment(cache_key, payload)
                return payload
        except Exception:
            pass
        return None
