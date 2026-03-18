# Summary Sheet Data Mapping Fix — Design Spec

**Date:** 2026-03-18
**Status:** Draft
**Files:** `scripts/zillow-circle-via-api.user.js`, `scripts/zillow-sheets-app-script.gs`

## Problem

The data pipeline from the Zillow userscript panel to the Google Sheets Summary sheet is broken:
- Column A stores a "session label" instead of the property address
- The panel lacks input fields for Acres and Parent Price Zillow
- The target row field is wiped on page navigation (savePanelState bug)
- Header text in the Apps Script doesn't match the desired column names
- Row 1 group header merge spans are off by one column in places

## Desired Column Layout (Source of Truth)

| Col | Header | Content |
|-----|--------|---------|
| A | Address | Property address (entered in panel) |
| B | Acres | Acreage (entered in panel) |
| C | Parent Price Zillow | Asking price (entered in panel) |
| D | Target Buy Price (min 50% profit) | Formula: `=IFERROR(MIN(X*0.5, C), "")` |
| E | Min Profit | Formula: `=X-C` |
| F | Profit at Discount (min 50% profit) | Formula: `=IFERROR(X-D, "")` |
| G | Acreage | Lot size label from panel (e.g. "3-7 acres") |
| H | For Sale (90d) | For sale count (same value in H, M, R) |
| I | Sold (last 90 days) | Sold count |
| J | Sell Thru Ratio | Formula: `=IFERROR(I/H, "")` |
| K | Sold Avg $ 90 days | Average sale price |
| L | Median $ 90 days | Median sale price |
| M | For Sale (6m) | For sale count (same value as H) |
| N | Sold (last 6 months) | Sold count |
| O | Ratio | Formula: `=IFERROR(N/M, "")` |
| P | Sold Avg $ 6 months | Average sale price |
| Q | Median $ 6 month | Median sale price |
| R | For Sale (12m) | For sale count (same value as H) |
| S | Sold (last 12 months) | Sold count |
| T | Ratio | Formula: `=IFERROR(S/R, "")` |
| U | Sold Avg $ 12 months | Average sale price |
| V | Median $ 12 months | Median sale price |
| W | Trend | Formula: `=IFERROR(ROUND(T/O, 2), "")` |
| X | Total Retail $ All Child Parcels | Formula varies by acreage (see below) |

**Column X formulas:**
- 3-7 acres: `=IFERROR(FLOOR(B/5,1)*((K+P+U)/3)*0.8, "")`
- 8-15 acres: `=IFERROR(FLOOR(B/10,1)*((K+P+U)/3)*0.8, "")`

## Changes

### 1. Userscript (`zillow-circle-via-api.user.js`)

#### Rename "Session label" to "Address"
- Change input label from "Session label" to "Address"
- Change placeholder to `"123 Main St, City, ST"`
- The value continues to be sent as `session` in the JSON payload (transport field name unchanged for simplicity)
- Default value generation removed — field starts empty or restored from saved state

#### Add Acres input
- New number input field in the Sheets section (below divider, after Address)
- Label: "Acres"
- Sent as `meta.acres`
- Persisted in `savePanelState()` and restored on page load

#### Add Parent Price input
- New number input field after Acres
- Label: "Parent Price Zillow"
- Placeholder: `"$150,000"`
- Sent as `meta.parcelPrice`
- Persisted in `savePanelState()` and restored on page load

#### Fix targetRow persistence
- Add `targetRow: targetRowInput.value` to the `savePanelState()` call inside the goBtn click handler
- Also add `acres` and `parentPrice` values to the same save call
- Restore all three on page load from saved state

#### No changes needed
- `scrapeListings()` — "End of matching results" boundary already implemented
- `sendToSheets()` — transport unchanged
- For Sale type handling — triplication to H, M, R is correct as-is

### 2. Apps Script (`zillow-sheets-app-script.gs`)

#### COL name updates (positions unchanged)
| Old name | New name | Col | Letter |
|----------|----------|-----|--------|
| `area` | `address` | 1 | A |
| `parcelPrice` | `parentPrice` | 3 | C |
| `amountCalc` | `targetBuyPrice` | 4 | D |
| `avgMonthCalc` | `totalRetail` | 24 | X |

All other COL names stay the same.

#### `initHeaders()` updates

**Row 1 group headers** — fix merge spans to exactly 5 cols per group:
- Cols 1-7: blank (left side)
- Cols 8-12 (H-L): "90 Days" — 5 cols
- Cols 13-17 (M-Q): "6 Months" — 5 cols
- Cols 18-22 (R-V): "12 Months" — 5 cols
- Col 23 (W): "Trend"
- Col 24 (X): "Total Retail $"

**Row 2 headers** — exact text:
```
Address, Acres, Parent Price Zillow,
Target Buy Price (min 50% profit), Min Profit, Profit at Discount (min 50% profit),
Acreage,
For Sale (90d), Sold (last 90 days), Sell Thru Ratio, Sold Avg $ 90 days, Median $ 90 days,
For Sale (6m), Sold (last 6 months), Ratio, Sold Avg $ 6 months, Median $ 6 month,
For Sale (12m), Sold (last 12 months), Ratio, Sold Avg $ 12 months, Median $ 12 months,
Trend, Total Retail $ All Child Parcels
```

#### `doPost()` updates
- Rename `session` variable to `address` for clarity
- Column A: `sheet.getRange(r, COL.address).setValue(address)` (was `session`)
- Keep `meta.acres` and `meta.parcelPrice` handling (already correct)

#### `findOrCreateRow()` updates
- Match on `address` + `acreage` instead of `session` + `acreage`
- Parameter rename: `session` → `address`

#### No changes needed
- For Sale handling: triplication to H, M, R stays
- All formulas: already correct
- `formatRow()`: already correct (just uses COL references which will be renamed)
- `computeMedian()`: unchanged

## Data Flow (After Fix)

```
Panel inputs:
  Address → payload.session → Apps Script → Column A
  Acres → meta.acres → Apps Script → Column B
  Parent Price → meta.parcelPrice → Apps Script → Column C
  Lot size preset → meta.lotLabel → Apps Script → Column G
  Target row → meta.targetRow → Apps Script → row selection

Scraped data (per send):
  type=for_sale → count → H, M, R
  type=sold_90d → count → I, avg → K, median → L
  type=sold_6m → count → N, avg → P, median → Q
  type=sold_12m → count → S, avg → U, median → V

Formulas (set by Apps Script on each send):
  D = MIN(X*0.5, C)
  E = X - C
  F = X - D
  J = I/H
  O = N/M
  T = S/R
  W = ROUND(T/O, 2)
  X = FLOOR(B/divisor, 1) * ((K+P+U)/3) * 0.8
```

## Out of Scope

- `zillow-search-panel.user.js` — not used, not updated
- Circle search / GraphQL region logic — unchanged
- Hide/unhide listing buttons — unchanged
- Sheet formatting colors/styles — unchanged (already correct)
