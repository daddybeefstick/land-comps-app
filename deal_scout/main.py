import argparse
import json
from pathlib import Path

from config import OUTPUT_EXPORTS_DIR
from database.db import init_db
from modules.collector import collect
from modules.csv_import import import_from_csv
from modules.filter import run_filter_and_score
from modules.report_gen import generate_pdf


def export_csv(df):
    OUTPUT_EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
    path = OUTPUT_EXPORTS_DIR / "flagged_deals.csv"
    df.to_csv(path, index=False)
    return path


def main():
    parser = argparse.ArgumentParser(description="Land subdivision deal scout")
    sub = parser.add_subparsers(dest="cmd")
    c = sub.add_parser("collect")
    c.add_argument("--states", nargs="*", help="State abbreviations like TX FL NC")
    imp = sub.add_parser("import")
    imp.add_argument("--csv", required=True, type=Path, help="Path to CSV with listings")
    imp.add_argument("--states", nargs="*", help="State abbreviations like NC SC (applies green zone filter)")
    sub.add_parser("score")
    sub.add_parser("run")
    r = sub.add_parser("report")
    r.add_argument("--address", required=True)
    sub.add_parser("export")
    args = parser.parse_args()

    init_db()

    if args.cmd == "collect":
        changed = collect(args.states)
        print(f"Collected. Rows inserted/updated: {changed}")
    elif args.cmd == "import":
        changed = import_from_csv(args.csv, args.states)
        print(f"Imported. Rows inserted/updated: {changed}")
    elif args.cmd == "score":
        df = run_filter_and_score()
        print(df.head(20).to_string(index=False) if not df.empty else "No rows to score.")
    elif args.cmd == "run":
        changed = collect()
        print(f"Collected. Rows inserted/updated: {changed}")
        df = run_filter_and_score()
        print(f"Scored {len(df)} properties.")
        print(f"CSV export: {export_csv(df)}")
    elif args.cmd == "report":
        from database.db import fetch_dataframe
        df = fetch_dataframe(
            f"""
            SELECT p.*, s.* FROM properties p
            JOIN scored_properties s ON s.property_id = p.id
            WHERE p.address = '{args.address.replace("'", "''")}'
            LIMIT 1
            """
        )
        if df.empty:
            raise SystemExit("Address not found.")
        path = generate_pdf(df.iloc[0].to_dict())
        print(f"Report generated: {path}")
    elif args.cmd == "export":
        df = run_filter_and_score()
        path = export_csv(df)
        print(f"CSV export: {path}")
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
