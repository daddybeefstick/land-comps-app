# Zillow Tampermonkey Panel – Codex Summary

This document summarizes the Zillow Filter + Map Panel userscript: what it does, how it was built, what was tried, and what’s still broken. Use it to hand off to Codex or another session. The actual script is in `scripts/zillow-search-panel.user.js` (copy/paste that file yourself).

---

## 1. What We Built

A **Tampermonkey userscript** that runs on Zillow for-sale and land search pages. It adds a **floating, draggable panel** where the user can:

- Set **search area**: center latitude, center longitude, and **radius (miles)**. The script turns that into Zillow’s `mapBounds` (west/east/south/north) and reloads the page with a new URL.
- Set **filters**: price min/max, lot size (sq ft), and a **lot-size preset** dropdown (Custom, 3–20 acres, 3–7 acres, 8–15 acres).
- Set **sort** (Homes for you, Price low/high, Newest, Days on Zillow).
- Click **Apply** to rebuild `searchQueryState`, encode it in the URL, and navigate so Zillow shows the new search.

The script also tries to **draw a green circle overlay** on the map so the user can see the search radius. That part is only partly successful (see Known Problems below).

---

## 2. URL / Data Shape

Zillow encodes the search in a single query parameter:

- **Parameter:** `searchQueryState`
- **Value:** URL-encoded JSON.

Important fields:

- **mapBounds:** `{ west, east, south, north }` (longitude/latitude rectangle). Zillow uses this as the search area; we derive it from center + radius.
- **mapZoom:** number (e.g. 11).
- **customRegionId:** string. Zillow only draws its *own* boundary circle when this is set (e.g. from their “Draw” tool). We clear it when the user changes location so our bounds apply; we keep it when only filters change so an existing drawn circle can stay.
- **filterState:** object with e.g. `price: { min, max }`, `lot: { min, max, units }`, `sort: { value: "..." }`, and booleans (sf, tow, mf, con, apa, manu, apco).

**Circle → bounds math:**

- 1° latitude ≈ 69 miles; 1° longitude ≈ 69×cos(lat°) miles.
- From center (latC, lonC) and radius R (miles):  
  `deltaLat = R/69`, `deltaLon = R/(69*cos(latC*π/180))`  
  then north/south/east/west = center ± deltas.

---

## 3. Script Match Rules

The script runs on:

- `*://www.zillow.com/homes/for_sale*`
- `*://www.zillow.com/*/land*`

The second rule was added because the user was on `zillow.com/greenwood-sc/land/` and the script didn’t run or show in the Tampermonkey dropdown until we added it.

---

## 4. Panel UI (Current)

- **Location:** Center latitude, Center longitude, Radius (miles) with hint “Circle redraws as you pan/zoom.”
- **Filters:** Price min, Price max; Lot size dropdown (Custom, 3–20 ac, 3–7 ac, 8–15 ac); Lot min (sq ft), Lot max (sq ft).
- **Sort:** Dropdown (Homes for you, Price low/high, Newest, Days on Zillow).
- **Apply** button; hint: “Apply updates the search and result list.”
- Panel is draggable by the “Zillow search” header.
- Inputs have IDs for the circle logic: `zillow-panel-lat`, `zillow-panel-lon`, `zillow-panel-radius`.

---

## 5. Circle Overlay (What We Tried)

- **Problem:** Zillow does not draw a boundary circle for URL-only `mapBounds` searches; it only draws one when the search was created with their “Draw” tool (`customRegionId`).
- **What we did:** We draw our own overlay: find the map container in the DOM, add an SVG circle (fill + stroke), convert center + radius from lat/lon/miles to pixels using the current viewport bounds.
- **Viewport source:** We use `mapBounds` from the **current page URL** as the viewport (Zillow sometimes updates this on pan/zoom). Center and radius come from the **panel inputs** so the circle is always “the search area” in geographic space.
- **Redraw:** Initial draw on load; then a **setInterval(800ms)** that reads the URL and panel and calls `redrawCircleFromPanelAndUrl()` so the circle *should* move and scale when the user pans/zooms (if Zillow updates the URL).
- **Visibility:** Stroke 3px, darker green; fill opacity increased so the radius is easier to see.

**Map container detection:** We try several selectors (e.g. `[class*="MapContainer"]`, `[class*="map-container"]`, `[data-testid="map"]`, canvas parents, split/main first column). If the map isn’t found, we skip drawing the circle.

---

## 6. Known Problems (Still Present)

The user reported these again at the end of the chat:

1. **Circle is still “fixed”** – It doesn’t reliably move or scale when they pan/zoom. Likely causes: Zillow may not update the URL’s `mapBounds` on every pan/zoom, or the update pattern doesn’t match our 800ms poll, or the map container we find isn’t the one that actually moves (e.g. we’re drawing on a sibling or wrong wrapper).
2. **“Can’t see the radius”** – Either the circle is still too subtle on their screen, or they mean the circle size doesn’t visually match the radius when the map view changes (again, viewport/circle sync issue).
3. **Properties don’t change when scrolling in/out** – The result list doesn’t update when they pan/zoom. That’s largely Zillow’s behavior: the list updates when a new search is run (e.g. after **Apply** or when Zillow decides to refetch). Our script can’t force Zillow to refetch on every pan/zoom; we only update the URL and redraw our overlay.

**What would help next:**

- Inspect Zillow’s DOM/JS to see **when** and **how** they update `searchQueryState` / the URL (e.g. on map move/zoom). If they use `history.replaceState` or similar, we could listen for that instead of polling.
- Confirm we’re drawing the overlay on the **same** div that actually moves with the map (right map container and correct stacking).
- Optionally try to hook into Zillow’s map API (e.g. Leaflet/Mapbox) to add a real circle layer in map coordinates so it always tracks; that’s fragile to Zillow changes but would fix the “fixed circle” feel.

---

## 7. File and Install

- **File:** `scripts/zillow-search-panel.user.js` (in this repo).
- **Install:** Tampermonkey → Create new script (or edit existing) → paste the full script (with `// ==UserScript==` at the top) → save. Ensure the script is enabled and the page URL matches the rules above.
- **Version in script:** 1.3 (in the `@version` line).

---

## 8. Key Functions in the Script (for Codex)

| Function | Purpose |
|----------|--------|
| `getSearchQueryStateFromUrl()` | Parse `searchQueryState` from current URL; returns object or null. |
| `defaultState()` | Fallback state (Phoenix-area bounds, price/lot filters) when URL has no/invalid state. |
| `boundsToCenterAndRadius(bounds)` | Convert mapBounds to center lat/lon and radius (miles). |
| `centerAndRadiusToBounds(lat, lon, radiusMiles)` | Convert center + radius to mapBounds. |
| `findMapContainer()` | Find the map DOM node (multiple selectors + canvas fallback). |
| `drawCircleOverlay(viewportBounds, centerLat, centerLon, radiusMiles)` | Draw or redraw the green circle overlay; uses viewport bounds for lat/lon → pixel conversion. |
| `redrawCircleFromPanelAndUrl()` | Read current URL mapBounds and panel lat/lon/radius; call `drawCircleOverlay`. |
| `buildPanel(state)` | Build the floating panel DOM and wire Apply (rebuild state, encode URL, `location.replace`). |
| `init()` | If panel not present: get state, build panel, initial circle draw, two delayed redraws, then `setInterval(redrawCircleFromPanelAndUrl, 800)`. |

Apply logic: on Apply we compute bounds from panel center + radius, preserve or clear `customRegionId` based on whether location changed, build full `searchQueryState`, then `window.location.replace(newUrl)`.

---

## 9. Chat History (Condensed)

1. **Plan:** Tampermonkey panel for Zillow for-sale URL: edit filters and lat/long/radius to move the “circle,” reload via new URL.
2. **Implemented:** Panel + URL parsing + center/radius ↔ bounds math + Apply; match only `homes/for_sale`.
3. **“No circle appeared”:** Zillow doesn’t draw a circle for URL-only searches. We added our own overlay: find map container, draw SVG circle from bounds.
4. **Lot presets:** Added dropdown: 3–20, 3–7, 8–15 acres; preset fills lot min/max (sq ft); manual edit sets dropdown to Custom.
5. **Preserve circle when only filters change:** We only clear `customRegionId` when the user changes center/radius; if only filters change we keep it so Zillow’s drawn boundary can stay.
6. **Script not in Tampermonkey dropdown / not running:** Match was only `homes/for_sale`; user was on `greenwood-sc/land`. Added `@match *://www.zillow.com/*/land*`.
7. **“Fixed circle, can’t see radius, properties don’t change on scroll/zoom”:** We switched to viewport-from-URL + center/radius-from-panel, 800ms redraw, bolder circle, and hints. User said same problems persist → summarized here for Codex.

---

You can paste this into Codex along with the contents of `zillow-search-panel.user.js` when you’re ready to iterate on the circle or behavior.
