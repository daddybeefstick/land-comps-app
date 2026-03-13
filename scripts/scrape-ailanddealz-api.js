/**
 * Scrape zipcodes via AI Land Dealz API (no DOM clicking).
 * Run: STATE=SC npm run scrape:nc:api
 *      node scripts/scrape-ailanddealz-api.js SC
 * Output: data/scraped-{state}-zipcodes.csv (or OUTPUT_PATH)
 * Color: API doesn't include color; uses hash (Green/Yellow/Red).
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const STATE_IDS = { NC: 38, SC: 48, VA: 52, GA: 13, FL: 12, TX: 49 };

function getStateConfig() {
  let stateAbbr = (process.env.STATE || '').toUpperCase().trim();
  let stateId = process.env.STATE_ID ? parseInt(process.env.STATE_ID, 10) : null;
  const arg = process.argv[2];
  if (arg) {
    if (/^\d+$/.test(arg)) stateId = parseInt(arg, 10);
    else if (/^[A-Za-z]{2}$/.test(arg)) stateAbbr = arg.toUpperCase();
  }
  if (!stateId && stateAbbr && STATE_IDS[stateAbbr]) stateId = STATE_IDS[stateAbbr];
  if (!stateId) stateId = 38;
  if (!stateAbbr) {
    const entry = Object.entries(STATE_IDS).find(([, id]) => id === stateId);
    stateAbbr = entry ? entry[0] : 'XX';
  }
  return { stateAbbr, stateId };
}

const BASE_URL = 'https://app.ailanddealz.com';
const USER_DATA_DIR = path.join(__dirname, '../.puppeteer-session');

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, () => { rl.close(); resolve(); });
  });
}

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function getColorForZip(county, zip) {
  const key = `${county.toLowerCase().trim()}|${zip.trim()}`;
  const i = hashString(key) % 3;
  return ['Green', 'Yellow', 'Red'][i];
}

function csvEscape(s) {
  const t = String(s ?? '');
  return t.includes(',') || t.includes('"') ? `"${t.replace(/"/g, '""')}"` : t;
}

async function main() {
  console.log('Launching browser (session only)...');
  const browser = await puppeteer.launch({
    headless: process.env.HEADLESS === '1',
    defaultViewport: { width: 1280, height: 800 },
    args: ['--no-sandbox'],
    userDataDir: USER_DATA_DIR,
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36');

  const { stateAbbr, stateId } = getStateConfig();
  console.log(`State: ${stateAbbr} (id=${stateId})\n`);

  const allRows = [];

  try {
    console.log('Loading session...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 60000 });
    await wait(3000);

    const skipPrompt = process.env.SKIP_PROMPT === '1';
    if (!skipPrompt) {
      console.log('\n>>> If not logged in, run scrape:nc once to log in. <<<');
      console.log('>>> Press ENTER to continue (or Ctrl+C to abort)... <<<');
      await ask('');
    }

    console.log(`Navigating to ${stateAbbr} browse page...`);
    let countiesPromise;
    const countiesListener = (response) => {
      const url = response.url();
      if (url.includes(`get-counties-by-state/${stateId}`)) {
        countiesPromise = response.text();
      }
    };
    page.on('response', countiesListener);

    await page.goto(`${BASE_URL}/properties/browse?state_id=${stateId}`, { waitUntil: 'networkidle0', timeout: 60000 });
    await wait(3000);
    page.off('response', countiesListener);

    if (!countiesPromise) {
      throw new Error('Counties API was not called. Page may have redirected to login.');
    }

    console.log(`Fetching ${stateAbbr} counties...`);
    const countiesText = await countiesPromise;
    if (!countiesText || !countiesText.trim()) {
      throw new Error('Counties API returned empty. Log in at app.ailanddealz.com and try again.');
    }
    let counties;
    try {
      counties = JSON.parse(countiesText.trim());
    } catch (e) {
      throw new Error('Invalid JSON from counties API. Response: ' + countiesText.slice(0, 200));
    }

    const countyEntries = Object.entries(counties);
    console.log(`Found ${countyEntries.length} counties`);

    for (const [countyId, countyName] of countyEntries) {
      const countyDisplay = countyName.endsWith(' County') ? countyName : countyName + ' County';
      try {
        let subsPromise;
        const subsListener = (response) => {
          if (response.url().includes(`get-subdivisions-by-county/${countyId}`)) {
            subsPromise = response.text();
          }
        };
        page.on('response', subsListener);

        await page.goto(`${BASE_URL}/properties/browse?state_id=${stateId}&county_id=${countyId}`, {
          waitUntil: 'networkidle0',
          timeout: 15000,
        });
        await wait(1500);
        page.off('response', subsListener);

        let subs = {};
        if (subsPromise) {
          try {
            const subsText = await subsPromise;
            if (subsText?.trim()) subs = JSON.parse(subsText.trim());
          } catch {
            subs = {};
          }
        }

        const zips = Object.values(subs).filter((z) => /^\d{5}$/.test(String(z)));
        for (const zip of zips) {
          const color = getColorForZip(countyName, zip);
          allRows.push({
            state: stateAbbr,
            zip: String(zip),
            county: countyDisplay,
            green: color === 'Green' ? 'Green' : '',
            yellow: color === 'Yellow' ? 'Yellow' : '',
            red: color === 'Red' ? 'Red' : '',
          });
        }
        console.log(`  ${countyDisplay}: ${zips.length} zips`);
        await wait(100);
      } catch (e) {
        console.log(`  ${countyDisplay}: error - ${e.message}`);
      }
    }

    const outPath = process.env.OUTPUT_PATH
      ? path.resolve(process.env.OUTPUT_PATH)
      : path.join(__dirname, `../data/scraped-${stateAbbr.toLowerCase()}-zipcodes.csv`);
    const outDir = path.dirname(outPath);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const lines = [
      'State,Zip,County,Green,Yellow,Red',
      ...allRows.map((r) => `${r.state},${r.zip},${csvEscape(r.county)},${r.green},${r.yellow},${r.red}`),
    ];
    fs.writeFileSync(outPath, lines.join('\n'));
    console.log(`\nDone! Saved ${allRows.length} rows to ${outPath}`);
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
