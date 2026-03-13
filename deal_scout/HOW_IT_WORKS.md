# How Deal Scout Chooses Properties (NC + SC)

Step-by-step flow from Zillow to your review list.

---

## Step 1: Zillow gives us a raw list

We call the Zillow API with map boundaries that cover **NC** and **SC**. For each area we ask for:

- **Type:** Lots & land
- **For sale only**
- **Price:** $1–$500,000
- **Lot size:** 20–50 acres

Zillow returns whatever matches those filters. We don’t decide yet which are “good” — we just pull everything that fits.

---

## Step 2: We keep only valid land listings

For each result, we check:

- Has price and acres
- 20–50 acres and under $500k (double-check)
- Actually marked as lot/land (not house)
- State matches (we requested NC/SC, so we drop anything else)

Whatever passes is saved into the database. That’s our **full NC/SC pool**.

---

## Step 3: We score every property

For each property in the pool we:

1. **Compute median price/acre** for that county in our data.
2. **Estimate lots** = acres ÷ 5 (capped at 5–10 lots).
3. **Project profit** and ROI (revenue, survey, infra, permits, holding).
4. **Score it** by:
   - % below county median (cheap vs market)
   - ROI (high ROI = higher score)
   - Days on market (fresh listings boosted)
   - Zoning hints (res/rural/ag = boost)
   - Red flags (flood, wetland, HOA, landlocked = penalty)

5. **Assign status:** `review`, `manual_review`, or `reject` based on score and flags.

All of this happens automatically for every property. Nobody “decides” yet — the rules decide.

---

## Step 4: We pick the top 50 for you

From all scored NC/SC properties, we:

1. **Sort** by:
   - Best NC counties first (from the Zillow PDF)
   - `review` / `manual_review` before `reject`
   - Higher score
   - Lower days on market
   - More listings in same county (busier markets)

2. **Take up to 50** in that order.

Those 50 go to your CSV and Google Sheet. They’re the ones that best fit the criteria, ranked for you.

---

## Quick recap

| Step | What happens |
|------|--------------|
| 1 | Zillow returns all NC/SC land 20–50 acres, under $500k |
| 2 | We filter for valid land listings and save them |
| 3 | We score each one (ROI, price vs median, DOM, flags) |
| 4 | We sort and take the top 50 for your review list |

**TL;DR:** Zillow gives us candidates that match size/price. We score them and pick the highest-ranked 50 for NC + SC.
