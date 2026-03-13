import sqlite3
from pathlib import Path
from typing import Iterable, Mapping

from config import DATABASE_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS properties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT,
    state TEXT,
    county TEXT,
    address TEXT,
    city TEXT,
    zipcode TEXT,
    zpid TEXT UNIQUE,
    url TEXT,
    price REAL,
    acres REAL,
    price_per_acre REAL,
    days_on_market INTEGER,
    latitude REAL,
    longitude REAL,
    zoning TEXT,
    property_type TEXT,
    raw_json TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scored_properties (
    property_id INTEGER PRIMARY KEY,
    county_median_ppa REAL,
    percent_below_median REAL,
    estimated_lots INTEGER,
    gross_revenue REAL,
    estimated_costs REAL,
    net_profit REAL,
    roi_pct REAL,
    commission REAL,
    score INTEGER,
    status TEXT,
    red_flags TEXT,
    checklist_json TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(property_id) REFERENCES properties(id)
);
"""


def get_connection():
    Path(DATABASE_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_connection() as conn:
        conn.executescript(SCHEMA)
        conn.commit()


def upsert_properties(rows: Iterable[Mapping]) -> int:
    query = """
    INSERT INTO properties (
        source, state, county, address, city, zipcode, zpid, url, price, acres,
        price_per_acre, days_on_market, latitude, longitude, zoning, property_type, raw_json,
        updated_at
    ) VALUES (
        :source, :state, :county, :address, :city, :zipcode, :zpid, :url, :price, :acres,
        :price_per_acre, :days_on_market, :latitude, :longitude, :zoning, :property_type, :raw_json,
        CURRENT_TIMESTAMP
    )
    ON CONFLICT(zpid) DO UPDATE SET
        source=excluded.source,
        state=excluded.state,
        county=excluded.county,
        address=excluded.address,
        city=excluded.city,
        zipcode=excluded.zipcode,
        url=excluded.url,
        price=excluded.price,
        acres=excluded.acres,
        price_per_acre=excluded.price_per_acre,
        days_on_market=excluded.days_on_market,
        latitude=excluded.latitude,
        longitude=excluded.longitude,
        zoning=excluded.zoning,
        property_type=excluded.property_type,
        raw_json=excluded.raw_json,
        updated_at=CURRENT_TIMESTAMP
    """
    with get_connection() as conn:
        conn.executemany(query, list(rows))
        conn.commit()
        return conn.total_changes


def replace_scores(rows: Iterable[Mapping]) -> None:
    query = """
    INSERT INTO scored_properties (
        property_id, county_median_ppa, percent_below_median, estimated_lots, gross_revenue,
        estimated_costs, net_profit, roi_pct, commission, score, status, red_flags,
        checklist_json, updated_at
    ) VALUES (
        :property_id, :county_median_ppa, :percent_below_median, :estimated_lots, :gross_revenue,
        :estimated_costs, :net_profit, :roi_pct, :commission, :score, :status, :red_flags,
        :checklist_json, CURRENT_TIMESTAMP
    )
    ON CONFLICT(property_id) DO UPDATE SET
        county_median_ppa=excluded.county_median_ppa,
        percent_below_median=excluded.percent_below_median,
        estimated_lots=excluded.estimated_lots,
        gross_revenue=excluded.gross_revenue,
        estimated_costs=excluded.estimated_costs,
        net_profit=excluded.net_profit,
        roi_pct=excluded.roi_pct,
        commission=excluded.commission,
        score=excluded.score,
        status=excluded.status,
        red_flags=excluded.red_flags,
        checklist_json=excluded.checklist_json,
        updated_at=CURRENT_TIMESTAMP
    """
    with get_connection() as conn:
        conn.executemany(query, list(rows))
        conn.commit()


def fetch_dataframe(query: str):
    import pandas as pd
    with get_connection() as conn:
        return pd.read_sql_query(query, conn)
