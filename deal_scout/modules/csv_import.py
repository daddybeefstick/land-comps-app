"""
Import land listings from CSV instead of Zillow API.
Use when API quota is exhausted or to run pipeline without RapidAPI.

Required columns: address, state, county, city, zipcode, price, acres
Optional: url, days_on_market, zpid, zoning
"""
import csv
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from config import GREEN_ZONE_EXCEL_PATH, MAX_ACRES, MAX_PURCHASE_PRICE, MIN_ACRES
from database.db import get_connection, init_db, upsert_properties
from modules.green_zones import load_green_zone_zips


def _normalize_col(name: str) -> str:
    return name.strip().lower().replace(" ", "_").replace("-", "_")


def _coerce_float(val: Any) -> Optional[float]:
    if val is None or val == "":
        return None
    try:
        s = str(val).replace(",", "").replace("$", "").strip()
        return float(s) if s else None
    except (TypeError, ValueError):
        return None


def _coerce_int(val: Any) -> int:
    f = _coerce_float(val)
    return int(f) if f is not None else 0


def _normalize_state(s: Any) -> str:
    t = str(s or "").strip().upper()
    return t[:2] if len(t) >= 2 else t


def import_from_csv(csv_path: Path, states: Optional[List[str]] = None) -> int:
    """
    Import listings from CSV into properties table.
    Applies green zone filter when states include NC or SC.
    Returns count of rows inserted/updated.
    """
    init_db()

    path = Path(csv_path)
    if not path.exists():
        raise FileNotFoundError(f"CSV not found: {path}")

    requested_states = [_normalize_state(s) for s in (states or [])]

    # Clear existing data for requested states (like collect does)
    if requested_states:
        placeholders = ",".join("?" for _ in requested_states)
        with get_connection() as conn:
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
            deleted = conn.execute(
                f"DELETE FROM properties WHERE UPPER(COALESCE(state, '')) IN ({placeholders})",
                requested_states,
            ).rowcount
            conn.commit()
        if deleted:
            print(f"  Cleared {deleted} existing rows for refresh.", flush=True)

    green_zips: Optional[Set[str]] = None
    if requested_states and any(s in ("NC", "SC") for s in requested_states):
        try:
            green_zips = load_green_zone_zips(GREEN_ZONE_EXCEL_PATH)
        except FileNotFoundError:
            pass  # No green zone filter if Excel missing

    rows: List[Dict[str, Any]] = []
    col_map: Dict[str, str] = {}

    with path.open(newline="", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            return 0

        for raw_name in reader.fieldnames:
            col_map[_normalize_col(raw_name)] = raw_name

        def get(row: Dict[str, str], *keys: str, default: str = "") -> str:
            for k in keys:
                n = _normalize_col(k)
                if n in col_map and row.get(col_map[n], ""):
                    return str(row.get(col_map[n], "")).strip()
            return default

        for row in reader:
            address = get(row, "address", "Address", default="")
            state = _normalize_state(get(row, "state", "State", default=""))
            county = get(row, "county", "County", default="")
            city = get(row, "city", "City", default="")
            zipcode = str(get(row, "zipcode", "Zipcode", "zip", default="")).strip()
            price = _coerce_float(get(row, "price", "Price", default=""))
            acres = _coerce_float(get(row, "acres", "Acres", default=""))

            if not address or not state or price is None or acres is None:
                continue
            if acres < MIN_ACRES or acres > MAX_ACRES or price > MAX_PURCHASE_PRICE:
                continue
            if requested_states and state not in requested_states:
                continue
            if green_zips is not None and zipcode and zipcode not in green_zips:
                continue

            zpid = get(row, "zpid", "zpid", default="")
            if not zpid:
                zpid = f"{state}-{address}-{price}-{acres}"
            url = get(row, "url", "url", "link", default="")
            days_on_market = _coerce_int(get(row, "days_on_market", "days_on_market", "dom", default=""))

            price_per_acre = round(price / acres, 2) if acres else None

            rows.append(
                {
                    "source": "csv-import",
                    "state": state,
                    "county": county,
                    "address": address,
                    "city": city,
                    "zipcode": zipcode,
                    "zpid": zpid,
                    "url": url,
                    "price": price,
                    "acres": acres,
                    "price_per_acre": price_per_acre,
                    "days_on_market": days_on_market,
            "latitude": None,
            "longitude": None,
            "zoning": str(get(row, "zoning", "Zoning", default="")).strip(),
            "property_type": "land",
                    "raw_json": "{}",
                }
            )

    if not rows:
        print("  No rows passed filters.", flush=True)
        return 0

    count = upsert_properties(rows)
    print(f"  Imported {len(rows)} rows ({count} inserted/updated).", flush=True)
    return count
