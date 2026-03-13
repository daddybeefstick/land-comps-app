"""
Best NC and SC counties for subdivision land, derived from Zillow County Sales data.
NC data from: Zillow Automated County Input - NC County Sales Per Zillow.pdf
Ratio = Sold (6mo) / For Sale — higher = hotter market, better absorption.

Prioritized for 5–50 acre subdivision parcels; includes counties with strong
5-10 acre and Over 10 acre ratios.
"""
from typing import Set


def _norm(name: str) -> str:
    """Normalize county name for matching (e.g. 'Alamance County' -> 'alamance')."""
    s = (name or "").strip().lower()
    for suffix in (" county", " nc", " sc", " north carolina", " south carolina"):
        if s.endswith(suffix):
            s = s[:-len(suffix)].strip()
    return s


# Best NC counties from PDF — high Sold/For Sale ratio in subdivision acreage (5–10, Over 10)
# Ranked by 6-month ratio in relevant acreage buckets
BEST_NC_COUNTIES: Set[str] = {
    "brunswick",      # 1-5: 8.53, very hot
    "johnston",      # 1/2-1: 4.00, 1-5: 1.44
    "davidson",      # 5-10: 4.00, 1-5: 1.23
    "surry",         # 5-10: 4.43, 1-5: 1.14
    "stokes",        # 5-10: 5.50
    "warren",        # 5-10: 4.50
    "randolph",      # 1-5: 3.05
    "granville",     # 5-10: 3.20, 1-5: 2.68
    "pasquotank",    # 5-10: 3.33, 1-5: 3.25
    "rowan",         # 5-10: 2.88, 1-5: 1.30
    "onslow",        # 5-10: 2.30
    "caswell",       # 1-5: 2.07
    "haywood",       # 5-10: 2.06
    "burke",         # 5-10: 1.86
    "scotland",      # 1/2-1: 6.00
    "cumberland",    # Over 10: 1.80
    "pender",        # 1/2-1: 2.04, 1-5: 1.78
    "cabarrus",      # 5-10: 1.75
    "person",        # 1-5: 1.26, 5-10: 1.46
    "franklin",      # 1-5: 1.44
    "nash",          # 1/2-1: 1.25, 1-5: 1.08
    "lincoln",       # solid across
    "moore",         # solid across
    "craven",        # 1-5: 1.30, 5-10: 1.10
    "gaston",        # 1/2-1: 1.62, 1-5: 1.31
    "catawba",       # 1/2-1: 1.80, 1-5: 1.14
    "wake",          # 1-5: 1.03
    "lenoir",        # balanced
    "currituck",     # 1-5: 1.19
    "cleveland",     # 5-10: 1.27
}

# SC: No Zillow PDF provided; include all SC (pipeline will still filter by score)
# Set to None to include all SC counties
BEST_SC_COUNTIES: Set[str] | None = None


def is_priority_county(state: str, county: str) -> bool:
    """Return True if county is in our priority list for that state."""
    norm = _norm(county)
    state_upper = (state or "").strip().upper()
    if state_upper == "NC":
        return norm in BEST_NC_COUNTIES
    if state_upper == "SC":
        if BEST_SC_COUNTIES is None:
            return True
        return norm in BEST_SC_COUNTIES
    return False
