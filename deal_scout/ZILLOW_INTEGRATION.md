# Zillow RapidAPI Integration (v1)

## 1. Repo Findings

**Search/discovery code:** `modules/collector.py`
- Uses `ZillowService.search(bounds, page, state_code)` (refactored from inline ZillowClient)
- `collect(states)` – loops STATE_SEARCH_BOUNDS, paginates, green zone filter, dedup, county reverse-geocode
- Mapping: `modules/zillow/mapper.py` – `map_search_payload()`, `extract_candidates()`
- Service: `modules/zillow/service.py` – search + optional enrich_by_zpid

**Zillow-specific code:**
- `modules/zillow/` – client, cache, mapper, service
- `modules/collector.py` – collect orchestration, reverse geocode
- `config.py` – RAPIDAPI_*, MIN_SECONDS_BETWEEN_REQUESTS, ZILLOW_*

## 2. Confirmed vs Unconfirmed API Details

### Confirmed (in production)
- **Endpoint:** `/search/bymapbounds`
- **Params:** listingStatus, sortOrder, homeType, listPriceRange, lotSizeRange, eastLongitude, westLongitude, southLatitude, northLatitude, page, bed_min, bed_max, bathrooms, maxHOA, parkingSpots, mustHaveBasement, daysOnZillow
- **Response:** dict with searchResults/mapResults/listResults; items may wrap in `property`
- **Item fields:** price.value, lotSizeWithUnit.lotSize/lotSizeUnit, address.*, location.latitude/longitude, hdpView.hdpUrl, zpid, daysOnZillow, zoning, hdpData.homeInfo

### Not yet confirmed (TODO)
- Property-by-zpid endpoint path and params
- Property-by-url endpoint path and params
- Property-by-address endpoint path and params
- Rent/price/tax history endpoints

## 3. Files Added/Edited

**Added:**
- `modules/zillow/__init__.py`
- `modules/zillow/client.py` – HTTP, retry, backoff, rate limit, request count
- `modules/zillow/cache.py` – enrichment cache by zpid/url/address key
- `modules/zillow/mapper.py` – raw payload → normalized rows
- `modules/zillow/service.py` – search + enrich_by_zpid (config-gated)
- `tests/fixtures/zillow_search_bymapbounds.json`
- `tests/fixtures/zillow_search_nested.json`
- `tests/test_zillow_client.py`, `test_zillow_cache.py`, `test_zillow_mapper.py`, `test_zillow_service.py`

**Edited:**
- `config.py` – MIN_SECONDS_BETWEEN_REQUESTS, ZILLOW_*, RAPIDAPI_KEY, load_dotenv
- `modules/collector.py` – refactored to use ZillowService, removed inline ZillowClient
- `requirements.txt` – pytest

## 4. Config

| Variable | Default | Description |
|----------|---------|-------------|
| RAPIDAPI_KEY | (required) | API key from .env |
| MIN_SECONDS_BETWEEN_REQUESTS | 0.5 | Min seconds between API calls |
| ZILLOW_PROPERTY_BY_ZPID_ENDPOINT | (unset) | Set to enable enrich_by_zpid; leave unset to skip |
| ZILLOW_CACHE_TTL_HOURS | 24 | Enrichment cache TTL |

## 5. Module Boundaries

- **client** – HTTP, retry/backoff, rate limiting, request accounting
- **cache** – enrichment payload cache by zpid/url/address key (not search)
- **mapper** – raw payload → normalized models
- **service** – search + enrichment orchestration

## 6. Remaining TODOs / Not Yet Confirmed

- [ ] Verify property-by-zpid endpoint in RapidAPI docs; set ZILLOW_PROPERTY_BY_ZPID_ENDPOINT to enable
- [ ] enrich_by_url() – only if endpoint confirmed
- [ ] enrich_by_address() – only if endpoint confirmed
- [ ] Full history/tax/rent support – only if endpoints confirmed

## 7. Example Usage

```python
from modules.zillow.service import ZillowService

svc = ZillowService()
result = svc.search(
    bounds={"west": -78, "east": -77, "south": 35, "north": 36},
    page=1,
    state_code="NC",
)
rows = result["rows"]
# Enrichment (returns None until endpoint configured):
enriched = svc.enrich_by_zpid("2123947089")
```

**Run tests (from deal_scout dir):**
```bash
cd deal_scout && python -m pytest tests/ -v
```
