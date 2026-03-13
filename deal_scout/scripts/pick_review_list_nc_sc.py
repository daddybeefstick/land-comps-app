#!/usr/bin/env python3
"""
Pick properties for NC/SC subdivision review.

Prioritizes best NC counties from Zillow County Sales PDF; includes SC.
Outputs a review list (CSV + readable TXT) — no due diligence, just candidates.

For high-volume check-and-burn: python pick_review_list_nc_sc.py --pick 100
Or set TOP_PICK_COUNT=100 (default 50).
"""
import argparse
import csv
import os
import sys
from io import StringIO
from pathlib import Path

# Add project root for imports
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from best_counties_nc_sc import is_priority_county
from modules.dedup import add_to_seen, is_duplicate

EXPORTS = ROOT / "exports"
CSV_IN = EXPORTS / "nc_sc_pipeline_all_scored.csv"
CSV_OUT = EXPORTS / "nc_sc_review_list.csv"
TXT_OUT = EXPORTS / "nc_sc_review_list.txt"
EXCLUDE_ZPIDS_FILE = EXPORTS / "nc_sc_exclude_zpids.txt"
MAX_DOM_HIGH_SELL = 90
MIN_SCORE_EXTRA = 35


def _load_exclude_zpids() -> set[str]:
    """Load zpids to exclude (already reviewed). Supports numeric (API) and composite (CSV import)."""
    out: set[str] = set()
    if not EXCLUDE_ZPIDS_FILE.exists():
        return out
    for line in EXCLUDE_ZPIDS_FILE.open(encoding="utf-8"):
        z = line.strip()
        if z and not z.startswith("#"):
            out.add(z)
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description="Pick NC/SC properties for review")
    ap.add_argument("--pick", type=int, default=None, help="Number to pick (default 50, or TOP_PICK_COUNT env)")
    args = ap.parse_args()
    target = args.pick if args.pick is not None else int(os.environ.get("TOP_PICK_COUNT", "50"))

    print(f"  Picking top {target} properties from scored list...", flush=True)
    if not CSV_IN.exists():
        print(f"Missing {CSV_IN}. Run: python run_nc_sc_pipeline.py")
        raise SystemExit(1)

    exclude_zpids = _load_exclude_zpids()
    if exclude_zpids:
        print(f"  Excluding {len(exclude_zpids)} already-reviewed zpids from {EXCLUDE_ZPIDS_FILE.name}", flush=True)

    rows: list[dict] = []
    with CSV_IN.open(encoding="utf-8") as f:
        raw = f.read()
    lines = raw.strip().split("\n")
    if not lines:
        print("CSV is empty.")
        return
    content = raw
    if "id,zpid" in (lines[1] if len(lines) > 1 else ""):
        content = "\n".join(lines[1:])
    reader = csv.DictReader(StringIO(content))
    seen_zpid: set[str] = set()
    seen_addr: set[str] = set()
    for row in reader:
        if not row.get("id") or str(row.get("id", "")).strip().startswith("cursor-"):
            continue
        z = (row.get("zpid") or "").strip()
        if z and z in exclude_zpids:
            continue
        if is_duplicate(row, seen_zpid, seen_addr):
            continue
        add_to_seen(row, seen_zpid, seen_addr)
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
        row["_priority_county"] = is_priority_county(row.get("state", ""), row["county"])
        rows.append(row)

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

    # Sort: priority county first, then review status, score, low DOM, active county
    def rank(r: dict) -> tuple:
        return (
            0 if r.get("_priority_county") else 1,
            0 if is_review(r) else 1,
            -r["score"],
            r["days_on_market"],
            -county_activity(r),
        )

    rows_sorted = sorted(rows, key=rank)

    chosen: list[dict] = []
    chosen_zpids: set[str] = set()
    chosen_addresses: set[str] = set()

    def add_if_new(r: dict) -> bool:
        if (r.get("zpid") or "").strip() in exclude_zpids:
            return False
        if is_duplicate(r, chosen_zpids, chosen_addresses):
            return False
        if len(chosen) >= target:
            return False
        add_to_seen(r, chosen_zpids, chosen_addresses)
        chosen.append(r)
        return True

    for r in rows_sorted:
        if is_review(r) and add_if_new(r):
            continue
        if r["score"] >= MIN_SCORE_EXTRA and (high_sell_through(r) or county_activity(r) >= 2) and add_if_new(r):
            continue
        if r["score"] >= MIN_SCORE_EXTRA and r.get("_priority_county") and add_if_new(r):
            continue

    # Fill to target with lower-scored candidates (score 15+ keeps ~50 viable from typical API runs)
    for r in rows_sorted:
        if len(chosen) >= target:
            break
        if (r.get("zpid") or "").strip() in exclude_zpids:
            continue
        if is_duplicate(r, chosen_zpids, chosen_addresses):
            continue
        if r["score"] >= 15:
            add_if_new(r)

    # Drop internal field for output
    for r in chosen:
        r.pop("_priority_county", None)

    # Always overwrite (prevents sync from using stale data when 0 new properties)
    EXPORTS.mkdir(parents=True, exist_ok=True)
    if chosen:
        fieldnames = [k for k in chosen[0].keys()]
        with CSV_OUT.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=fieldnames)
            w.writeheader()
            w.writerows(chosen)
        print(f"Wrote {CSV_OUT} ({len(chosen)} properties)")
    else:
        # Write headers-only so sync sees empty list, not stale data
        with CSV_OUT.open("w", newline="", encoding="utf-8") as f:
            f.write("id,zpid,state,county,address,city,zipcode,url,price,acres,price_per_acre,days_on_market,score,status,roi_pct,net_profit,red_flags\n")
        print(f"No new properties — all candidates already in exclude list or scored list empty. Wrote empty {CSV_OUT.name}.")

    lines = [
        "NC/SC subdivision candidates for review (best counties from Zillow PDF)",
        f"Source: {CSV_IN.name} -> {len(chosen)} properties",
        "",
    ]
    for i, r in enumerate(chosen, 1):
        dom = r.get("days_on_market", "")
        county = r.get("county", "")
        state = r.get("state", "")
        activity = f" ({county_count.get(county, 0)} in county)" if county != "Unknown" else ""
        lines.append(f"{i:2}. {r.get('address', '')} - {county}, {state}{activity}")
        lines.append(
            f"    {r.get('city', '')} {r.get('zipcode', '')}  |  "
            f"${float(r.get('price') or 0):,.0f}  |  {r.get('acres', '')} ac  |  "
            f"DOM {dom}  |  Score {r.get('score')}  {r.get('status', '')}"
        )
        lines.append("")
    with TXT_OUT.open("w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"Wrote {TXT_OUT}")
    print("\n--- Review list ---")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
