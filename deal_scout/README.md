# Deal Scout Clean Build

This is a clean rebuild of your land subdivision scout system centered on the Private-Zillow RapidAPI source instead of brittle website scraping.

## What this build does
- Pulls land listings from the Private-Zillow API
- Filters to 5–50 acres and under $500,000
- Stores listings in SQLite
- Calculates county median price-per-acre from collected listings
- Scores deals and estimates lots, profit, ROI, and your 5% commission
- Exports CSV results
- Generates one-page PDF reports
- Shows results in a Streamlit dashboard

## What you need first
1. A RapidAPI account
2. A subscription to the `private-zillow` API on RapidAPI
3. Your RapidAPI key

## How to find your RapidAPI key
RapidAPI says your key appears in generated code snippets for an API endpoint, and you can also find it in the Developer Dashboard under **Apps → Authorization**. citeturn0search11

Practical path:
1. Open the API page on RapidAPI.
2. Open any endpoint test/code snippet panel.
3. Look for the `X-RapidAPI-Key` value.
4. Or go to your RapidAPI dashboard, open your app, then open **Authorization**.

## Setup
```bash
cd deal_scout_clean
python3 -m venv .venv
source .venv/bin/activate
pip3 install -r requirements.txt
cp .env.example .env
```

Then edit `.env` and paste your real key:
```env
RAPIDAPI_KEY=your_real_key_here
RAPIDAPI_HOST=private-zillow.p.rapidapi.com
DATABASE_PATH=database/deals.db
```

## Run it
First test the collector:
```bash
python3 main.py collect --states TX
```

Then score the data:
```bash
python3 main.py score
```

Run the full pipeline:
```bash
python3 main.py run
```

Export CSV:
```bash
python3 main.py export
```

Launch dashboard:
```bash
streamlit run dashboard/app.py
```

Generate one PDF report for a chosen address:
```bash
python3 main.py report --address "123 Example Rd"
```

## Important note about the API schema
The collector is written defensively because unofficial Zillow-style APIs often vary in field names and nesting. Your first live API call may show that `/search` returns slightly different parameter names or response keys than assumed here.

That is normal.

If that happens, do this in Cursor:
1. Run `python3 main.py collect --states TX`
2. Copy the error or print the raw JSON response
3. Patch only `modules/collector.py`

The rest of the project should stay stable.

## What to verify manually before pitching a deal
- County zoning and minimum lot size
- Road frontage and legal access
- FEMA flood map
- Wetlands
- Utilities or septic feasibility
- Deed restrictions / HOA rules
- Terrain and shape

## Suggested next build step in Cursor
Tell Cursor:

```text
Use my first live RapidAPI response to patch only modules/collector.py so the /search request params and response parsing exactly match the real private-zillow schema. Do not rewrite the rest of the repo.
```
