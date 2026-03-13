import json
import sys
from pathlib import Path

import folium
import pandas as pd
import streamlit as st
from streamlit_folium import st_folium

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from database.db import fetch_dataframe  # noqa: E402

st.set_page_config(page_title="Deal Scout Dashboard", layout="wide")

st.title("Land Subdivision Deal Scout")

df = fetch_dataframe(
    """
    SELECT p.address, p.city, p.county, p.state, p.price, p.acres, p.price_per_acre,
           p.latitude, p.longitude, p.url,
           s.county_median_ppa, s.percent_below_median, s.estimated_lots,
           s.net_profit, s.commission, s.score, s.status, s.red_flags, s.checklist_json
    FROM properties p
    JOIN scored_properties s ON s.property_id = p.id
    ORDER BY s.score DESC, s.net_profit DESC
    """
)

if df.empty:
    st.warning("No scored properties found yet. Run collector.py, then filter.py.")
    st.stop()

state_options = sorted(df["state"].dropna().unique().tolist())
selected_states = st.multiselect("States", state_options, default=state_options)
min_score = st.slider("Min score", 0, 100, 60)
max_price = st.number_input("Max price", min_value=0, value=500000, step=10000)

view = df[(df["state"].isin(selected_states)) & (df["score"] >= min_score) & (df["price"] <= max_price)]

col1, col2, col3 = st.columns(3)
col1.metric("Total properties scored", len(df))
col2.metric("Passing review", int((df["status"] == "review").sum()))
col3.metric("Potential scout fees", f"${view['commission'].clip(lower=0).sum():,.0f}")

st.dataframe(view[[
    "state", "county", "address", "price", "acres", "price_per_acre",
    "percent_below_median", "estimated_lots", "net_profit", "commission", "score", "status"
]], use_container_width=True)

map_df = view.dropna(subset=["latitude", "longitude"]).copy()
if not map_df.empty:
    center = [map_df["latitude"].astype(float).mean(), map_df["longitude"].astype(float).mean()]
    fmap = folium.Map(location=center, zoom_start=6)
    for _, row in map_df.iterrows():
        color = "green" if row["score"] >= 80 else "orange" if row["score"] >= 60 else "red"
        popup = f"{row['address']}<br>Score: {row['score']}<br>Net: ${row['net_profit']:,.0f}"
        folium.Marker([float(row["latitude"]), float(row["longitude"])], popup=popup, icon=folium.Icon(color=color)).add_to(fmap)
    st_folium(fmap, width=1200, height=500)

st.subheader("Checklist")
choice = st.selectbox("Select a property", view["address"].tolist())
selected = view[view["address"] == choice].iloc[0]
try:
    checklist = json.loads(selected["checklist_json"] or "[]")
except json.JSONDecodeError:
    checklist = []
for item in checklist:
    st.write(f"- {item['task']}: {item['url']}")
