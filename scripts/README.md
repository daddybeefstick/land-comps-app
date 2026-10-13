# Scrape AI Land Dealz (zipcodes + colors + sell-through)

Matches the Land Sell USA workflow: Search → State → each county → all zips with Red/Green/Yellow + sell-through rates.

## Run

```powershell
cd C:\Users\wjc32\land-comps-app
node scripts/scrape-ailanddealz-with-colors.js NC
```

1. Browser opens → log in at app.ailanddealz.com (one-time session saved).
2. Press ENTER in the terminal.
3. Script visits each county, paginates zips, writes CSVs.

**Wrong state?** Open the site, click the state, copy `state_id` from the URL:

```powershell
node scripts/scrape-ailanddealz-with-colors.js --state-id=48
```

Verified: NC=38, SC=48, FL=12, GA=13. Do **not** use TN=47 (that is Rhode Island on the site).

## Output

| File | Contents |
|------|----------|
| `data/scraped-nc-zipcodes.csv` | Every zip: Green/Yellow/Red, zip STR 6mo/12mo, county STR 6mo/12mo |
| `data/scraped-nc-counties.csv` | County parcels + STR 6mo/12mo |

Import both into Google Sheets for Alex.

## Re-run NC

Older `scraped-nc-zipcodes.csv` files may lack sell-through columns. Run again with the command above to refresh.
