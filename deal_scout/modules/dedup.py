"""
Shared deduplication for NC/SC review pipeline.
Catches same-property listings with different zpids (e.g. "448 Batts Island Rd" vs "448 Batts Island Rd Lot 33").
"""
import re
from typing import Any, Dict


_STREET_ABBREVS = [
    (r"\btrl\b", "trail"),
    (r"\bdr\b", "drive"),
    (r"\brd\b", "road"),
    (r"\bln\b", "lane"),
    (r"\bst\b", "street"),
    (r"\bave\b", "avenue"),
    (r"\bhwy\b", "highway"),
    (r"\bct\b", "court"),
    (r"\bcir\b", "circle"),
]


def _normalize_street(addr: str) -> str:
    """Strip lot/unit suffixes and normalize abbreviations for matching same physical location."""
    s = (addr or "").strip().lower()
    # Remove Lot X, Lot X & Y, Lot X-Y-Z
    s = re.sub(r"\s+lot\s+\d+(\s*&\s*\d+)*", "", s, flags=re.I)
    s = re.sub(r"\s+lot\s+\d+-\d+-\d+", "", s, flags=re.I)
    # Remove Unit X, #X
    s = re.sub(r"\s+unit\s+\w+", "", s, flags=re.I)
    s = re.sub(r"\s+#\s*[a-zA-Z0-9\-]+", "", s)
    # Remove TBD prefix
    s = re.sub(r"^tbd\s+", "", s, flags=re.I)
    # Remove TRACT 1 prefix
    s = re.sub(r"^tract\s+1\s+", "", s, flags=re.I)
    # Normalize abbreviations (Trl -> trail so "Sheets Trl" matches "Sheets Trail")
    for pat, repl in _STREET_ABBREVS:
        s = re.sub(pat, repl, s, flags=re.I)
    # Keep alphanumeric, spaces, dots
    s = "".join(c for c in s if c.isalnum() or c in " .-")
    return " ".join(s.split()).strip()


def addr_key_for_dedup(row: Dict[str, Any]) -> str:
    """
    Stable key for address-based dedup. Same physical property (even with different
    zpid or "Lot 33" vs no lot) yields same key.
    """
    addr = (row.get("address") or "").strip()
    city = (row.get("city") or "").strip().lower()
    state = (str(row.get("state") or "").strip().upper())
    zipcode = str(row.get("zipcode") or "").strip()
    price = str(row.get("price") or "").strip()
    # Round price for float tolerance
    try:
        price = f"{float(price):.0f}"
    except (TypeError, ValueError):
        pass
    street = _normalize_street(addr)
    parts = ["".join(c for c in p if c.isalnum() or c in " .-") for p in [street, city, state, zipcode, price]]
    return "|".join(parts)


def is_duplicate(
    row: Dict[str, Any],
    seen_zpid: set[str],
    seen_addr: set[str],
) -> bool:
    """Return True if row is a duplicate (by zpid or normalized address)."""
    zpid = (row.get("zpid") or "").strip()
    ak = addr_key_for_dedup(row)
    if zpid and zpid in seen_zpid:
        return True
    if ak and ak in seen_addr:
        return True
    return False


def add_to_seen(row: Dict[str, Any], seen_zpid: set[str], seen_addr: set[str]) -> None:
    """Mark row as seen for dedup."""
    zpid = (row.get("zpid") or "").strip()
    ak = addr_key_for_dedup(row)
    if zpid:
        seen_zpid.add(zpid)
    if ak:
        seen_addr.add(ak)


def dedupe_rows(rows: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
    """Return rows with duplicates removed (keep first occurrence)."""
    seen_zpid: set[str] = set()
    seen_addr: set[str] = set()
    out: list[Dict[str, Any]] = []
    for r in rows:
        if is_duplicate(r, seen_zpid, seen_addr):
            continue
        add_to_seen(r, seen_zpid, seen_addr)
        out.append(r)
    return out
