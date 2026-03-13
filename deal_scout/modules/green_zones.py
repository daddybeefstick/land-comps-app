"""
Load green-zone zipcodes from scraped-nc-zipcodes.xlsx.
Green zone = rows where Green column == "Green" in NC and SC sheets.
"""
from pathlib import Path
from typing import Set


def load_green_zone_zips(excel_path: Path) -> Set[str]:
    """
    Load zipcodes from NC and SC sheets where Green column is "Green".
    Returns a set of zipcode strings (normalized for comparison).
    """
    try:
        import pandas as pd
    except ImportError:
        raise RuntimeError("pandas required for green zone Excel. Install: pip install pandas openpyxl")

    if not excel_path.exists():
        raise FileNotFoundError(
            f"Green zone Excel not found: {excel_path}\n"
            "Set GREEN_ZONE_EXCEL_PATH in .env or place scraped-nc-zipcodes.xlsx in Downloads."
        )

    result: Set[str] = set()
    sheets = ["scraped-nc-zipcodes", "scraped-SC-zipcodes"]

    for sheet_name in sheets:
        try:
            df = pd.read_excel(excel_path, sheet_name=sheet_name)
        except Exception as e:
            raise RuntimeError(f"Failed to read sheet '{sheet_name}' from {excel_path}: {e}")

        if "Green" not in df.columns:
            continue

        green_rows = df[df["Green"].fillna("").astype(str).str.strip() == "Green"]
        for _, row in green_rows.iterrows():
            z = row.get("Zip")
            if pd.isna(z):
                continue
            zstr = str(int(float(z))) if isinstance(z, (int, float)) else str(z).strip()
            if zstr and zstr.isdigit():
                result.add(zstr)

    return result
