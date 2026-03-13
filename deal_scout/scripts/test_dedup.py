#!/usr/bin/env python3
"""Verify dedup removes known duplicate (448 Batts Island Rd vs Lot 33)."""
import csv
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
import sys

sys.path.insert(0, str(ROOT))

from modules.dedup import addr_key_for_dedup, dedupe_rows, is_duplicate, add_to_seen


def test_batts_island():
    """448 Batts Island Rd and 448 Batts Island Rd Lot 33 must dedupe."""
    r1 = {
        "address": "448 Batts Island Rd Lot 33",
        "city": "Edenton",
        "state": "NC",
        "zipcode": "27932",
        "price": "75000",
        "zpid": "460940771",
    }
    r2 = {
        "address": "448 Batts Island Rd",
        "city": "Edenton",
        "state": "NC",
        "zipcode": "27932",
        "price": "75000",
        "zpid": "233560415",
    }
    assert addr_key_for_dedup(r1) == addr_key_for_dedup(r2)
    seen_z, seen_a = set(), set()
    add_to_seen(r1, seen_z, seen_a)
    assert is_duplicate(r2, seen_z, seen_a)
    out = dedupe_rows([r1, r2])
    assert len(out) == 1


def test_dedup_preserves_distinct():
    """Different addresses must not dedupe."""
    r1 = {"address": "123 Main St", "city": "A", "state": "NC", "zipcode": "12345", "price": "100000", "zpid": "1"}
    r2 = {"address": "456 Oak Ave", "city": "B", "state": "SC", "zipcode": "67890", "price": "200000", "zpid": "2"}
    out = dedupe_rows([r1, r2])
    assert len(out) == 2


def test_pick_csv_no_duplicates():
    """nc_sc_review_list.csv must have zero duplicates by our key."""
    path = ROOT / "exports" / "nc_sc_review_list.csv"
    if not path.exists():
        print("Skip: nc_sc_review_list.csv not found (run pick first)")
        return
    seen = set()
    with path.open(newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            k = addr_key_for_dedup(r)
            assert k not in seen, f"Duplicate found: {r.get('address')} (key={k})"
            seen.add(k)
    print(f"OK: {len(seen)} unique properties in review list")


if __name__ == "__main__":
    test_batts_island()
    test_dedup_preserves_distinct()
    test_pick_csv_no_duplicates()
    print("All dedup tests passed.")
