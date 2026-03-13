# NC Counties & Zipcodes Data

- **nc-counties.json** – All 100 North Carolina counties (name + FIPS).
- **nc-zipcodes.json** – One or more zipcodes per county with `zip`, `county`, `lat`, `lon`. The same zip may appear in multiple counties (duplicates allowed). Add more rows to cover every NC zipcode; the app assigns a **color per (county, zipcode)** so each combination has a consistent pin color on the map.

To add more zipcodes: append objects `{"zip":"...","county":"...","lat":...,"lon":...}` to `nc-zipcodes.json`. You can use Census ZCTA-county data or any NC zip/county list with coordinates.
