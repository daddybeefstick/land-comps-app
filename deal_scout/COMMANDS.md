# Commands — Deal Scout

Copy-paste these (set env vars once per terminal session, then run as needed).

---

## 1. Set environment variables (run once per terminal)

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/Users/wcovert/Downloads/vibrant-magpie-489607-k4-39a4bb5930d6.json"
export CDA_SHEETS_SPREADSHEET_ID="1ReXX_N9-wE23Tpw7TaqxN5U_CK2Dfot6qiYwUakIyqA"
export CDA_SHEETS_SHEET_NAME="TX_Review_Queue"
```

---

## 2. Refresh the 20-property list and push to the sheet

Run from **deal_scout_clean**:

```bash
cd /Users/wcovert/Downloads/deal_scout_clean

# Optional: re-run pipeline (collect + score TX)
python3 run_tx_pipeline.py

# Pick 20 properties (high sell-through / active areas)
python3 scripts/pick_review_list.py

# Push to Google Sheet
python3 scripts/sync_review_list_to_sheet.py
```

The sheet has your 20 properties with Address, County, Price, Acres, DOM, Score, Status, ROI, Net Profit, Red Flags, plus **DD Status** and **DD Notes** for your own tracking. Use the sheet as your list and do due diligence yourself (county GIS, FEMA, utilities, etc.) as you like.
