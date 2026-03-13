import requests
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

from config import (
    COLLECTOR_MAX_PAGES_PER_REGION,
    GREEN_ZONE_EXCEL_PATH,
    STATE_SEARCH_BOUNDS,
    TARGET_STATES,
)
from database.db import get_connection, init_db, upsert_properties
from modules.dedup import add_to_seen, is_duplicate
from modules.green_zones import load_green_zone_zips
from modules.zillow.mapper import extract_candidates_with_path, normalize_state_code
from modules.zillow.service import ZillowService

load_dotenv()


def _clean_county_name(value: Any) -> str:
    county = str(value or "").strip()
    if not county or county.isdigit():
        return ""
    if not county.lower().endswith("county"):
        county = f"{county} County"
    return county


def _reverse_geocode_county(
    latitude: Optional[float],
    longitude: Optional[float],
    cache: Dict[str, str],
) -> str:
    if latitude is None or longitude is None:
        return ""
    cache_key = f"{round(latitude, 5)},{round(longitude, 5)}"
    if cache_key in cache:
        return cache[cache_key]
    try:
        response = requests.get(
            "https://geocoding.geo.census.gov/geocoder/geographies/coordinates",
            params={
                "x": longitude,
                "y": latitude,
                "benchmark": "Public_AR_Current",
                "vintage": "Current_Current",
                "format": "json",
            },
            timeout=8,
        )
        response.raise_for_status()
        payload = response.json()
        counties = payload.get("result", {}).get("geographies", {}).get("Counties", [])
        if counties and isinstance(counties[0], dict):
            name = counties[0].get("NAME") or counties[0].get("BASENAME") or ""
            county = _clean_county_name(name)
            cache[cache_key] = county
            return county
    except requests.RequestException:
        pass
    except (ValueError, TypeError, KeyError):
        pass
    cache[cache_key] = ""
    return ""


def collect(states: Optional[List[str]] = None) -> int:
    init_db()
    service = ZillowService()
    total = 0
    requested_states = [normalize_state_code(s) for s in (states or TARGET_STATES)]
    if states:
        placeholders = ",".join("?" for _ in requested_states)
        with get_connection() as conn:
            conn.execute(
                f"""
                DELETE FROM scored_properties
                WHERE property_id IN (
                    SELECT id FROM properties
                    WHERE UPPER(COALESCE(state, '')) NOT IN ({placeholders})
                )
                """,
                requested_states,
            )
            removed_non_requested = conn.execute(
                f"DELETE FROM properties WHERE UPPER(COALESCE(state, '')) NOT IN ({placeholders})",
                requested_states,
            ).rowcount
            conn.execute(
                f"""
                DELETE FROM scored_properties
                WHERE property_id IN (
                    SELECT id FROM properties
                    WHERE UPPER(COALESCE(state, '')) IN ({placeholders})
                )
                """,
                requested_states,
            )
            removed_requested = conn.execute(
                f"DELETE FROM properties WHERE UPPER(COALESCE(state, '')) IN ({placeholders})",
                requested_states,
            ).rowcount
            conn.commit()
        print(f"  Cleared {removed_non_requested} old rows, {removed_requested} for refresh", flush=True)

    green_zips: set[str] = set()
    nc_sc_requested = {"NC", "SC"} & {normalize_state_code(s) for s in (states or TARGET_STATES)}
    if nc_sc_requested and GREEN_ZONE_EXCEL_PATH.exists():
        green_zips = load_green_zone_zips(GREEN_ZONE_EXCEL_PATH)
        print(f"  Green zone filter: {len(green_zips)} zipcodes (NC+SC)", flush=True)
    elif nc_sc_requested and not GREEN_ZONE_EXCEL_PATH.exists():
        raise FileNotFoundError(
            f"Green zone Excel required for NC/SC but not found: {GREEN_ZONE_EXCEL_PATH}\n"
            "Place scraped-nc-zipcodes.xlsx in Downloads or set GREEN_ZONE_EXCEL_PATH in .env"
        )

    seen_zpid: set[str] = set()
    seen_addr: set[str] = set()
    for state in states or TARGET_STATES:
        requested_state = normalize_state_code(state)
        state_bounds = STATE_SEARCH_BOUNDS.get(state, [])
        if not state_bounds:
            print(f"  Skipping {state}: no bounds configured", flush=True)
            continue
        all_rows: List[Dict[str, Any]] = []
        county_cache: Dict[str, str] = {}
        raw_total = 0
        normalized_total = 0
        out_of_state_excluded = 0
        for idx, bounds in enumerate(state_bounds):
            region = idx + 1
            total_regions = len(state_bounds)
            page = 1
            while page <= COLLECTOR_MAX_PAGES_PER_REGION:
                print(f"\n  {requested_state} region {region}/{total_regions} page {page} (fetching...)", flush=True)
                result = service.search(bounds, page=page, state_code=state)
                payload = result["payload"]
                raw_candidates, raw_path = extract_candidates_with_path(payload)
                raw_total += len(raw_candidates)
                rows = result["rows"]
                normalized_total += len(rows)
                out_of_state_excluded += max(0, len(raw_candidates) - len(rows))
                n = len(raw_candidates) if isinstance(raw_candidates, list) else 0
                print(f"    -> page {page}: {n} results", flush=True)
                if not rows:
                    break
                for row in rows:
                    if normalize_state_code(row.get("state")) != requested_state:
                        out_of_state_excluded += 1
                        continue
                    if green_zips:
                        zipcode = str(row.get("zipcode") or "").strip()
                        if zipcode not in green_zips:
                            continue
                    if not str(row.get("county") or "").strip():
                        row["county"] = _reverse_geocode_county(
                            row.get("latitude"),
                            row.get("longitude"),
                            county_cache,
                        )
                    if is_duplicate(row, seen_zpid, seen_addr):
                        continue
                    add_to_seen(row, seen_zpid, seen_addr)
                    all_rows.append(row)
                print(
                    f"  {requested_state} region {region}/{total_regions} page {page}: "
                    f"{len(raw_candidates)} raw -> {len(rows)} passed -> {len(all_rows)} total kept",
                    flush=True,
                )
                page += 1
        print(f"\n  {requested_state} complete: {len(all_rows)} properties saved", flush=True)
        if all_rows:
            total += upsert_properties(all_rows)
    return total


if __name__ == "__main__":
    changed = collect()
    print(f"Collector finished. Rows inserted/updated: {changed}")
