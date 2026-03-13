# Project Transfer Prompt for ChatGPT / Codex

Copy everything below the line into a new ChatGPT chat to hand off this project.

---

## Project Handoff: NC/SC Subdivision Deal Scout

I'm transferring a Python project called **NC/SC Deal Scout**. It finds 20–50 acre subdivision land parcels in North Carolina and South Carolina via the Zillow API, scores them, and pushes the best candidates to a Google Sheet for manual review.

### What it does

1. **Collect** – Fetches land listings from Zillow (Lots & Land, 20–50 acres, under $500k, NC+SC only) with pagination (10 pages per region).
2. **Score** – Scores each property by ROI, price vs county median, days on market, zoning hints, and red flags (flood, wetland, HOA).
3. **Pick** – Selects top 50 candidates, excluding properties in `nc_sc_exclude_zpids.txt` (already reviewed).
4. **Sync** – Pushes to Google Sheets with Zillow links, Parcel Lookup links, and blank Parcel/DD columns. Creates a new timestamped tab each run.
5. **PDF** – Exports a deduplicated PDF review queue.
6. **Exclusion** – After each sync, appends synced zpids to the exclude file so the next run shows only new properties.

### Project structure

```
deal_scout/
├── .env                          # RAPIDAPI_KEY, SHEETS_SPREADSHEET_ID, GOOGLE_APPLICATION_CREDENTIALS
├── config.py                     # MIN_ACRES=20, MAX_ACRES=50, pagination, bounds
├── run_nc_sc_pipeline.py         # Main pipeline: collect → score → export
├── main.py                       # CLI: collect, score, run, report
├── best_counties_nc_sc.py        # Best NC counties from Zillow PDF
├── modules/
│   ├── collector.py              # Zillow API, pagination, dedup
│   ├── filter.py                 # Scoring logic
│   ├── dedup.py                  # Address normalization, zpid+address dedup
│   ├── profit_calc.py
│   └── checklist.py
├── scripts/
│   ├── pick_review_list_nc_sc.py # Picks top 50, respects exclude list
│   ├── sync_review_list_to_sheet.py  # Google Sheets + auto-append to exclude
│   ├── export_review_list_to_pdf.py  # Deduplicated PDF
│   └── test_dedup.py
├── exports/
│   ├── nc_sc_pipeline_all_scored.csv   # All scored NC+SC
│   ├── nc_sc_review_list.csv           # Picked candidates
│   └── nc_sc_exclude_zpids.txt         # One zpid per line (already reviewed)
├── database/deals.db
└── requirements.txt
```

### Environment (.env)

```
RAPIDAPI_KEY=your_key
RAPIDAPI_HOST=private-zillow.p.rapidapi.com

# Google Sheet sync
SHEETS_SPREADSHEET_ID=your_sheet_id
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json
```

### Run commands (in order)

```bash
cd deal_scout
python run_nc_sc_pipeline.py
python scripts/pick_review_list_nc_sc.py
python scripts/sync_review_list_to_sheet.py
python scripts/export_review_list_to_pdf.py
```

One-liner: `python run_nc_sc_pipeline.py; python scripts/pick_review_list_nc_sc.py; python scripts/sync_review_list_to_sheet.py; python scripts/export_review_list_to_pdf.py`

### Key implementation details

- **Dedup**: `modules/dedup.py` – Normalizes addresses (strips Lot X, Unit X, TBD; expands Trl→trail, Rd→road, etc.) so "448 Batts Island Rd" and "448 Batts Island Rd Lot 33" match.
- **Exclude list**: `exports/nc_sc_exclude_zpids.txt` – One zpid per line. Pick skips these. Sync appends newly synced zpids so each run = new properties only.
- **Pagination**: `config.py` has `COLLECTOR_MAX_PAGES_PER_REGION = 10`. Collector fetches up to 10 pages per region (NC has 2 regions, SC has 2).
- **Google Sheets**: Share the sheet with the service account email. Sync creates a new tab `NC_SC_YYYY-MM-DD_HH-MM-SS` each run.

### Files to include when transferring

Include the entire `deal_scout` folder. Exclude: `.env` (contains secrets), `__pycache__`, `.venv`, `database/deals.db` (can be recreated). Include: `.env.example`, all `.py`, `requirements.txt`, `.md` docs.

### Dependencies

```
pandas, requests, python-dotenv, reportlab, gspread, google-auth, openpyxl
```

Run `pip install -r requirements.txt`.

### Known quirks

- Zillow returns similar inventory between runs; the exclude list is how we avoid re-showing reviewed properties.
- PowerShell uses `;` instead of `&&` for chaining commands.
- If you see duplicates (e.g. "Sheets Trl" vs "Sheets Trail"), add street abbreviation normalization in `dedup.py`.
- PDF export: use `export_review_list_to_pdf.py` (reads from CSV, dedupes) rather than exporting the sheet to PDF (multiple tabs = repeated pages).

---

*End of transfer prompt*
