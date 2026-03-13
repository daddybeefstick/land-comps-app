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
    spreadsheet_id = _env("SHEETS_SPREADSHEET_ID") or _env("CDA_SHEETS_SPREADSHEET_ID")
    creds_path = _env("GOOGLE_APPLICATION_CREDENTIALS")
    # New tab each run (preserves your previous work) - override with SHEETS_SHEET_NAME to use fixed tab
    base_name = _env("SHEETS_SHEET_NAME") or _env("CDA_SHEETS_SHEET_NAME") or "NC_SC"
    sheet_name = f"{base_name}_{datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}"

    if not spreadsheet_id or spreadsheet_id == "paste_id_here":
        print("Set SHEETS_SPREADSHEET_ID (or CDA_SHEETS_SPREADSHEET_ID) to your Google Sheet ID.")
        print("Find it in the sheet URL: https://docs.google.com/spreadsheets/d/<THIS_ID>/edit")
        raise SystemExit(1)

    if not CSV_PATH.exists():
        print(f"Run run_nc_sc_pipeline.py then pick_review_list_nc_sc.py first.")
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

    print(f"  Reading {CSV_PATH.name}...", flush=True)
    with CSV_PATH.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        all_rows = list(reader)
        raw_fieldnames = reader.fieldnames or list(all_rows[0].keys()) if all_rows else []

    # Load exclude list and drop already-reviewed properties (safety: no duplicates)
    exclude_zpids: set[str] = set()
    if EXCLUDE_ZPIDS_FILE.exists():
        for line in EXCLUDE_ZPIDS_FILE.open(encoding="utf-8"):
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

    if not rows:
        print("No rows in CSV (or all excluded). Run pick again after pipeline refreshes data.")
        raise SystemExit(1)

    # Friendly column order and labels (agent uses row index; keep id/zpid for reference)
    COLUMNS = [
        ("address", "Address"),
        ("url", "Zillow Link"),   # clickable link for due diligence
        ("_parcel_link", "Parcel Lookup"),  # computed: Google search for county assessor/GIS
        (None, "Parcel ID"),   # blank for user to fill after lookup
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
                # Blank columns for user to fill (Parcel ID, Image, DD Status, DD Notes)
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
