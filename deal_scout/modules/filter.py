import json

import pandas as pd

from config import MAX_ACRES, MAX_PURCHASE_PRICE, MIN_ACRES, MIN_SCORE_FOR_REVIEW, STATE_GROWTH_BONUS
from database.db import fetch_dataframe, replace_scores
from modules.checklist import build_checklist
from modules.profit_calc import calculate_profit


def _score_row(row: pd.Series) -> tuple[int, str, list[str]]:
    score = 0
    reasons: list[str] = ["Projected profit is estimated"]

    pct_below = row["percent_below_median"]
    if pct_below >= 50:
        score += 25
    elif pct_below >= 30:
        score += 15

    roi = row["roi_pct"]
    if roi > 100:
        score += 40
    elif roi >= 50:
        score += 25
    elif roi >= 25:
        score += 10
    else:
        reasons.append("ROI below threshold")

    score += STATE_GROWTH_BONUS.get(row["state"], 0)

    if row["days_on_market"] and row["days_on_market"] <= 90:
        score += 5
    elif row["days_on_market"] > 180:
        score -= 5
        reasons.append("Long DOM")

    zoning_text = str(row.get("zoning") or "").lower()
    if any(word in zoning_text for word in ["res", "rural", "ag", "single"]):
        score += 5

    raw = str(row.get("raw_json") or "").lower()
    if any(k in raw for k in ["flood", "wetland", "marsh", "swamp"]):
        score -= 10
        reasons.append("Possible flood/wetland mention")
    if any(k in raw for k in ["hoa", "deed restriction", "landlocked", "no access"]):
        reasons.append("Possible access/HOA restriction")
        score -= 10

    if not str(row.get("county") or "").strip():
        reasons.append("Missing county")
    raw_state = ""
    try:
        raw_obj = json.loads(str(row.get("raw_json") or "{}"))
        if isinstance(raw_obj, dict):
            prop = raw_obj.get("property", raw_obj)
            if isinstance(prop, dict):
                addr = prop.get("address", {})
                if isinstance(addr, dict):
                    raw_state = str(addr.get("state") or "").upper()
    except json.JSONDecodeError:
        raw_state = ""
    if raw_state and raw_state != str(row.get("state") or "").upper():
        reasons.append("Out-of-state result")
    # Keep obvious weak deals rejected, but let borderline-yet-credible
    # opportunities surface as manual review.
    borderline_candidate = (
        score >= 45
        and float(row.get("roi_pct") or 0) >= 20
        and float(row.get("percent_below_median") or 0) >= 10
        and int(row.get("estimated_lots") or 0) >= 5
        and MIN_ACRES <= float(row.get("acres") or 0) <= MAX_ACRES
        and float(row.get("price") or 0) <= MAX_PURCHASE_PRICE
    )

    if score >= MIN_SCORE_FOR_REVIEW and len(reasons) == 1:
        status = "review"
    elif score >= MIN_SCORE_FOR_REVIEW:
        status = "manual_review"
    elif borderline_candidate:
        reasons.append("Borderline deal kept for manual review")
        status = "manual_review"
    else:
        status = "reject"
    return max(score, 0), status, reasons


def run_filter_and_score() -> pd.DataFrame:
    df = fetch_dataframe("SELECT * FROM properties WHERE acres IS NOT NULL AND price IS NOT NULL")
    if df.empty:
        return df

    medians = df.groupby(["state", "county"], dropna=False)["price_per_acre"].median().reset_index()
    medians = medians.rename(columns={"price_per_acre": "county_median_ppa"})
    df = df.merge(medians, on=["state", "county"], how="left")
    df["percent_below_median"] = ((df["county_median_ppa"] - df["price_per_acre"]) / df["county_median_ppa"] * 100).fillna(0).round(2)

    n_total = len(df)
    print(f"  Scoring {n_total} properties...", flush=True)
    score_rows = []
    for i, (_, row) in enumerate(df.iterrows()):
        if (i + 1) % 100 == 0 or i == 0:
            print(f"  ... {i + 1}/{n_total}", flush=True)
        profit = calculate_profit(row["price"], row["acres"], row["county_median_ppa"] or 0)
        merged = {**row.to_dict(), **profit}
        score, status, flags = _score_row(pd.Series(merged))
        score_rows.append(
            {
                "property_id": int(row["id"]),
                "county_median_ppa": row["county_median_ppa"],
                "percent_below_median": merged["percent_below_median"],
                "estimated_lots": profit["estimated_lots"],
                "gross_revenue": profit["gross_revenue"],
                "estimated_costs": profit["estimated_costs"],
                "net_profit": profit["net_profit"],
                "roi_pct": profit["roi_pct"],
                "commission": profit["commission"],
                "score": score,
                "status": status,
                "red_flags": ", ".join(flags),
                "checklist_json": build_checklist(row.to_dict()),
            }
        )

    replace_scores(score_rows)
    print(f"  Done scoring.", flush=True)
    result = fetch_dataframe(
        """
        SELECT p.*, s.county_median_ppa, s.percent_below_median, s.estimated_lots,
               s.gross_revenue, s.estimated_costs, s.net_profit, s.roi_pct,
               s.commission, s.score, s.status, s.red_flags, s.checklist_json
        FROM properties p
        JOIN scored_properties s ON s.property_id = p.id
        ORDER BY s.score DESC, s.net_profit DESC
        """
    )
    return result


if __name__ == "__main__":
    result = run_filter_and_score()
    print(result.head(10).to_string(index=False) if not result.empty else "No properties to score yet.")
