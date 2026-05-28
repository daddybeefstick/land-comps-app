"""
One-off Zillow collect for a fixed set of focus counties (manual sweet-spot list).

Run from deal_scout/:
  python scripts/oneoffs/collect_focus_counties.py

Then score/export/sync as you like:
  python main.py score
  python main.py export
  python scripts/sync_review_list_to_sheet.py --csv outputs/exports/flagged_deals.csv --tab-prefix FOCUS_

Notes:
- This file is intentionally in scripts/oneoffs so it is never part of the default pipeline.
- API sort: uses sortOrder=Newest so each page is biased toward newer listings (not the
  default Homes_for_you). Scoring still uses days_on_market in modules/filter.py.
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Dict, List, Set

# deal_scout as cwd for imports
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config import COLLECTOR_MAX_PAGES_PER_REGION
from database.db import init_db, upsert_properties
from modules.collector import _clean_county_name, _reverse_geocode_county
from modules.dedup import add_to_seen, is_duplicate
from modules.zillow.mapper import normalize_state_code
from modules.zillow.service import ZillowService


def _norm_county(name: str) -> str:
    s = str(name or "").strip().lower()
    if s.endswith(" county"):
        s = s[: -len(" county")].strip()
    return s


# State -> allowed county base names (no "County" suffix)
ALLOWLIST: Dict[str, Set[str]] = {
    "OH": {"tuscarawas", "coshocton", "muskingum"},
    "NC": {"franklin", "granville", "person"},
    "TN": {"dickson", "warren", "white"},
    "SC": {"laurens", "chester", "anderson"},
    "VA": {"franklin", "bedford", "campbell"},
}

# Tight map bounds per cluster (west, east, south, north). One search box per cluster.
FOCUS_REGIONS: List[Dict[str, Any]] = [
    {
        "state": "OH",
        "label": "Tuscarawas/Coshocton/Muskingum",
        "west": -82.35,
        "east": -81.05,
        "south": 39.82,
        "north": 40.78,
    },
    {
        "state": "NC",
        "label": "Franklin/Granville/Person (Triangle orbit)",
        "west": -79.38,
        "east": -78.02,
        "south": 35.90,
        "north": 36.70,
    },
    {
        "state": "TN",
        "label": "Dickson/Warren/White (Nashville ring)",
        "west": -88.05,
        "east": -85.05,
        "south": 35.58,
        "north": 36.42,
    },
    {
        "state": "SC",
        "label": "Laurens/Chester/Anderson (Greenville orbit)",
        "west": -82.95,
        "east": -80.82,
        "south": 34.08,
        "north": 35.22,
    },
    {
        "state": "VA",
        "label": "Franklin/Bedford/Campbell (Roanoke/Lynchburg)",
        "west": -80.35,
        "east": -78.95,
        "south": 36.68,
        "north": 37.72,
    },
]


def _county_allowed(state: str, county: str) -> bool:
    st = normalize_state_code(state)
    c = _norm_county(county)
    if not c:
        return False
    return c in ALLOWLIST.get(st, set())


def collect_focus_counties() -> int:
    init_db()
    service = ZillowService()
    extra_params = {"sortOrder": "Newest"}
    seen_zpid: set[str] = set()
    seen_addr: set[str] = set()
    county_cache: Dict[str, str] = {}
    all_rows: List[Dict[str, Any]] = []
    skipped_county = 0

    for region in FOCUS_REGIONS:
        state = region["state"]
        bounds = {
            "west": region["west"],
            "east": region["east"],
            "south": region["south"],
            "north": region["north"],
        }
        label = region["label"]
        page = 1
        while page <= COLLECTOR_MAX_PAGES_PER_REGION:
            print(
                f"\n  {state} [{label}] page {page}/{COLLECTOR_MAX_PAGES_PER_REGION} ...",
                flush=True,
            )
            result = service.search(
                bounds, page=page, state_code=state, extra_params=extra_params
            )
            rows = result["rows"]
            if not rows:
                break
            page_skipped = 0
            page_kept = 0
            for row in rows:
                if normalize_state_code(row.get("state")) != state:
                    continue
                if not str(row.get("county") or "").strip():
                    row["county"] = _reverse_geocode_county(
                        row.get("latitude"),
                        row.get("longitude"),
                        county_cache,
                    )
                county = _clean_county_name(row.get("county") or "")
                row["county"] = county
                if not _county_allowed(state, county):
                    skipped_county += 1
                    page_skipped += 1
                    continue
                if is_duplicate(row, seen_zpid, seen_addr):
                    continue
                add_to_seen(row, seen_zpid, seen_addr)
                all_rows.append(row)
                page_kept += 1
            print(
                f"    -> page +{page_kept} (wrong county this page: {page_skipped}), "
                f"cumulative kept {len(all_rows)}",
                flush=True,
            )
            page += 1

    if not all_rows:
        print("No rows to save.", flush=True)
        return 0
    n = upsert_properties(all_rows)
    print(f"\nDone. Upserted {n} rows from {len(all_rows)} focus-county listings.", flush=True)
    return n


if __name__ == "__main__":
    collect_focus_counties()

