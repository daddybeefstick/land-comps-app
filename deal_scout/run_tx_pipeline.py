import csv
import sqlite3
import subprocess
from pathlib import Path
from typing import Iterable

from config import DATABASE_PATH


def _run_step(cmd: list[str]) -> None:
    print(f"$ {' '.join(cmd)}")
    completed = subprocess.run(cmd, capture_output=True, text=True)
    if completed.returncode != 0:
        if completed.stdout:
            print(completed.stdout, end="")
        if completed.stderr:
            print(completed.stderr, end="")
        raise SystemExit(completed.returncode)
    lines = [line.strip() for line in completed.stdout.splitlines() if line.strip()]
    if lines:
        if cmd[:3] == ["python3", "main.py", "score"]:
            print("Scoring completed.")
        else:
            print(lines[-1])


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


def _verification_summary() -> None:
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    try:
        print("\n=== TX Verification Summary ===")
        tx_rows = conn.execute(
            """
            SELECT COUNT(*) AS cnt
            FROM properties
            WHERE state = 'TX'
            """
        ).fetchone()["cnt"]
        print(f"TX rows in properties: {tx_rows}")

        tx_scored = conn.execute(
            """
            SELECT COUNT(*) AS cnt
            FROM scored_properties s
            JOIN properties p ON p.id = s.property_id
            WHERE p.state = 'TX'
            """
        ).fetchone()["cnt"]
        print(f"TX scored rows (joined): {tx_scored}")

        print("\nCount by scored status (TX):")
        status_rows = conn.execute(
            """
            SELECT s.status, COUNT(*) AS cnt
            FROM scored_properties s
            JOIN properties p ON p.id = s.property_id
            WHERE p.state = 'TX'
            GROUP BY s.status
            ORDER BY cnt DESC, s.status ASC
            """
        ).fetchall()
        _print_rows(status_rows)

        print("\nTop 25 TX non-reject rows (score DESC, price ASC):")
        top_rows = conn.execute(
            """
            SELECT
                p.id,
                p.zpid,
                p.address,
                p.city,
                p.county,
                p.price,
                p.acres,
                s.score,
                s.status,
                s.roi_pct,
                s.net_profit
            FROM scored_properties s
            JOIN properties p ON p.id = s.property_id
            WHERE p.state = 'TX' AND s.status <> 'reject'
            ORDER BY s.score DESC, p.price ASC
            LIMIT 25
            """
        ).fetchall()
        _print_rows(top_rows)

        export_rows = conn.execute(
            """
            SELECT
                p.id,
                p.zpid,
                p.state,
                p.county,
                p.address,
                p.city,
                p.zipcode,
                p.url,
                p.price,
                p.acres,
                p.price_per_acre,
                p.days_on_market,
                s.score,
                s.status,
                s.roi_pct,
                s.net_profit,
                s.red_flags
            FROM scored_properties s
            JOIN properties p ON p.id = s.property_id
            WHERE p.state = 'TX' AND s.status <> 'reject'
            ORDER BY s.score DESC, p.price ASC
            """
        ).fetchall()
        default_fieldnames = [
            "id",
            "zpid",
            "state",
            "county",
            "address",
            "city",
            "zipcode",
            "url",
            "price",
            "acres",
            "price_per_acre",
            "days_on_market",
            "score",
            "status",
            "roi_pct",
            "net_profit",
            "red_flags",
        ]
        export_path = Path("exports") / "tx_pipeline_results.csv"
        _write_csv(export_path, export_rows, default_fieldnames)

        all_scored_rows = conn.execute(
            """
            SELECT
                p.id,
                p.zpid,
                p.state,
                p.county,
                p.address,
                p.city,
                p.zipcode,
                p.url,
                p.price,
                p.acres,
                p.price_per_acre,
                p.days_on_market,
                s.score,
                s.status,
                s.roi_pct,
                s.net_profit,
                s.red_flags
            FROM scored_properties s
            JOIN properties p ON p.id = s.property_id
            WHERE p.state = 'TX'
            ORDER BY s.score DESC, p.price ASC
            """
        ).fetchall()
        all_scored_export_path = Path("exports") / "tx_pipeline_all_scored.csv"
        _write_csv(all_scored_export_path, all_scored_rows, default_fieldnames)

        print(f"\nCSV export (non-reject): {export_path.resolve()}")
        print(f"CSV export (all scored): {all_scored_export_path.resolve()}")
    finally:
        conn.close()


def main() -> None:
    _run_step(["python3", "main.py", "collect", "--states", "TX"])
    _run_step(["python3", "main.py", "score"])
    _verification_summary()


if __name__ == "__main__":
    main()
