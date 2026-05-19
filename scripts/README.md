# Scrape AI Land Dealz (zipcodes + colors + sell-through)

## Run the scraper

```bash
npm install
node scripts/scrape-ailanddealz-with-colors.js NC
node scripts/scrape-ailanddealz-with-colors.js TN
node scripts/scrape-ailanddealz-with-colors.js OH
```

Log in at `app.ailanddealz.com` when the browser opens, then press ENTER.

## Output

**`data/scraped-{state}-zipcodes.csv`**
```
State,Zip,County,Green,Yellow,Red,Parcels,Zip_STR_6mo,Zip_STR_12mo,County_STR_6mo,County_STR_12mo,County_Parcels
```

**`data/scraped-{state}-counties.csv`**
```
State,County,Parcels,STR_6mo,STR_12mo
```

Colors come only from inline `style="color:..."` on the site (real Red/Green/Yellow).

## States

Predefined IDs: NC(38), SC(48), FL(12), GA(13), TN(47), OH(39), AZ(4).

If the wrong state loads, pick the state on the site and use `--state-id=NN` from the URL.
