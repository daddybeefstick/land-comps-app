"""
NC + SC subdivision pipeline.

1. Collect land listings (from Zillow API or CSV import)
2. Score and filter for subdivision potential
3. Export to CSV — prioritizes best NC counties from Zillow County Sales PDF.
   SC included (no PDF data; all SC counties).

Run from project root:
  python run_nc_sc_pipeline.py                    # uses Zillow API (requires RAPIDAPI_KEY)
  python run_nc_sc_pipeline.py --from-csv PATH   # uses CSV import (no API needed)
"""
import csv
import sqlite3
import subprocess
from pathlib import Path
from typing import Iterable

from config import DATABASE_PATH
from best_counties_nc_sc import is_priority_county
from modules.dedup import add_to_seen, is_duplicate


def _run_step(cmd: list[str]) -> None:
    print(f"\n>>> {' '.join(cmd)}")
    print("=" * 50)
    completed = subprocess.run(cmd)  # stream output to terminal
    if completed.returncode != 0:
        raise SystemExit(completed.returncode)


def _print_rows(rows: Iterable[sqlite3.Row]) -> None:
    for row in rows:
        print(dict(row))


def _write_csv(path: Path, rows: list[sqlite3.Row], default_fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        fieldnames = list(rows[0].keys()) if rows else default_fieldnames
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(dict(row))


DEFAULT_FIELDNAMES = [
    "id", "zpid", "state", "county", "address", "city", "zipcode", "url",
    "price", "acres", "price_per_acre", "days_on_market",
    "score", "status", "roi_pct", "net_profit", "red_flags",
    "zoning", "raw_json",
]


def _export_nc_sc() -> None:
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    try:
        states = ("NC", "SC")
        placeholders = ",".join("?" * len(states))

        nc_sc_rows = list(conn.execute(
            f"""
            SELECT
                p.id, p.zpid, p.state, p.county, p.address, p.city, p.zipcode, p.url,
                p.price, p.acres, p.price_per_acre, p.days_on_market,
                s.score, s.status, s.roi_pct, s.net_profit, s.red_flags,
                p.zoning, p.raw_json
            FROM scored_properties s
            JOIN properties p ON p.id = s.property_id
            WHERE p.state IN ({placeholders})
            ORDER BY s.score DESC, p.price ASC
            """,
            states,
        ).fetchall())

        # Dedupe by zpid and normalized address (catches "448 Batts Island Rd" vs "448 Batts Island Rd Lot 33")
        seen_z = set()
        seen_a = set()
        unique_rows = []
        for r in nc_sc_rows:
            d = dict(r)
            if is_duplicate(d, seen_z, seen_a):
                continue
            add_to_seen(d, seen_z, seen_a)
            unique_rows.append(r)
        nc_sc_rows = unique_rows

        # Prefer best NC counties (from Zillow PDF) first
        nc_sc_rows.sort(
            key=lambda r: (
                0 if is_priority_county(r["state"], r["county"]) else 1,
                -int(r["score"] or 0),
                float(r["price"] or 0),
            )
        )

        all_export = Path("exports") / "nc_sc_pipeline_all_scored.csv"
        _write_csv(all_export, nc_sc_rows, DEFAULT_FIELDNAMES)
        print(f"\nAll NC+SC scored: {all_export.resolve()} ({len(nc_sc_rows)} rows)")

        non_reject = [r for r in nc_sc_rows if str(r["status"] or "").strip().lower() != "reject"]
        results_export = Path("exports") / "nc_sc_pipeline_results.csv"
        _write_csv(results_export, non_reject, DEFAULT_FIELDNAMES)
        print(f"Non-reject (for review): {results_export.resolve()} ({len(non_reject)} rows)")

        nc_count = sum(1 for r in nc_sc_rows if r["state"] == "NC")
        sc_count = sum(1 for r in nc_sc_rows if r["state"] == "SC")
        print(f"\nBreakdown: NC={nc_count}, SC={sc_count}")
    finally:
        conn.close()


def main() -> None:
    import argparse
    ap = argparse.ArgumentParser(description="NC + SC subdivision pipeline")
    ap.add_argument("--from-csv", type=Path, metavar="PATH", help="Import from CSV instead of Zillow API")
    args = ap.parse_args()

    print("\n" + "=" * 50)
    print("  NC + SC Pipeline - live progress")
    print("=" * 50)

    if args.from_csv:
        print(f"\n[1/3] Importing from CSV: {args.from_csv}")
        _run_step(["python", "main.py", "import", "--csv", str(args.from_csv), "--states", "NC", "SC"])
    else:
        print("\n[1/3] Collecting from Zillow (NC, SC)...")
        _run_step(["python", "main.py", "collect", "--states", "NC", "SC"])
    print("\n[2/3] Scoring properties...")
    _run_step(["python", "main.py", "score"])
    print("\n[3/3] Exporting...")
    _export_nc_sc()
    print("\n" + "=" * 50)
    print("  Done. Run: python scripts/pick_review_list_nc_sc.py [--pick 100]")
    print("=" * 50)


if __name__ == "__main__":
    main()
