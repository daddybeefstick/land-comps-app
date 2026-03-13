#!/usr/bin/env python3
"""
Export NC/SC review list to a single PDF with NO duplicates.
Reads from nc_sc_review_list.csv, dedupes by zpid+normalized address, outputs one clean table.
"""
import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
EXPORTS = ROOT / "exports"
CSV_PATH = EXPORTS / "nc_sc_review_list.csv"
OUTPUT_DIR = ROOT / "outputs" / "reports"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def main() -> None:
    if not CSV_PATH.exists():
        print(f"Run pick_review_list_nc_sc.py first. Missing {CSV_PATH}")
        raise SystemExit(1)

    from modules.dedup import add_to_seen, is_duplicate

    rows: list[dict] = []
    seen_zpid: set[str] = set()
    seen_addr: set[str] = set()
    with CSV_PATH.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            if is_duplicate(r, seen_zpid, seen_addr):
                continue
            add_to_seen(r, seen_zpid, seen_addr)
            rows.append(r)

    if not rows:
        print("CSV is empty or all duplicates.")
        raise SystemExit(1)

    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle
        from reportlab.lib import colors
        from reportlab.lib.units import inch
    except ImportError:
        print("Install: pip install reportlab")
        raise SystemExit(1)

    out_path = OUTPUT_DIR / "NC_SC_Review_Queue.pdf"

    # Columns to show
    COLS = [
        ("address", "Address"),
        ("county", "County"),
        ("city", "City"),
        ("state", "State"),
        ("zipcode", "Zip"),
        ("price", "Price"),
        ("acres", "Acres"),
        ("days_on_market", "DOM"),
        ("score", "Score"),
        ("status", "Status"),
        ("roi_pct", "ROI %"),
        ("zpid", "zpid"),
    ]

    header = [label for _, label in COLS]
    data = [header]
    for r in rows:
        row = []
        for key, _ in COLS:
            val = r.get(key, "")
            if key == "price" and val:
                try:
                    val = f"${float(val):,.0f}"
                except (TypeError, ValueError):
                    pass
            elif key == "roi_pct" and val:
                try:
                    val = f"{float(val):.1f}%"
                except (TypeError, ValueError):
                    pass
            row.append(str(val)[:50] if val else "")
        data.append(row)

    doc = SimpleDocTemplate(
        str(out_path),
        pagesize=letter,
        leftMargin=0.5 * inch,
        rightMargin=0.5 * inch,
        topMargin=0.5 * inch,
        bottomMargin=0.5 * inch,
    )
    t = Table(data, repeatRows=1)
    t.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#4472C4")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
            ("ALIGN", (0, 0), (-1, -1), "LEFT"),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 8),
            ("FONTSIZE", (0, 1), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
            ("TOPPADDING", (0, 0), (-1, 0), 8),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f0f0f0")]),
        ])
    )
    doc.build([t])
    print(f"Exported {len(rows)} unique properties to {out_path}")
    print(f"Path: {out_path.resolve()}")


if __name__ == "__main__":
    main()
