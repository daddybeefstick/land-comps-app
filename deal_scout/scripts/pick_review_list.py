#!/usr/bin/env python3
"""
Pick ~20 properties for review: prefer high sell-through (low DOM) and
counties with more listings (active / "around other places").
Reads exports/tx_pipeline_all_scored.csv and writes exports/tx_review_list_20.csv
and exports/tx_review_list_20.txt.
"""
import csv
from io import StringIO
from pathlib import Path

EXPORTS = Path(__file__).resolve().parent.parent / "exports"
CSV_IN = EXPORTS / "tx_pipeline_all_scored.csv"
CSV_OUT = EXPORTS / "tx_review_list_20.csv"
TXT_OUT = EXPORTS / "tx_review_list_20.txt"
TARGET = 50
MAX_DOM_HIGH_SELL = 90  # days on market: lower = higher sell-through
MIN_SCORE_EXTRA = 35    # minimum score to consider when expanding beyond review/manual_review


def main() -> None:
    if not CSV_IN.exists():
        print(f"Missing {CSV_IN}. Run the TX pipeline first.")
        return

    rows: list[dict] = []
    with CSV_IN.open(encoding="utf-8") as f:
        raw = f.read()
    lines = raw.strip().split("\n")
    if not lines:
        print("CSV is empty.")
        return
    # First line may be comment; use second as header if it looks like CSV header
    if "id,zpid" in (lines[1] if len(lines) > 1 else ""):
        content = "\n".join(lines[1:])
    else:
        content = raw
    reader = csv.DictReader(StringIO(content))
    seen_zpid: set[str] = set()
    for row in reader:
        if not row.get("id") or str(row.get("id", "")).strip().startswith("cursor-"):
            continue
        zpid = (row.get("zpid") or "").strip()
        if zpid and zpid in seen_zpid:
            continue
        if zpid:
            seen_zpid.add(zpid)
        try:
            row["days_on_market"] = int(float(row.get("days_on_market") or 0))
        except (TypeError, ValueError):
            row["days_on_market"] = 999
        try:
            row["score"] = int(float(row.get("score") or 0))
        except (TypeError, ValueError):
            row["score"] = 0
        row["status"] = (row.get("status") or "").strip()
        row["county"] = (row.get("county") or "").strip() or "Unknown"
        rows.append(row)

    # County activity: more listings in pipeline = "around other places"
    county_count: dict[str, int] = {}
    for r in rows:
        c = r["county"]
        county_count[c] = county_count.get(c, 0) + 1

    def is_review(r: dict) -> bool:
        return r["status"] in ("review", "manual_review")

    def high_sell_through(r: dict) -> bool:
        return r["days_on_market"] <= MAX_DOM_HIGH_SELL

    def county_activity(r: dict) -> int:
        return county_count.get(r["county"], 0)

    # Sort: review/manual_review first; then by score desc; then prefer low DOM; then prefer active counties
    def rank(r: dict) -> tuple:
        return (
            0 if is_review(r) else 1,
            -r["score"],
            r["days_on_market"],
            -county_activity(r),
        )

    rows_sorted = sorted(rows, key=rank)

    chosen: list[dict] = []
    chosen_zpids: set[str] = set()

    for r in rows_sorted:
        if len(chosen) >= TARGET:
            break
        zpid = (r.get("zpid") or "").strip()
        if zpid in chosen_zpids:
            continue
        if is_review(r):
            chosen.append(r)
            if zpid:
                chosen_zpids.add(zpid)
            continue
        if r["score"] >= MIN_SCORE_EXTRA and (high_sell_through(r) or county_activity(r) >= 2):
            chosen.append(r)
            if zpid:
                chosen_zpids.add(zpid)

    for r in rows_sorted:
        if len(chosen) >= TARGET:
            break
        zpid = (r.get("zpid") or "").strip()
        if zpid in chosen_zpids:
            continue
        if r["score"] >= 30:
            chosen.append(r)
            if zpid:
                chosen_zpids.add(zpid)

    # Write CSV
    if chosen:
        fieldnames = list(chosen[0].keys())
        EXPORTS.mkdir(parents=True, exist_ok=True)
        with CSV_OUT.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=fieldnames)
            w.writeheader()
            w.writerows(chosen)
        print(f"Wrote {CSV_OUT} ({len(chosen)} rows)")

    # Write readable list
    lines = [
        "TX properties for review (high sell-through / active areas)",
        f"Source: {CSV_IN.name}  →  {len(chosen)} properties",
        "",
    ]
    for i, r in enumerate(chosen, 1):
        dom = r.get("days_on_market", "")
        county = r.get("county", "")
        activity = f" ({county_count.get(county, 0)} in county)" if county != "Unknown" else ""
        lines.append(
            f"{i:2}. {r.get('address', '')} — {county}{activity}"
        )
        lines.append(
            f"    {r.get('city', '')} {r.get('zipcode', '')}  |  "
            f"${float(r.get('price') or 0):,.0f}  |  {r.get('acres', '')} ac  |  "
            f"DOM {dom}  |  Score {r.get('score')}  {r.get('status', '')}"
        )
        lines.append("")
    with TXT_OUT.open("w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"Wrote {TXT_OUT}")
    print("\n--- List ---")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
