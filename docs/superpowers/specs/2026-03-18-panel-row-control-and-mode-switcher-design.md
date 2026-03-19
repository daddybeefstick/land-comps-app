# Panel Row Control & Listing Mode Switcher

**Date:** 2026-03-18
**File:** `scripts/zillow-search-panel.user.js`
**No changes to:** `scripts/zillow-sheets-app-script.gs`

## Feature 1: Row Control Section

Replace the current plain "Target row (1-200)" number input (lines 492-499) with a compact inline control group.

### UI Layout

```
Sending to row 1               <- bold label, updates live
[ − ]  [ number input ]  [ + ] <- all on one horizontal line
```

### Behavior

- **Number input:** directly editable, so the user can type any number (e.g. `100`) to jump. `type="number"`, `min=1`, `max=200`.
- **`−` button:** decrements by 1, clamped to 1. `type="button"` to prevent form submission.
- **`+` button:** increments by 1, clamped to 200. `type="button"` to prevent form submission.
- **Label:** reads "Sending to row X" where X updates on every input/click change.
- The value is sent as `meta.targetRow` (existing behavior, unchanged).

### Styling

- Buttons and input share a single row using `display: flex`.
- Buttons are small, square, same height as input.
- Label is bold, sits above the controls.

## Feature 2: Listing Mode Switcher

Replace the current "Data type" dropdown with a mode switcher that both changes the Zillow search (on Apply) and tags data sent to Google Sheets.

### Required: Add `@match` for sold pages

The userscript must add a new match pattern so the panel loads on sold pages:

```
// @match *://www.zillow.com/homes/recently_sold*
```

Without this, navigating to a sold URL causes the panel to disappear.

### Also update area-label auto-fill

The URL path parser that auto-fills the session/area label (lines 480-488) must filter out `recently_sold` in addition to the existing `for_sale`, `land`, etc.

### Dropdown Options

| Label | Value (internal) | URL Path | `doz` | Sold flags |
|-------|-----------------|----------|-------|------------|
| For Sale | `for_sale` | `/homes/for_sale/` | none | none; keeps `land: {value: true}` |
| Sold (90 days) | `sold_90d` | `/homes/recently_sold/` | `"90"` | rs:true, fsba/fsbo/nc/cmsn/auc/fore:false |
| Sold (6 months) | `sold_6m` | `/homes/recently_sold/` | `"6m"` | same |
| Sold (12 months) | `sold_12m` | `/homes/recently_sold/` | `"12m"` | same |
| Sold (All Time) | `sold_all` | `/homes/recently_sold/` | omitted | same |

### On Apply

The Apply button handler already builds a `newState` and navigates via `window.location.replace()`. Changes:

1. Read the selected mode from the dropdown.
2. **FilterState merging:** start from the existing `state.filterState` (spread), then surgically add/remove mode-related keys. This preserves price, lot, sort, and housing-type exclusion filters (sf, tow, mf, con, apa, manu, apco).
3. **For Sale mode:**
   - URL path: `/homes/for_sale/`
   - filterState: remove `rs`, `fsba`, `fsbo`, `nc`, `cmsn`, `auc`, `fore`, `doz`; ensure `land: {value: true}` is present.
4. **Any Sold mode:**
   - URL path: `/homes/recently_sold/`
   - filterState: set `rs: {value: true}`, `fsba/fsbo/nc/cmsn/auc/fore: {value: false}`; remove `land` (Zillow's sold view filters to land via the housing-type exclusions which are already in the base filterState).
   - Set `doz: {value: X}` per table above, or omit `doz` entirely for All Time.
5. **URL path construction:** always use `/homes/for_sale/` or `/homes/recently_sold/` (strip any location prefix from the current path — map bounds in `searchQueryState` handle location).
6. Build URL with the correct path + encoded searchQueryState.

### On Page Load (auto-detect current mode)

When the panel initializes, detect the current mode from the URL:

1. Check URL path for `recently_sold` vs `for_sale`. Default to `for_sale` if neither matches.
2. If sold, read `doz` value from filterState to determine which sold period:
   - `"90"` → `sold_90d`
   - `"6m"` → `sold_6m`
   - `"12m"` → `sold_12m`
   - missing/other → `sold_all`
3. Pre-select the dropdown to match.

This ensures the dropdown always reflects reality, even if the user navigated via Zillow's own UI.

### Sheets Integration

The selected mode value (`for_sale`, `sold_90d`, `sold_6m`, `sold_12m`, `sold_all`) is sent as the `type` field to Google Sheets. The Apps Script already handles `for_sale`, `sold_90d`, `sold_6m`, `sold_12m`. For `sold_all`, the Apps Script has no matching column set — the send will succeed (`ok: true`) but no count/avg/median columns will be written. The panel should show a note "(won't write to Sheets)" next to the Sold (All Time) option or in the status area when that mode is selected and the user clicks Send.

## Summary of Changes

All changes are in `scripts/zillow-search-panel.user.js`:

1. Add `@match *://www.zillow.com/homes/recently_sold*` to userscript header.
2. Add `recently_sold` to the area-label path filter list.
3. Replace "Target row" input with row control group (label + input + buttons).
4. Replace "Data type" dropdown with listing mode switcher (new options, Apply logic, auto-detect on load).
5. Apply button: build correct URL path and filterState flags based on selected mode.
