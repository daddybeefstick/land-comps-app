import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
_env_path = os.environ.get("GREEN_ZONE_EXCEL_PATH", "").strip()
GREEN_ZONE_EXCEL_PATH = Path(_env_path) if _env_path else Path.home() / "Downloads" / "scraped-nc-zipcodes.xlsx"
DATABASE_PATH = BASE_DIR / "database" / "deals.db"
OUTPUT_EXPORTS_DIR = BASE_DIR / "outputs" / "exports"
OUTPUT_REPORTS_DIR = BASE_DIR / "outputs" / "reports"
CACHE_DIR = BASE_DIR / ".cache"

TARGET_STATES = ["TX", "FL", "TN", "NC", "SC", "AZ", "OH"]
MAX_PURCHASE_PRICE = 500_000
MIN_ACRES = 20.0
MAX_ACRES = 50.0
MIN_SCORE_FOR_REVIEW = 60
MAX_ESTIMATED_LOTS = 10
MIN_ESTIMATED_LOTS = 5

# Pagination: fetch up to N pages per region to get more listings (Zillow ~20/page)
COLLECTOR_MAX_PAGES_PER_REGION = 10

RAPIDAPI_KEY = os.environ.get("RAPIDAPI_KEY", "").strip() or None
RAPIDAPI_BASE_URL = os.environ.get("RAPIDAPI_BASE_URL", "https://private-zillow.p.rapidapi.com").strip()
RAPIDAPI_HOST = os.environ.get("RAPIDAPI_HOST", "private-zillow.p.rapidapi.com").strip()
REQUEST_TIMEOUT = 30
# Rate limit: min seconds between requests (Pro plan ~2 req/sec → 0.5s safe)
MIN_SECONDS_BETWEEN_REQUESTS = float(os.environ.get("MIN_SECONDS_BETWEEN_REQUESTS", "0.5"))
REQUEST_429_MAX_RETRIES = int(os.environ.get("REQUEST_429_MAX_RETRIES", "3"))
REQUEST_429_BASE_DELAY = float(os.environ.get("REQUEST_429_BASE_DELAY", "5.0"))

# Search: confirmed in codebase
ZILLOW_SEARCH_BY_BOUNDS_ENDPOINT = "/search/bymapbounds"
# Enrichment: NOT YET CONFIRMED — set in env to enable; leave unset to skip
ZILLOW_PROPERTY_BY_ZPID_ENDPOINT = os.environ.get("ZILLOW_PROPERTY_BY_ZPID_ENDPOINT", "").strip() or None
ZILLOW_CACHE_TTL_HOURS = float(os.environ.get("ZILLOW_CACHE_TTL_HOURS", "24"))

SURVEY_COST_PER_LOT = 2000
INFRA_COST_PER_LOT = 8000
PERMITS_FLAT = 3000
HOLDING_COST_RATE = 0.04

STATE_GROWTH_BONUS = {
    "TX": 10,
    "FL": 10,
    "TN": 10,
    "NC": 10,
    "SC": 10,
    "AZ": 10,
    "OH": 0,
}

# Seed map bounds per state for /search/bymapbounds discovery.
# Bounds format: west, east, south, north (lng/lng/lat/lat).
STATE_SEARCH_BOUNDS = {
    "TX": [
        {"west": -106.65, "east": -93.51, "south": 25.84, "north": 36.50},
        {"west": -98.90, "east": -94.00, "south": 28.80, "north": 33.80},
    ],
    "FL": [
        {"west": -87.64, "east": -80.03, "south": 24.40, "north": 31.10},
        {"west": -85.00, "east": -80.80, "south": 27.00, "north": 30.90},
    ],
    "TN": [
        {"west": -90.40, "east": -81.64, "south": 34.98, "north": 36.68},
        {"west": -88.50, "east": -83.00, "south": 35.40, "north": 36.60},
    ],
    "NC": [
        {"west": -84.32, "east": -75.40, "south": 33.75, "north": 36.60},
        {"west": -82.90, "east": -77.20, "south": 34.80, "north": 36.55},
    ],
    "SC": [
        {"west": -83.40, "east": -78.40, "south": 32.03, "north": 35.22},
        {"west": -82.20, "east": -79.30, "south": 33.00, "north": 35.10},
    ],
    "AZ": [
        {"west": -114.82, "east": -109.04, "south": 31.24, "north": 37.01},
        {"west": -113.00, "east": -110.40, "south": 32.00, "north": 35.80},
    ],
    "OH": [
        {"west": -84.82, "east": -80.52, "south": 38.40, "north": 41.98},
        {"west": -84.20, "east": -81.00, "south": 39.10, "north": 41.60},
    ],
}
