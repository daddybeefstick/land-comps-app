"""
Disk cache for Zillow enrichment lookups (by zpid, url, or address).
NOT used for search results — search is not cached.
"""
from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path
from typing import Any, Optional

from config import CACHE_DIR, ZILLOW_CACHE_TTL_HOURS


def _cache_dir() -> Path:
    d = CACHE_DIR / "zillow_enrichment"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _key_path(key: str) -> Path:
    safe = hashlib.sha256(key.encode()).hexdigest()[:32]
    return _cache_dir() / f"{safe}.json"


def _is_stale(path: Path, ttl_hours: float) -> bool:
    if not path.exists():
        return True
    age_hours = (time.time() - path.stat().st_mtime) / 3600.0
    return age_hours >= ttl_hours


def get_enrichment(key: str, ttl_hours: Optional[float] = None) -> Optional[dict]:
    """
    Get cached enrichment payload by key (zpid, url, or address).
    Returns None if miss or stale.
    """
    ttl = ttl_hours if ttl_hours is not None else ZILLOW_CACHE_TTL_HOURS
    path = _key_path(key)
    if _is_stale(path, ttl):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


def set_enrichment(key: str, payload: dict, ttl_hours: Optional[float] = None) -> None:
    """Store enrichment payload in cache. ttl_hours only affects expiry, not write."""
    path = _key_path(key)
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=None)
    except OSError:
        pass
