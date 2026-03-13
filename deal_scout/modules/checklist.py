import json
from urllib.parse import quote_plus


def build_checklist(row: dict) -> str:
    county = str(row.get("county") or "").strip()
    state = row.get("state") or ""
    lat = row.get("latitude")
    lon = row.get("longitude")
    coords = f"{lat},{lon}" if lat and lon else ""
    google_maps = f"https://www.google.com/maps/search/?api=1&query={quote_plus(coords or row.get('address',''))}"
    fema = f"https://msc.fema.gov/portal/search?AddressQuery={quote_plus(coords or row.get('address',''))}"
    if county:
        gis = f"https://www.google.com/search?q={quote_plus(f'{county} {state} GIS zoning map')}"
        deed = f"https://www.google.com/search?q={quote_plus(f'{county} {state} register of deeds')}"
        utilities = f"https://www.google.com/search?q={quote_plus(f'{county} {state} utility district')}"
        health = f"https://www.google.com/search?q={quote_plus(f'{county} {state} septic soil data')}"
        zoning_task = "Verify zoning allows residential subdivision"
        utilities_task = "Verify utilities available"
        deed_task = "Pull deed restrictions"
        septic_task = "Confirm septic suitability"
    else:
        gis = ""
        deed = ""
        utilities = ""
        health = ""
        zoning_task = "Verify zoning allows residential subdivision (manual lookup needed: county missing)"
        utilities_task = "Verify utilities available (manual lookup needed: county missing)"
        deed_task = "Pull deed restrictions (manual lookup needed: county missing)"
        septic_task = "Confirm septic suitability (manual lookup needed: county missing)"
    items = [
        {"task": zoning_task, "url": gis},
        {"task": "Confirm road frontage on Google Maps Street View", "url": google_maps},
        {"task": "Check FEMA flood map", "url": fema},
        {"task": utilities_task, "url": utilities},
        {"task": deed_task, "url": deed},
        {"task": septic_task, "url": health},
    ]
    return json.dumps(items)
