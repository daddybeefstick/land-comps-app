import json
from pathlib import Path

from reportlab.lib.pagesizes import letter
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

from config import OUTPUT_REPORTS_DIR


def _fit_text(c, text, x, y, max_width, font="Helvetica", size=10):
    words = str(text).split()
    line = ""
    for word in words:
        test = f"{line} {word}".strip()
        if stringWidth(test, font, size) <= max_width:
            line = test
        else:
            c.drawString(x, y, line)
            y -= 14
            line = word
    if line:
        c.drawString(x, y, line)
        y -= 14
    return y


def generate_pdf(row: dict) -> Path:
    OUTPUT_REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = str(row.get("address", "property")).replace("/", "-").replace(" ", "_")[:80]
    path = OUTPUT_REPORTS_DIR / f"{safe_name}.pdf"
    c = canvas.Canvas(str(path), pagesize=letter)
    width, height = letter
    y = height - 40

    c.setFont("Helvetica-Bold", 16)
    c.drawString(40, y, "Subdivision Deal Report")
    y -= 28

    c.setFont("Helvetica", 10)
    fields = [
        ("Address", row.get("address")),
        ("County/State", f"{row.get('county','')}, {row.get('state','')}"),
        ("Price", f"${row.get('price',0):,.0f}"),
        ("Acres", row.get("acres")),
        ("Price/Acre", f"${row.get('price_per_acre',0):,.0f}"),
        ("County Median PPA", f"${row.get('county_median_ppa',0):,.0f}"),
        ("% Below Median", f"{row.get('percent_below_median',0)}%"),
        ("Estimated Lots", row.get("estimated_lots")),
        ("Gross Revenue", f"${row.get('gross_revenue',0):,.0f}"),
        ("Estimated Costs", f"${row.get('estimated_costs',0):,.0f}"),
        ("Net Profit", f"${row.get('net_profit',0):,.0f}"),
        ("ROI", f"{row.get('roi_pct',0)}%"),
        ("Scout Commission", f"${row.get('commission',0):,.0f}"),
        ("Score", row.get("score")),
        ("Status", row.get("status")),
        ("Listing URL", row.get("url")),
    ]
    for label, value in fields:
        c.setFont("Helvetica-Bold", 10)
        c.drawString(40, y, f"{label}:")
        c.setFont("Helvetica", 10)
        y = _fit_text(c, value, 150, y, width - 190)
    y -= 8
    c.setFont("Helvetica-Bold", 10)
    c.drawString(40, y, "Red Flags:")
    c.setFont("Helvetica", 10)
    y = _fit_text(c, row.get("red_flags") or "None auto-detected", 150, y, width - 190)
    y -= 4
    c.setFont("Helvetica-Bold", 10)
    c.drawString(40, y, "Validation Checklist:")
    y -= 16
    c.setFont("Helvetica", 9)
    try:
        checklist = json.loads(row.get("checklist_json") or "[]")
    except json.JSONDecodeError:
        checklist = []
    for item in checklist:
        y = _fit_text(c, f"[ ] {item['task']} -> {item['url']}", 50, y, width - 80, size=9)
        if y < 70:
            c.showPage()
            y = height - 40
            c.setFont("Helvetica", 9)
    c.save()
    return path
