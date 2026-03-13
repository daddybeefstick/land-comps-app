# NC + SC Subdivision Pipeline

**Focus: North Carolina and South Carolina only.**

Uses Zillow County Sales data (NC PDF) to prioritize the best counties, then fetches land listings for subdivision candidates (20–50 acres, under $500k).

See **HOW_IT_WORKS.md** for the full step-by-step flow.

## Setup

1. **Create `.env`** (copy from `.env.example`):
   ```
   RAPIDAPI_KEY=your_key        # Only needed for API collect; omit for CSV-only
   RAPIDAPI_HOST=private-zillow.p.rapidapi.com
   DATABASE_PATH=database/deals.db
   ```

2. **Install deps:**
   ```bash
   pip install -r requirements.txt
   ```

## Run (NC + SC only)

### Option A: Zillow API (requires RAPIDAPI_KEY)
```bash
python run_nc_sc_pipeline.py
```

### Option B: CSV import (no API, free)
When API quota is exhausted, import listings from a CSV instead:
```bash
python run_nc_sc_pipeline.py --from-csv path/to/your_listings.csv
```

**CSV format:** Required columns: `address`, `state`, `county`, `city`, `zipcode`, `price`, `acres`. Optional: `url`, `days_on_market`, `zpid`. See `exports/nc_sc_import_template.csv` for an example.

**Where to get data:** LandWatch, manual Zillow/Realtor.com search, or any export that has those fields. For NC/SC, green-zone zipcode filter applies when `scraped-nc-zipcodes.xlsx` is present.

### Shared steps (after collect or import)
```bash
# 2. Pick candidates for review (default 50; use --pick 100 for high-volume check-and-burn)
python scripts/pick_review_list_nc_sc.py
python scripts/pick_review_list_nc_sc.py --pick 100   # more to triage through

# 3. Push to Google Sheet (preserves your Parcel #, DD Status, DD Notes)
python scripts/sync_review_list_to_sheet.py
```

**Check-and-burn workflow:** Pick 100+ properties, sync to sheet, mark rejects in DD Status. Synced zpids go to the exclude list so next run shows only new ones. CSV imports (composite zpids) are excluded too.

**Sheet columns:** Parcel ID (fill after lookup), DD Info (auto-extracted: water zoning, wetlands, road frontage, slope), Image (insert photos via Insert > Image > Image in cell). Rows are sized for images.

## Outputs

| File | Description |
|------|-------------|
| `exports/nc_sc_pipeline_all_scored.csv` | All scored NC+SC properties |
| `exports/nc_sc_pipeline_results.csv` | Non-reject only |
| `exports/nc_sc_review_list.csv` | Top 50 picks for manual review |
| `exports/nc_sc_review_list.txt` | Readable list |

Best NC counties (from PDF): Brunswick, Johnston, Davidson, Surry, Stokes, Warren, Randolph, Granville, Pasquotank, Rowan, Onslow, Caswell, Haywood, Burke, Scotland, Cumberland, Pender, Cabarrus, Person, Franklin, Nash, Lincoln, Moore, Craven, Gaston, Catawba, Wake, Lenoir, Currituck, Cleveland.
