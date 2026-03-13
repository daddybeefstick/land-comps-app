/**
 * Compare colors CSV vs API CSV to find missing zips.
 * Run: 1) STATE=SC set OUTPUT_PATH=data/scraped-sc-api.csv && npm run scrape:nc:api
 *      2) node scripts/diff-missing-zips.js sc
 * Or: node scripts/diff-missing-zips.js [state]
 */

const fs = require('fs');
const path = require('path');

const state = (process.argv[2] || process.env.STATE || 'nc').toLowerCase();
const colorsPath = path.join(__dirname, `../data/scraped-${state}-zipcodes.csv`);
const apiPath = path.join(__dirname, `../data/scraped-${state}-api.csv`);

function parseCsv(p) {
  const text = fs.readFileSync(p, 'utf8');
  const lines = text.trim().split('\n').slice(1).filter(Boolean);
  return lines.map((line) => {
    const parts = line.split(',');
    return { zip: parts[1]?.trim() || '', county: (parts[2] || '').replace(/^"|"$/g, '').trim() };
  }).filter((r) => /^\d{5}$/.test(r.zip));
}

function main() {
  if (!fs.existsSync(apiPath)) {
    console.log(`Run the API scraper first to get the full list for ${state}:`);
    console.log(`  set OUTPUT_PATH=data/scraped-${state}-api.csv`);
    console.log('  set SKIP_PROMPT=1');
    console.log(`  set STATE=${state.toUpperCase()}`);
    console.log('  npm run scrape:nc:api');
    console.log('\nThen run this script again.');
    process.exit(1);
  }
  if (!fs.existsSync(colorsPath)) {
    console.log(`scraped-${state}-zipcodes.csv not found. Run STATE=${state.toUpperCase()} npm run scrape:nc first.`);
    process.exit(1);
  }

  const colorsRows = parseCsv(colorsPath);
  const apiRows = parseCsv(apiPath);

  const colorsSet = new Set(colorsRows.map((r) => `${r.county}|${r.zip}`));
  const missing = apiRows.filter((r) => !colorsSet.has(`${r.county}|${r.zip}`));

  console.log(`Colors CSV: ${colorsRows.length} rows`);
  console.log(`API CSV: ${apiRows.length} rows`);
  console.log(`Missing from colors list: ${missing.length}\n`);

  if (missing.length === 0) {
    console.log('None - you have all zips with colors.');
    return;
  }

  const byCounty = {};
  for (const r of missing) {
    if (!byCounty[r.county]) byCounty[r.county] = [];
    byCounty[r.county].push(r.zip);
  }

  const sorted = Object.keys(byCounty).sort();
  for (const county of sorted) {
    byCounty[county].sort();
    console.log(`${county}: ${byCounty[county].join(', ')}`);
  }
}

main();
