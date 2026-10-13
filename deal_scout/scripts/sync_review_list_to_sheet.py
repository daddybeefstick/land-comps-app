#!/usr/bin/env python3
"""
Push the 20-property review list to Google Sheets.
Uses env: SHEETS_SPREADSHEET_ID (or CDA_SHEETS_SPREADSHEET_ID),
         SHEETS_SHEET_NAME (or CDA_SHEETS_SHEET_NAME),
         GOOGLE_APPLICATION_CREDENTIALS (path to service account JSON).
"""
import csv
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import quote_plus

# Load .env from project root if present
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass

ROOT = Path(__file__).resolve().parent.parent
EXPORTS = ROOT / "exports"
# NC/SC only (use run_nc_sc_pipeline + pick_review_list_nc_sc)
CSV_PATH = EXPORTS / "nc_sc_review_list.csv"
EXCLUDE_ZPIDS_FILE = EXPORTS / "nc_sc_exclude_zpids.txt"
sys.path.insert(0, str(ROOT))


def _env(key: str, fallback: str = "") -> str:
    return os.environ.get(key, fallback).strip()


def _extract_dd_info(row: dict) -> str:
    """
    Extract important DD hints from zoning, red_flags, raw_json.
    Water zoning (bad), wetlands (>30% exclude), road frontage (good), slope (>15% exclude).
    """
    parts = []
    text = " ".join([
        str(row.get("zoning") or ""),
        str(row.get("red_flags") or ""),
        str(row.get("raw_json") or ""),
    ]).lower()

    # Water zoning - bad for subdivision
    if any(k in text for k in ["water", "flood zone", "riparian", "stream", "creek", "buffer", "setback"]):
        parts.append("⚠ Water/flood zoning - may hurt subdivide")

    # Wetlands - exclude if >30%
    if any(k in text for k in ["wetland", "marsh", "swamp", "fema"]):
        parts.append("⚠ Wetland mention - verify % (exclude if >30%)")

    # Road frontage - good
    if any(k in text for k in ["road frontage", "frontage", "county road", "paved road", "state road"]):
        parts.append("✓ Road frontage noted")

    # Slope - exclude if >15%
    if any(k in text for k in ["slope", "steep", "hillside", "grade", "terrain"]):
        parts.append("⚠ Slope mention - verify % (exclude if >15%)")

    return " | ".join(parts) if parts else ""


def _extract_parcel_from_payload(payload: dict) -> str:
    """
    Extract parcel number from a Zillow property-detail payload (e.g. from property-by-zpid).
    Tries common key paths; returns empty string if not found.
    """
    if not isinstance(payload, dict):
        return ""
    # Flat and nested keys seen in Zillow/MLS-style APIs
    candidates = [
        payload.get("parcelNumber"),
        payload.get("parcel_number"),
        payload.get("parcelId"),
        payload.get("taxAssessorParcelNumber"),
        payload.get("apn"),
        payload.get("taxParcelNumber"),
    ]
    for v in candidates:
        if v is not None and str(v).strip():
            return str(v).strip()
    # Nested: property.parcelNumber, details.parcelNumber, homeInfo.parcelNumber, etc.
    for key in ("property", "details", "homeInfo", "hdpData", "data"):
        node = payload.get(key)
        if isinstance(node, dict):
            found = _extract_parcel_from_payload(node)
            if found:
                return found
    # Recursively check one level of dict values (e.g. homeInfo inside property)
    for v in payload.values():
        if isinstance(v, dict):
            found = _extract_parcel_from_payload(v)
            if found:
                return found
    return ""


def _extract_parcel_from_raw_json(row: dict) -> str:
    """Try to get parcel from stored raw_json (search payload) in case it's present."""
    raw = row.get("raw_json")
    if not raw:
        return ""
    try:
        import json
        data = json.loads(raw)
        return _extract_parcel_from_payload(data)
    except (TypeError, ValueError, KeyError):
        return ""


def _zillow_homedetails_url(row: dict) -> str:
    """Build canonical Zillow homedetails URL (full listing page, not mobile/search)."""
    zpid = (row.get("zpid") or "").strip()
    if not zpid or not zpid.isdigit():
        return (row.get("url") or "").strip()
    # Slug: address-style with county (e.g. 0-Gumville-Rd-Jamestown-Berkeley-SC-29453)
    addr = (row.get("address") or "").strip()
    city = (row.get("city") or "").strip()
    county = (row.get("county") or "").replace(" County", "").strip()
    state = (row.get("state") or "").strip()
    zipcode = (row.get("zipcode") or "").strip()
    parts = [p for p in [addr, city, county, state, zipcode] if p]
    raw = " ".join(parts)
    slug = "-".join(re.sub(r"[^a-zA-Z0-9\s\-]", "", raw).split()).strip("-") or "property"
    return f"https://www.zillow.com/homedetails/{slug}/{zpid}_zpid/"


def main() -> None:
    import argparse

    ap = argparse.ArgumentParser(description="Sync a review CSV to Google Sheets")
    ap.add_argument(
        "--csv",
        type=Path,
        default=CSV_PATH,
        help=f"Path to CSV to sync (default: {CSV_PATH})",
    )
    ap.add_argument(
        "--exclude",
        type=Path,
        default=EXCLUDE_ZPIDS_FILE,
        help=f"Exclude zpids file (default: {EXCLUDE_ZPIDS_FILE})",
    )
    ap.add_argument(
        "--tab-prefix",
        default="",
        help="Optional prefix for the new tab name (before SHEETS_SHEET_NAME base).",
    )
    args = ap.parse_args()

    csv_path: Path = args.csv
    exclude_file: Path = args.exclude
    spreadsheet_id = _env("SHEETS_SPREADSHEET_ID") or _env("CDA_SHEETS_SPREADSHEET_ID")
    creds_path = _env("GOOGLE_APPLICATION_CREDENTIALS")
    # New tab each run (preserves your previous work) - override with SHEETS_SHEET_NAME to use fixed tab
    base_name = _env("SHEETS_SHEET_NAME") or _env("CDA_SHEETS_SHEET_NAME") or "NC_SC"
    if args.tab_prefix:
        base_name = f"{args.tab_prefix}{base_name}"
    sheet_name = f"{base_name}_{datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}"

    if not spreadsheet_id or spreadsheet_id == "paste_id_here":
        print("Set SHEETS_SPREADSHEET_ID (or CDA_SHEETS_SPREADSHEET_ID) to your Google Sheet ID.")
        print("Find it in the sheet URL: https://docs.google.com/spreadsheets/d/<THIS_ID>/edit")
        raise SystemExit(1)

    if not csv_path.exists():
        print(f"Missing CSV: {csv_path}")
        raise SystemExit(1)

    try:
        import gspread
        from google.oauth2.service_account import Credentials
    except ImportError:
        print("Install: pip install gspread google-auth")
        raise SystemExit(1)

    if not creds_path or not Path(creds_path).exists():
        print("Set GOOGLE_APPLICATION_CREDENTIALS to the path of your Google service account JSON.")
        print("Create one at: https://console.cloud.google.com/apis/credentials")
        print("Then share the Google Sheet with the service account email (e.g. ...@....iam.gserviceaccount.com).")
        raise SystemExit(1)

    scopes = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive.readonly",
    ]
    creds = Credentials.from_service_account_file(creds_path, scopes=scopes)
    client = gspread.authorize(creds)

    print(f"  Reading {csv_path.name}...", flush=True)
    with csv_path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        all_rows = list(reader)
        raw_fieldnames = reader.fieldnames or list(all_rows[0].keys()) if all_rows else []

    # Load exclude list and drop already-reviewed properties (safety: no duplicates)
    exclude_zpids: set[str] = set()
    if exclude_file.exists():
        for line in exclude_file.open(encoding="utf-8"):
            z = line.strip()
            if z and not z.startswith("#"):
                exclude_zpids.add(z)
    if exclude_zpids:
        before = len(all_rows)
        all_rows = [r for r in all_rows if (r.get("zpid") or "").strip() not in exclude_zpids]
        if before > len(all_rows):
            print(f"  Skipped {before - len(all_rows)} already-excluded zpids.", flush=True)

    from modules.dedup import add_to_seen, is_duplicate

    seen_zpid: set[str] = set()
    seen_addr: set[str] = set()
    rows: list[dict] = []
    for r in all_rows:
        if is_duplicate(r, seen_zpid, seen_addr):
            continue
        add_to_seen(r, seen_zpid, seen_addr)
        rows.append(r)

    # Populate parcel_id when possible: from raw_json first, then from enrichment API if configured
    import time
    from config import ZILLOW_PROPERTY_BY_ZPID_ENDPOINT, MIN_SECONDS_BETWEEN_REQUESTS
    for r in rows:
        r["parcel_id"] = _extract_parcel_from_raw_json(r)
    if ZILLOW_PROPERTY_BY_ZPID_ENDPOINT:
        from modules.zillow.service import ZillowService
        svc = ZillowService()
        for i, r in enumerate(rows):
            zpid = (r.get("zpid") or "").strip()
            if not zpid or not zpid.isdigit():
                continue
            if r.get("parcel_id"):
                continue  # already have from raw_json
            payload = svc.enrich_by_zpid(zpid)
            if payload:
                r["parcel_id"] = _extract_parcel_from_payload(payload)
            if (i + 1) < len(rows):
                time.sleep(max(0.5, MIN_SECONDS_BETWEEN_REQUESTS))
        if svc.request_count:
            print(f"  Enrichment: {svc.request_count} property-by-zpid calls (for Parcel ID).", flush=True)

    if not rows:
        print("No rows in CSV (or all excluded). Run pick again after pipeline refreshes data.")
        raise SystemExit(1)

    # Friendly column order and labels (agent uses row index; keep id/zpid for reference)
    COLUMNS = [
        ("address", "Address"),
        ("url", "Zillow Link"),   # clickable link for due diligence
        ("_parcel_link", "Parcel Lookup"),  # computed: Google search for county assessor/GIS
        ("parcel_id", "Parcel ID"),   # from enrichment API or raw_json when available
        ("_dd_info", "DD Info"),  # computed: water/wetland/road/slope hints
        (None, "Image"),   # blank for user to insert images (Insert > Image > Image in cell)
        ("county", "County"),
        ("city", "City"),
        ("state", "State"),
        ("zipcode", "Zip"),
        ("price", "Price ($)"),
        ("acres", "Acres"),
        ("days_on_market", "DOM"),
        ("score", "Score"),
        ("status", "Status"),
        ("roi_pct", "ROI (%)"),
        ("net_profit", "Net Profit ($)"),
        ("red_flags", "Red Flags"),
        (None, "DD Status"),   # your status: Todo / In progress / Done
        (None, "DD Notes"),    # your notes
        ("id", "id"),
        ("zpid", "zpid"),
        ("price_per_acre", "Price/Acre"),
    ]
    header = [label for _, label in COLUMNS]
    key_for_col = [key for key, _ in COLUMNS]

    sheet = client.open_by_key(spreadsheet_id)
    wks = sheet.add_worksheet(title=sheet_name, rows=100, cols=len(header))

    data = []
    for row in rows:
        r = []
        for col_idx, key in enumerate(key_for_col):
            if key is None:
                # Blank columns for user to fill (Image, DD Status, DD Notes)
                r.append("")
            elif key == "_dd_info":
                r.append(_extract_dd_info(row))
            elif key == "url":
                # Use canonical homedetails URL (full listing page) not API/mobile links
                url = _zillow_homedetails_url(row)
                if url and url.startswith("http"):
                    safe_url = url.replace('"', '""')
                    r.append(f'=HYPERLINK("{safe_url}","View on Zillow")')
                else:
                    r.append(url or "")
            elif key == "parcel_id":
                r.append((row.get("parcel_id") or "").strip())
            elif key == "_parcel_link":
                # Free parcel lookup: Google search surfaces county assessor/GIS reliably
                addr = (row.get("address") or "").strip()
                county = (row.get("county") or "").replace(" County", "").strip()
                state = (row.get("state") or "").strip()
                q = f"parcel tax records {addr} {county} {state}"
                search_url = f"https://www.google.com/search?q={quote_plus(q)}"
                safe_url = search_url.replace('"', '""')
                r.append(f'=HYPERLINK("{safe_url}","Lookup Parcel")')
            else:
                val = row.get(key, "")
                r.append(val if val is not None else "")
        data.append(r)

    # Row 7 = header, row 8+ = data
    blank = [[""] * len(header)] * 6
    grid = blank + [header] + data

    print(f"  Updating sheet with {len(data)} properties...", flush=True)
    wks.clear()
    wks.update(grid, value_input_option="USER_ENTERED")

    # Bold header row (row 7) and align for readability
    try:
        wks.format("7:7", {"textFormat": {"bold": True}})
        wks.format("A7:U7", {"horizontalAlignment": "LEFT", "wrapStrategy": "WRAP"})
    except Exception:
        pass

    # Set row height for data rows (row 8+) to fit images; widen Image column
    try:
        sheet_id = wks.id
        n_data = len(data)
        requests = []
        if n_data > 0:
            requests.append({
                "updateDimensionProperties": {
                    "range": {
                        "sheetId": sheet_id,
                        "dimension": "ROWS",
                        "startIndex": 7,
                        "endIndex": 7 + n_data,
                    },
                    "properties": {"pixelSize": 120},
                    "fields": "pixelSize",
                }
            })
            # Image column is column F (0-indexed: 5); width 180px for photos
            requests.append({
                "updateDimensionProperties": {
                    "range": {
                        "sheetId": sheet_id,
                        "dimension": "COLUMNS",
                        "startIndex": 5,
                        "endIndex": 6,
                    },
                    "properties": {"pixelSize": 180},
                    "fields": "pixelSize",
                }
            })
            sheet.batch_update({"requests": requests})
    except Exception as e:
        print(f"  Note: Could not set row/column sizes: {e}", flush=True)

    print(f"Created new tab '{sheet_name}' with {len(data)} properties.")
    print(f"URL: https://docs.google.com/spreadsheets/d/{spreadsheet_id}/edit")

    # Append synced zpids to exclude list so next run shows only NEW properties
    # Supports numeric (API) and composite (CSV import) zpids
    zpids_synced = [str(r.get("zpid", "")).strip() for r in rows if r.get("zpid")]
    zpids_synced = [z for z in zpids_synced if z]
    if zpids_synced:
        existing = set()
        if EXCLUDE_ZPIDS_FILE.exists():
            for line in EXCLUDE_ZPIDS_FILE.open(encoding="utf-8"):
                z = line.strip()
                if z and not z.startswith("#"):
                    existing.add(z)
        new_zpids = [z for z in zpids_synced if z not in existing]
        if new_zpids:
            with EXCLUDE_ZPIDS_FILE.open("a", encoding="utf-8") as f:
                f.write("\n")
                f.write("\n".join(new_zpids))
                f.write("\n")
            print(f"Added {len(new_zpids)} zpids to exclude list (next run = new properties only).")


if __name__ == "__main__":
    main()
