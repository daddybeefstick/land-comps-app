"""
Maps raw Zillow search API payloads to normalized row dicts.
Based on confirmed /search/bymapbounds response shape only.
"""
from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional

from config import MAX_ACRES, MAX_PURCHASE_PRICE, MIN_ACRES


def _pick(d: Dict[str, Any], *keys: str, default: Any = None) -> Any:
    for key in keys:
        if isinstance(d, dict) and key in d and d[key] not in (None, ""):
            return d[key]
    return default


def _as_listing_list(value: Any) -> Optional[List[Dict[str, Any]]]:
    if isinstance(value, list):
        items = [x for x in value if isinstance(x, dict)]
        if items:
            return items
    return None


def extract_candidates(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Extract listing array from search payload. Handles common Zillow response shapes."""
    candidates, _ = extract_candidates_with_path(payload)
    return candidates


def extract_candidates_with_path(payload: Dict[str, Any]) -> tuple[List[Dict[str, Any]], str]:
    """Extract listing array and the path where it was found (for logging)."""
    for key in ["results", "data", "props", "listings", "searchResults", "mapResults", "listResults"]:
        parsed = _as_listing_list(payload.get(key))
        if parsed:
            return parsed, key
    nested = [
        ("cat1", "searchResults", "listResults"),
        ("cat1", "searchResults", "mapResults"),
        ("cat1", "listResults"),
        ("cat1", "mapResults"),
        ("data", "searchResults", "listResults"),
        ("data", "searchResults", "mapResults"),
        ("searchResults", "listResults"),
        ("searchResults", "mapResults"),
    ]
    for path in nested:
        cur: Any = payload
        for part in path:
            if not isinstance(cur, dict):
                cur = None
                break
            cur = cur.get(part)
        parsed = _as_listing_list(cur)
        if parsed:
            return parsed, ".".join(path)
    stack: List[tuple] = [(payload, "root")]
    while stack:
        node, node_path = stack.pop()
        if isinstance(node, dict):
            for key, val in node.items():
                cur_path = f"{node_path}.{key}"
                parsed = _as_listing_list(val)
                if parsed:
                    return parsed, cur_path
                if isinstance(val, dict):
                    stack.append((val, cur_path))
    return [], "none"


def _to_float(value: Any) -> Optional[float]:
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        cleaned = value.replace(",", "").replace("$", "")
        m = re.search(r"-?\d+(?:\.\d+)?", cleaned)
        if m:
            try:
                return float(m.group(0))
            except ValueError:
                pass
    return None


def _to_int(value: Any, default: int = 0) -> int:
    if value in (None, ""):
        return default
    try:
        return int(float(str(value).replace(",", "")))
    except (TypeError, ValueError):
        return default


def normalize_state_code(value: Any) -> str:
    """Normalize state to 2-letter code."""
    text = str(value or "").strip().upper()
    return text[:2] if len(text) >= 2 else text


def _clean_county_name(value: Any) -> str:
    county = str(value or "").strip()
    if not county or county.isdigit():
        return ""
    if not county.lower().endswith("county"):
        county = f"{county} County"
    return county


def _extract_county(
    listing: Dict[str, Any],
    home_info: Dict[str, Any],
    address_obj: Optional[Dict[str, Any]] = None,
) -> str:
    county = ""
    if isinstance(address_obj, dict):
        county = _clean_county_name(_pick(address_obj, "county", "countyName", default=""))
    if not county:
        county = _clean_county_name(
            _pick(
                listing, "county", "countyName", "countyFullName",
                default=_pick(home_info, "county", "countyName", "countyFullName", default=""),
            )
        )
    region = _pick(listing, "region")
    if not county and isinstance(region, dict):
        county = _clean_county_name(_pick(region, "county", "countyName", "countyFullName", default=""))
    if not county:
        hdp = _pick(listing, "hdpView")
        if isinstance(hdp, dict):
            county = _clean_county_name(_pick(hdp, "county", "countyName", default=""))
    if not county:
        stack: List[Any] = [listing, home_info]
        while stack:
            node = stack.pop()
            if isinstance(node, dict):
                for key, val in node.items():
                    if "county" in str(key).lower() and isinstance(val, str):
                        county = _clean_county_name(val)
                        if county:
                            break
                    if isinstance(val, dict):
                        stack.append(val)
            if county:
                break
    return county


def _normalize_address(item: Dict[str, Any]) -> str:
    addr = _pick(item, "address", "streetAddress", "addr", default="")
    if isinstance(addr, dict):
        parts = [
            _pick(addr, "streetAddress", "line1", "addressLine1", default=""),
            _pick(addr, "city", default=_pick(item, "city", default="")),
            _pick(addr, "state", default=""),
            _pick(addr, "zipcode", "zipCode", default=""),
        ]
        return ", ".join(p for p in parts if p) or "Unknown"
    return str(addr) if addr else "Unknown"


def _normalize_url(item: Dict[str, Any]) -> str:
    url = _pick(item, "detailUrl", "hdpUrl", "url", default="")
    if not url:
        return ""
    url = str(url)
    return f"https://www.zillow.com{url}" if url.startswith("/") else url


def _to_acres(lot_size_value: Any, lot_size_unit: Any) -> Optional[float]:
    size = _to_float(lot_size_value)
    if size is None:
        return None
    unit = str(lot_size_unit or "").strip().lower()
    if unit in ("acre", "acres", "ac"):
        return size
    if unit in ("sqft", "square feet", "square_feet", "squarefeet", "sqfeet", "sf"):
        return size / 43560.0
    if unit in ("sqm", "square meter", "square meters", "m2"):
        return size / 4046.8564224
    if unit in ("hectare", "hectares", "ha"):
        return size * 2.47105381
    return size


def _is_land_listing(item: Dict[str, Any], home_info: Dict[str, Any]) -> bool:
    type_parts = [
        _pick(item, "homeType", "home_type", "propertyType", "property_type", "listingType", default=""),
        _pick(home_info, "homeType", "homeTypeFormatted", "propertyType", default=""),
    ]
    types_text = " ".join(str(p or "") for p in type_parts).lower()
    if any(w in types_text for w in ["lot", "land"]):
        return True
    lot_markers = [
        _pick(item, "lotAreaValue", "lotSize", "acreage", "lotAreaString"),
        _pick(home_info, "lotAreaValue", "lotSize", "lotAreaString"),
    ]
    return any(m not in (None, "") for m in lot_markers)


def map_search_payload(payload: Dict[str, Any], state_code: str) -> List[Dict[str, Any]]:
    """
    Map raw /search/bymapbounds response to normalized row dicts.
    Only includes listings that pass acre/price filters and state match.
    """
    candidates = extract_candidates(payload)
    if not candidates:
        return []

    rows: List[Dict[str, Any]] = []
    requested_state = normalize_state_code(state_code)
    min_acres = MIN_ACRES
    max_acres = MAX_ACRES
    max_price = MAX_PURCHASE_PRICE

    for item in candidates:
        listing = _pick(item, "property", default=item)
        if not isinstance(listing, dict):
            listing = item
        hdp = _pick(listing, "hdpData", default={})
        home_info = _pick(hdp, "homeInfo", default={}) if isinstance(hdp, dict) else {}
        if not _is_land_listing(listing, home_info):
            continue

        price_obj = _pick(listing, "price", default={})
        price = _to_float(_pick(price_obj, "value", default=price_obj) if isinstance(price_obj, dict) else price_obj)
        if price is None:
            price = _to_float(_pick(listing, "unformattedPrice", default=_pick(home_info, "price")))

        lot_unit = _pick(listing, "lotSizeWithUnit", default={})
        lot_size = _pick(lot_unit, "lotSize") if isinstance(lot_unit, dict) else None
        lot_u = _pick(lot_unit, "lotSizeUnit") if isinstance(lot_unit, dict) else None
        acres = _to_acres(lot_size, lot_u)
        if acres is None:
            acres = _to_float(
                _pick(
                    listing,
                    "lotAreaValue", "lotSize", "acreage", "lotAreaValueRaw", "lotAreaString",
                    default=_pick(home_info, "lotAreaValue", "lotSize", "lotAreaString"),
                )
            )
        if price is None or acres is None:
            continue
        if acres < min_acres or acres > max_acres or price > max_price:
            continue

        zpid = str(_pick(listing, "zpid", "id", "property_id", default=_pick(home_info, "zpid", default="")))
        addr_obj = _pick(listing, "address", default={})
        if isinstance(addr_obj, dict):
            street = _pick(addr_obj, "streetAddress", "line1", "addressLine1", default="")
            city = _pick(addr_obj, "city", default="")
            state = _pick(addr_obj, "state", default="")
            zipcode = _pick(addr_obj, "zipcode", "zipCode", default="")
            county = _extract_county(listing, home_info, addr_obj)
            address = ", ".join(p for p in [street, city, state, zipcode] if p) or _normalize_address(listing)
        else:
            address = _normalize_address(listing)
            city = _pick(listing, "city", default=_pick(home_info, "city", default=""))
            state = _pick(listing, "state", default=_pick(home_info, "state", default=""))
            zipcode = _pick(listing, "zipcode", "zipCode", default=_pick(home_info, "zipcode", "zip", default=""))
            county = _extract_county(listing, home_info)

        if normalize_state_code(state) != requested_state:
            continue

        loc = _pick(listing, "location", default={})
        lat = _to_float(_pick(loc, "latitude") if isinstance(loc, dict) else None)
        lng = _to_float(_pick(loc, "longitude") if isinstance(loc, dict) else None)
        if lat is None or lng is None:
            ll = _pick(listing, "latLong", default={})
            lat = _to_float(_pick(listing, "latitude", "lat", default=_pick(ll, "latitude", "lat")))
            lng = _to_float(_pick(listing, "longitude", "lon", "lng", default=_pick(ll, "longitude", "lng", "lon")))

        hdp_view = _pick(listing, "hdpView", default={})
        hdp_url = _pick(hdp_view, "hdpUrl", default="") if isinstance(hdp_view, dict) else ""
        url = _normalize_url({"hdpUrl": hdp_url}) if hdp_url else _normalize_url(listing)

        zoning = _pick(listing, "zoning", "zoningDescription", default="")
        days_on_market = _to_int(_pick(listing, "daysOnZillow", "days_on_zillow", "daysOnMarket", default=0))
        property_type = _pick(listing, "propertyType", "homeType", default=_pick(home_info, "propertyType", default="land"))

        rows.append({
            "source": "private-zillow",
            "state": requested_state,
            "county": str(county or ""),
            "address": str(address or "Unknown"),
            "city": str(city or ""),
            "zipcode": str(zipcode or ""),
            "zpid": zpid or f"{state_code}-{address}-{price}-{acres}",
            "url": url,
            "price": price,
            "acres": acres,
            "price_per_acre": round(price / acres, 2) if acres else None,
            "days_on_market": days_on_market,
            "latitude": lat,
            "longitude": lng,
            "zoning": str(zoning or ""),
            "property_type": str(property_type or "land").lower(),
            "raw_json": json.dumps(item),
        })
    return rows
