# Summary Sheet Data Mapping Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the broken data pipeline from the Zillow userscript panel to the Google Sheets Summary sheet — correct column mappings, add missing inputs, fix persistence bugs, and align headers.

**Architecture:** Two files changed in parallel — the Tampermonkey userscript (client/sender) and the Google Apps Script (server/receiver). No new files. Column positions (1-24) stay the same; we're fixing labels, data routing, and missing fields.

**Tech Stack:** JavaScript (Tampermonkey userscript), Google Apps Script (server-side JS), Google Sheets.

**Spec:** `docs/superpowers/specs/2026-03-18-summary-sheet-data-mapping-fix-design.md`

**Note:** These are browser/server scripts with no automated test framework. Each task includes manual verification steps. "Testing" means deploying and sending data through the real pipeline.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `scripts/zillow-sheets-app-script.gs` | Modify | Apps Script receiver — COL renames, header fixes, variable renames |
| `scripts/zillow-circle-via-api.user.js` | Modify | Userscript panel — rename Session→Address, add Acres/Price inputs, fix persistence |

---

### Task 1: Apps Script — Rename COL keys and update all references

**Files:**
- Modify: `scripts/zillow-sheets-app-script.gs:23-48` (COL definition)
- Modify: `scripts/zillow-sheets-app-script.gs:79,94,131-134,160,163,197-199,302-303,306,308-309,315` (all reference sites)

- [ ] **Step 1: Rename the four COL keys and update comments in the definition block (lines 23-48)**

Replace the entire COL block with:
```js
const COL = {
  address:        1,   // A  Address
  acres:          2,   // B  Acres
  parentPrice:    3,   // C  Parent Price Zillow
  targetBuyPrice: 4,   // D  =MIN(X*0.5, C)
  minProfit:      5,   // E  =X-C
  profitDiscount: 6,   // F  =X-D
  acreage:        7,   // G  lot size label from panel
  for_sale:       8,   // H
  sold_90d:       9,   // I
  ratio_90d:     10,   // J  =I/H
  avg_90d:       11,   // K  Sold Avg $ 90 days
  med_90d:       12,   // L  Median $ 90 days
  for_sale2:     13,   // M  For Sale repeated (ref for 6m ratio)
  sold_6m:       14,   // N
  ratio_6m:      15,   // O  =N/M
  avg_6m:        16,   // P
  med_6m:        17,   // Q
  for_sale3:     18,   // R  For Sale repeated (ref for 12m ratio)
  sold_12m:      19,   // S
  ratio_12m:     20,   // T  =S/R
  avg_12m:       21,   // U
  med_12m:       22,   // V
  trend:         23,   // W  =ROUND(T/O,2)
  totalRetail:   24,   // X  =FLOOR(B/5or10,1)*((K+P+U)/3)*0.8
};
```

- [ ] **Step 2: Update all COL references throughout the file**

Find and replace these exact tokens (do NOT partial-match — use `COL.area` not just `area`):

| Old reference | New reference | Lines (approx) |
|---|---|---|
| `COL.area` | `COL.address` | 79, 306 |
| `COL.parcelPrice` | `COL.parentPrice` | 94, 160, 197, 302, 308 |
| `COL.amountCalc` | `COL.targetBuyPrice` | 132, 163, 197, 303, 309 |
| `COL.avgMonthCalc` | `COL.totalRetail` | 131, 199, 315 |

Update comments near those references too (e.g., line 159 "Parcel Price (C)" → "Parent Price (C)", line 162 "Amount Calculated (D)" → "Target Buy Price (D)").

- [ ] **Step 3: Verify no old key names remain**

Search the file for `COL.area`, `COL.parcelPrice`, `COL.amountCalc`, `COL.avgMonthCalc`. All should return zero matches.

- [ ] **Step 4: Commit**

```bash
git add scripts/zillow-sheets-app-script.gs
git commit -m "fix(apps-script): rename COL keys to match desired sheet layout"
```

---

### Task 2: Apps Script — Fix initHeaders() row 1 and row 2

**Files:**
- Modify: `scripts/zillow-sheets-app-script.gs:260-317` (initHeaders function)

- [ ] **Step 1: Fix Row 1 group header merge spans and text (lines 261-284)**

Replace the entire Row 1 section (lines 261-284) with:
```js
  // Row 1: left side blank, group headers dark blue / white text
  sheet.getRange(1, 1, 1, 7).merge().setValue('').setBackground(WHITE);

  sheet.getRange(1, 8, 1, 5).merge()
    .setValue('90 Days')
    .setBackground(DARK_BLUE).setFontWeight('bold').setFontColor(WHITE)
    .setHorizontalAlignment('center');

  sheet.getRange(1, 13, 1, 5).merge()
    .setValue('6 Months')
    .setBackground(DARK_BLUE).setFontWeight('bold').setFontColor(WHITE)
    .setHorizontalAlignment('center');

  sheet.getRange(1, 18, 1, 5).merge()
    .setValue('12 Months')
    .setBackground(DARK_BLUE).setFontWeight('bold').setFontColor(WHITE)
    .setHorizontalAlignment('center');

  sheet.getRange(1, 23).setValue('Trend')
    .setFontWeight('bold').setWrap(true)
    .setBackground(DARK_BLUE).setFontColor(WHITE);

  sheet.getRange(1, 24).setValue('Total Retail $')
    .setFontWeight('bold').setWrap(true)
    .setBackground(DARK_BLUE).setFontColor(WHITE);
```

- [ ] **Step 2: Update Row 2 header text array (lines 287-297)**

Replace the `h2` array with:
```js
  var h2 = [
    'Address', 'Acres', 'Parent Price Zillow',
    'Target Buy Price (min 50% profit)', 'Min Profit',
    'Profit at Discount (min 50% profit)', 'Acreage',
    'For Sale (90d)', 'Sold (last 90 days)', 'Sell Thru Ratio',
    'Sold Avg $ 90 days', 'Median $ 90 days',
    'For Sale (6m)', 'Sold (last 6 months)', 'Ratio',
    'Sold Avg $ 6 months', 'Median $ 6 month',
    'For Sale (12m)', 'Sold (last 12 months)', 'Ratio',
    'Sold Avg $ 12 months', 'Median $ 12 months',
    'Trend', 'Total Retail $ All Child Parcels',
  ];
```

- [ ] **Step 3: Update header color references (lines 301-303)**

These lines reference renamed COL keys. Update:
```js
  // "Parent Price Zillow" header (C2) — RED text, "Target Buy Price" header (D2) — PURPLE text
  sheet.getRange(2, COL.parentPrice).setFontColor(RED);
  sheet.getRange(2, COL.targetBuyPrice).setFontColor(PURPLE);
```

- [ ] **Step 4: Update column width references (lines 306-315)**

```js
  sheet.setColumnWidth(COL.address, 300);
  sheet.setColumnWidth(COL.acres, 60);
  sheet.setColumnWidth(COL.parentPrice, 100);
  sheet.setColumnWidth(COL.targetBuyPrice, 160);
  sheet.setColumnWidth(COL.minProfit, 80);
  sheet.setColumnWidth(COL.profitDiscount, 120);
  sheet.setColumnWidth(COL.acreage, 70);
  for (var c = 8; c <= 22; c++) sheet.setColumnWidth(c, 95);
  sheet.setColumnWidth(COL.trend, 80);
  sheet.setColumnWidth(COL.totalRetail, 110);
```

- [ ] **Step 5: Commit**

```bash
git add scripts/zillow-sheets-app-script.gs
git commit -m "fix(apps-script): update initHeaders with correct merge spans and header text"
```

---

### Task 3: Apps Script — Update doPost() and findOrCreateRow()

**Files:**
- Modify: `scripts/zillow-sheets-app-script.gs:51-76` (doPost)
- Modify: `scripts/zillow-sheets-app-script.gs:227-241` (findOrCreateRow)

- [ ] **Step 1: Rename session → address in doPost() (lines 56, 75, 78-79, 94, 140)**

Change line 56:
```js
    const address  = (payload.session || new Date().toISOString()).slice(0, 100);
```
Note: the `payload.session` fallback is kept intentionally as a defensive server-side backup.

Change line 75 (findOrCreateRow call):
```js
      r = findOrCreateRow(sheet, address, meta.lotLabel || '');
```

Change line 78 comment and line 79:
```js
    // Set address and acreage
    sheet.getRange(r, COL.address).setValue(address);
```

Change line 94 (parcelPrice → parentPrice COL reference):
```js
        sheet.getRange(r, COL.parentPrice).setValue(priceVal);
```

Change line 140 (keep `session` key name in response JSON for backward compat — the userscript reads `body.row` not `body.session`, so this is just informational):
```js
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, session: address, type: type, count: count, row: rc }))
      .setMimeType(ContentService.MimeType.JSON);
```

- [ ] **Step 2: Update findOrCreateRow() (lines 227-241)**

Change function signature and comment:
```js
// ── Find existing row by (address × acreage), or append a new one ───────────

function findOrCreateRow(sheet, address, acreage) {
  const lastRow = sheet.getLastRow();
  if (lastRow >= DATA_START_ROW) {
    const vals = sheet.getRange(DATA_START_ROW, 1, lastRow - DATA_START_ROW + 1, 7).getValues();
    for (let i = 0; i < vals.length; i++) {
      if (String(vals[i][0]) === address && String(vals[i][6]) === acreage) {
        return DATA_START_ROW + i;
      }
    }
  }
  const newRow = Math.max(lastRow + 1, DATA_START_ROW);
  return newRow;
}
```

- [ ] **Step 3: Update formula references to use renamed COL keys (lines 131-134)**

```js
    sheet.getRange(rc, COL.totalRetail).setFormula('=IFERROR(FLOOR(B' + rc + '/IF(G' + rc + '="8\u201315 acres",10,5),1)*((K' + rc + '+P' + rc + '+U' + rc + ')/3)*0.8,"")');
    sheet.getRange(rc, COL.targetBuyPrice).setFormula('=IFERROR(MIN(X' + rc + '*0.5,C' + rc + '),"")');
```

(Lines 127-130 and 133-134 reference COL keys that didn't change — `ratio_90d`, `ratio_6m`, `ratio_12m`, `trend`, `minProfit`, `profitDiscount` — so they need no update.)

- [ ] **Step 4: Commit**

```bash
git add scripts/zillow-sheets-app-script.gs
git commit -m "fix(apps-script): rename session to address in doPost and findOrCreateRow"
```

---

### Task 4: Userscript — Rename Session label to Address

**Files:**
- Modify: `scripts/zillow-circle-via-api.user.js:490-502` (sessionInput section)

- [ ] **Step 1: Update sessionInput label, placeholder, and default value (lines 490-502)**

Replace lines 490-502 with:
```js
    const sessionInput = document.createElement('input');
    sessionInput.type = 'text';
    sessionInput.autocomplete = 'off';
    sessionInput.placeholder = '123 Main St, City, ST';
    sessionInput.style.cssText = 'width: 100%; box-sizing: border-box; padding: 4px 6px;';
    if (saved && saved.session) sessionInput.value = saved.session;
    sessionInput.addEventListener('input', () => {
      const s = getSavedPanelState() || {};
      s.session = sessionInput.value;
      savePanelState(s);
    });
    wrap.appendChild(row('Address', sessionInput));
```

Key changes:
- Label: `'Session label'` → `'Address'`
- Placeholder: descriptive → `'123 Main St, City, ST'`
- Default value: removed the `new Date()... + lat,lng` generation. Now starts empty or restores from saved state.
- Restore logic simplified: `saved && saved.session` (no need for `defaultSession` fallback)

- [ ] **Step 2: Commit**

```bash
git add scripts/zillow-circle-via-api.user.js
git commit -m "fix(userscript): rename Session label to Address in panel"
```

---

### Task 5: Userscript — Add Acres and Parent Price inputs

**Files:**
- Modify: `scripts/zillow-circle-via-api.user.js:502-516` (between sessionInput and targetRowInput)

- [ ] **Step 1: Add acresInput and parentPriceInput elements after the Address input**

Insert these blocks immediately after the `wrap.appendChild(row('Address', sessionInput));` line and BEFORE the `targetRowInput` block:

```js
    const acresInput = document.createElement('input');
    acresInput.type = 'number';
    acresInput.min = '0';
    acresInput.step = 'any';
    acresInput.placeholder = 'e.g. 12.5';
    acresInput.style.cssText = 'width: 100%; box-sizing: border-box; padding: 4px 6px;';
    if (saved && saved.acres != null && saved.acres !== '') acresInput.value = saved.acres;
    acresInput.addEventListener('input', () => {
      const s = getSavedPanelState() || {};
      s.acres = acresInput.value;
      savePanelState(s);
    });
    wrap.appendChild(row('Acres', acresInput));

    const parentPriceInput = document.createElement('input');
    parentPriceInput.type = 'number';
    parentPriceInput.min = '0';
    parentPriceInput.step = '1';
    parentPriceInput.placeholder = 'e.g. 150000';
    parentPriceInput.style.cssText = 'width: 100%; box-sizing: border-box; padding: 4px 6px;';
    if (saved && saved.parentPrice != null && saved.parentPrice !== '') parentPriceInput.value = saved.parentPrice;
    parentPriceInput.addEventListener('input', () => {
      const s = getSavedPanelState() || {};
      s.parentPrice = parentPriceInput.value;
      savePanelState(s);
    });
    wrap.appendChild(row('Parent Price Zillow', parentPriceInput));
```

- [ ] **Step 2: Add acres and parcelPrice to the meta object in sheetsBtn click handler (line 545)**

Change the meta construction from:
```js
      const meta = { lat: latInput.value, lng: lngInput.value, radius: radiusInput.value, lotLabel };
```
To:
```js
      const meta = {
        lat: latInput.value, lng: lngInput.value, radius: radiusInput.value, lotLabel,
        acres: acresInput.value, parcelPrice: parentPriceInput.value,
      };
```

Note: the transport field is `parcelPrice` (not `parentPrice`) — this matches what the Apps Script expects in `meta.parcelPrice`.

- [ ] **Step 3: Commit**

```bash
git add scripts/zillow-circle-via-api.user.js
git commit -m "feat(userscript): add Acres and Parent Price inputs to panel"
```

---

### Task 6: Userscript — Fix savePanelState in goBtn and add address validation

**Files:**
- Modify: `scripts/zillow-circle-via-api.user.js:450-455` (goBtn savePanelState call)
- Modify: `scripts/zillow-circle-via-api.user.js:533-548` (sheetsBtn click handler)

- [ ] **Step 1: Fix goBtn savePanelState to include all Sheets-section fields (lines 450-455)**

Replace:
```js
      savePanelState({
        lat: latInput.value, lng: lngInput.value, radius: radiusInput.value,
        priceMin: priceMinInput.value, priceMax: priceMaxInput.value,
        lotPreset: lotPresetSelect.value, saleType: saleSelect.value,
        soldIn: soldInSelect.value, session: sessionInput.value,
      });
```

With:
```js
      savePanelState({
        lat: latInput.value, lng: lngInput.value, radius: radiusInput.value,
        priceMin: priceMinInput.value, priceMax: priceMaxInput.value,
        lotPreset: lotPresetSelect.value, saleType: saleSelect.value,
        soldIn: soldInSelect.value, session: sessionInput.value,
        acres: acresInput.value, parentPrice: parentPriceInput.value,
        targetRow: targetRowInput.value,
      });
```

- [ ] **Step 2: Add address validation in sheetsBtn click handler (line 543)**

Replace line 543:
```js
      const session = sessionInput.value.trim() || new Date().toISOString().slice(0, 10);
```

With:
```js
      const session = sessionInput.value.trim();
      if (!session) { sheetsStatus.textContent = 'Enter an address.'; return; }
```

- [ ] **Step 3: Commit**

```bash
git add scripts/zillow-circle-via-api.user.js
git commit -m "fix(userscript): persist targetRow/acres/price in goBtn save, validate address"
```

---

### Task 7: Final verification and commit

- [ ] **Step 1: Search Apps Script for any remaining old COL names**

Search `zillow-sheets-app-script.gs` for: `COL.area`, `COL.parcelPrice`, `COL.amountCalc`, `COL.avgMonthCalc`. All should be zero matches.

- [ ] **Step 2: Search userscript for stale references**

Search `zillow-circle-via-api.user.js` for: `Session label`, `defaultSession`. Should be zero matches.

- [ ] **Step 3: Eyeball the panel field order in the userscript**

Confirm the order below the divider is:
1. Address (`sessionInput`)
2. Acres (`acresInput`)
3. Parent Price Zillow (`parentPriceInput`)
4. Target row (`targetRowInput`)
5. Send to Google Sheets button
6. Clear hidden listings button

- [ ] **Step 4: Manual test — deploy and verify**

1. Paste updated Apps Script into script.google.com → re-deploy
2. Delete existing Summary sheet in the spreadsheet
3. Install updated userscript in Tampermonkey
4. Open a Zillow search page — verify panel shows Address, Acres, Parent Price, Target row
5. Enter address, acres, parent price, target row = 1
6. Click Go → verify all fields persist after page navigation
7. Click Send to Google Sheets → verify data lands in correct columns
8. Verify: Column A = address, B = acres, C = parent price, G = lot label
9. Try sending with blank address → verify "Enter an address" validation message
10. Send for_sale → verify count appears in H, M, and R
11. Send sold_90d, sold_6m, sold_12m → verify counts/avg/median in correct columns
12. Verify formulas in D, E, F, J, O, T, W, X are correct
