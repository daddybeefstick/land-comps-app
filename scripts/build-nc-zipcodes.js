/**
 * Build nc-zipcodes.json from nc-zips-raw.txt
 * Raw format: NC\tzip\tCounty Name (tab-separated, one per line)
 * Uses county centroids for lat/lon (from seed)
 */
const fs = require('fs');
const path = require('path');

const COUNTY_CENTROIDS = {
  Alamance: [36.09, -79.44],
  Alexander: [35.92, -81.18],
  Alleghany: [36.5, -81.12],
  Anson: [34.97, -80.1],
  Ashe: [36.43, -81.47],
  Avery: [36.08, -81.92],
  Beaufort: [35.48, -76.83],
  Bertie: [36.06, -76.96],
  Bladen: [34.61, -78.56],
  Brunswick: [34.07, -78.04],
  Buncombe: [35.6, -82.55],
  Burke: [35.74, -81.7],
  Cabarrus: [35.39, -80.55],
  Caldwell: [35.95, -81.55],
  Camden: [36.34, -76.16],
  Carteret: [34.73, -76.82],
  Caswell: [36.39, -79.33],
  Catawba: [35.66, -81.21],
  Chatham: [35.7, -79.26],
  Cherokee: [35.07, -84.06],
  Chowan: [36.13, -76.6],
  Clay: [35.06, -83.75],
  Cleveland: [35.33, -81.55],
  Columbus: [34.26, -78.66],
  Craven: [35.11, -77.04],
  Cumberland: [35.05, -78.88],
  Currituck: [36.45, -75.98],
  Dare: [35.89, -75.67],
  Davidson: [35.79, -80.21],
  Davie: [35.94, -80.54],
  Duplin: [34.93, -77.96],
  Durham: [35.99, -78.9],
  Edgecombe: [35.91, -77.6],
  Forsyth: [36.1, -80.24],
  Franklin: [36.08, -78.3],
  Gaston: [35.26, -81.18],
  Gates: [36.44, -76.7],
  Graham: [35.35, -83.83],
  Granville: [36.3, -78.65],
  Greene: [35.48, -77.68],
  Guilford: [36.08, -79.79],
  Halifax: [36.26, -77.65],
  Harnett: [35.37, -78.87],
  Haywood: [35.53, -82.98],
  Henderson: [35.34, -82.46],
  Hertford: [36.36, -76.98],
  Hoke: [35.02, -79.24],
  Hyde: [35.55, -76.25],
  Iredell: [35.81, -80.87],
  Jackson: [35.28, -83.14],
  Johnston: [35.52, -78.36],
  Jones: [35.02, -77.36],
  Lee: [35.47, -79.18],
  Lenoir: [35.24, -77.58],
  Lincoln: [35.49, -81.22],
  McDowell: [35.68, -82.05],
  Macon: [35.15, -83.42],
  Madison: [35.86, -82.71],
  Martin: [35.84, -77.18],
  Mecklenburg: [35.23, -80.84],
  Mitchell: [35.92, -82.06],
  Montgomery: [35.33, -79.91],
  Moore: [35.31, -79.48],
  Nash: [35.97, -77.99],
  "New Hanover": [34.21, -77.88],
  Northampton: [36.42, -77.4],
  Onslow: [34.75, -77.41],
  Orange: [35.99, -79.07],
  Pamlico: [35.15, -76.67],
  Pasquotank: [36.26, -76.25],
  Pender: [34.52, -77.9],
  Perquimans: [36.18, -76.41],
  Person: [36.39, -78.97],
  Pitt: [35.59, -77.37],
  Polk: [35.28, -82.17],
  Randolph: [35.71, -79.81],
  Richmond: [35, -79.76],
  Robeson: [34.62, -79.1],
  Rockingham: [36.4, -79.78],
  Rowan: [35.64, -80.52],
  Rutherford: [35.4, -81.92],
  Sampson: [34.99, -78.37],
  Scotland: [34.84, -79.48],
  Stanly: [35.31, -80.25],
  Stokes: [36.4, -80.24],
  Surry: [36.41, -80.69],
  Swain: [35.49, -83.49],
  Transylvania: [35.2, -82.73],
  Tyrrell: [35.87, -76.17],
  Union: [34.99, -80.53],
  Vance: [36.36, -78.41],
  Wake: [35.78, -78.64],
  Warren: [36.4, -78.1],
  Washington: [35.84, -76.57],
  Watauga: [36.23, -81.69],
  Wayne: [35.36, -77.98],
  Wilkes: [36.16, -81.16],
  Wilson: [35.72, -77.92],
  Yadkin: [36.13, -80.66],
  Yancey: [35.9, -82.31],
};

const rawPath = path.join(__dirname, '../data/nc-zips-raw.txt');
const outPath = path.join(__dirname, '../data/nc-zipcodes.json');

let raw;
try {
  raw = fs.readFileSync(rawPath, 'utf8');
} catch (e) {
  console.error('Create data/nc-zips-raw.txt with your paste (NC, zip, county per line, tab-separated)');
  process.exit(1);
}

const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const out = [];

for (const line of lines) {
  const parts = line.split(/\t/).map((p) => p.trim());
  if (parts.length < 3) continue;
  if (parts[3] === 'Green' && parts[4] === 'Yellow' && parts[5] === 'Red') continue;
  const zip = parts[1];
  const countyFull = parts[2];
  if (!zip || !/^\d{5}$/.test(zip)) continue;
  const county = countyFull.replace(/\s+County$/i, '').trim();
  const coords = COUNTY_CENTROIDS[county] || [35.5, -79];
  out.push({
    zip,
    county,
    lat: coords[0],
    lon: coords[1],
  });
}

fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log('Wrote', out.length, 'zipcodes to data/nc-zipcodes.json');
