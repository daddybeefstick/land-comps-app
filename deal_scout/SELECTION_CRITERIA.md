# Property Selection Criteria

How Deal Scout collects, scores, and picks properties for your review list.

---

## 1. Collection (Zillow API)

**What gets pulled:**
- **Type:** Lots & land only
- **List price:** $1–$500,000
- **Lot size:** 20–50 acres (changed from 5–50)
- **States:** NC, SC, TX, FL, TN, AZ, OH (via map-bound search)

---

## 2. Scoring (filter.py)

Each property gets a **score** (0–100+) and **status** (review / manual_review / reject).

| Factor | Points |
|--------|--------|
| **% below county median** (price/acre) | ≥50%: +25 · ≥30%: +15 |
| **ROI** (projected) | >100%: +40 · ≥50%: +25 · ≥25%: +10 |
| **State growth bonus** | TX, FL, TN, NC, SC, AZ: +10 |
| **Days on market** | ≤90: +5 · >180: −5 |
| **Zoning** (res/rural/ag/single) | +5 |
| **Red flags** (flood, wetland, HOA, landlocked) | −10 each |
| **Missing county** | red flag |
| **Out-of-state** | red flag |

**Status rules:**
- **review:** score ≥60 and no red flags
- **manual_review:** score ≥60 with flags, or borderline (score ≥45, ROI ≥20%, % below ≥10%, lots ≥5)
- **reject:** otherwise

---

## 3. Profit model (profit_calc.py)

- **Estimated lots:** acres ÷ 5 (min 5, max 10)
- **Gross revenue:** lots × (county median $/acre × 5 acres)
- **Costs:** survey $2k + infra $8k per lot, permits $3k flat, holding 4%
- **ROI** = net profit ÷ purchase price × 100

---

## 4. Pick for review list

**Order:**
1. NC: best counties from Zillow PDF first; SC: all counties
2. Status: review / manual_review before reject
3. Score (higher first)
4. Days on market (lower first)
5. County activity (more listings in county = more active area)

**Count:** Up to **50** by default. Use `--pick 100` (or `TOP_PICK_COUNT=100`) for high-volume check-and-burn.

**Extra picks:** Score ≥35 with DOM ≤90 or 2+ in county; else score ≥30.
