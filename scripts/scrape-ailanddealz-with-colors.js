/**
 * Scrape zipcodes + colors from AI Land Dealz.
 * Uses API for county list, navigates directly to county URLs.
 * Colors: ONLY from inline style="..." (e.g. style="color:red"). No computed styles, no CSS.
 * Run: npm run scrape:nc
 *      node scripts/scrape-ailanddealz-with-colors.js SC
 *      node scripts/scrape-ailanddealz-with-colors.js --state-id=46
 *      STATE=SC npm run scrape:nc
 * Output: data/scraped-{STATE}-zipcodes.csv
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Site state_id. Use STATE_ID=nn for unlisted states. (38=NC, 48=SC, 13=GA, 12=FL verified)
const STATE_IDS = { NC: 38, SC: 48, VA: 52, GA: 13, FL: 12, TX: 49 };

function getStateConfig() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
Usage: node scrape-ailanddealz-with-colors.js [STATE|STATE_ID|--state-id=N]
       STATE=SC npm run scrape:nc
       STATE_ID=46 npm run scrape:nc

Predefined: NC(38), SC(46), VA(52), GA(14), FL(13), TN(48), TX(49).
For other states, use STATE_ID=nn (check site URL when you select the state).
`);
    process.exit(0);
  }
  let stateAbbr = (process.env.STATE || '').toUpperCase().trim();
  let stateId = process.env.STATE_ID ? parseInt(process.env.STATE_ID, 10) : null;
  const arg = process.argv[2];
  if (arg && !arg.startsWith('--')) {
    if (/^\d+$/.test(arg)) stateId = parseInt(arg, 10);
    else if (/^[A-Za-z]{2}$/.test(arg)) stateAbbr = arg.toUpperCase();
  } else if (arg?.startsWith('--state-id=')) {
    stateId = parseInt(arg.split('=')[1], 10);
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

function csvEscape(s) {
  const t = String(s ?? '');
  return t.includes(',') || t.includes('"') ? `"${t.replace(/"/g, '""')}"` : t;
}

async function scrapeZipColorsFromPage(page) {
  return page.evaluate(() => {
    /** Inline style only. Maps named + site hex values to Red/Green/Yellow. */
    function tierFromInlineStyle(styleAttr) {
      if (!styleAttr || typeof styleAttr !== 'string') return null;
      const m = styleAttr.match(/(?:^|;)\s*(?:color|background-color)\s*:\s*([^;]+)/i);
      const val = m ? m[1].trim().toLowerCase() : null;
      if (!val) return null;
      if (val === 'red') return 'Red';
      if (val === 'green') return 'Green';
      if (val === 'yellow') return 'Yellow';
      const hex = val.replace(/^#/, '');
      if (hex === 'fcf67f') return 'Yellow';
      if (hex === '69e363') return 'Green';
      if (hex === 'ef4444' || hex === 'dc2626') return 'Red';
      return null;
    }

    const items = [];
    const seen = new Set();

    function findStyledDescendant(el, zip) {
      const styleAttr = el.getAttribute('style');
      if (styleAttr && tierFromInlineStyle(styleAttr)) return el;
      for (const c of el.children || []) {
        const t = (c.innerText || '').trim();
        if (t === zip || (t.length < 150 && t.match(new RegExp('\\b' + zip + '\\b')))) {
          const found = findStyledDescendant(c, zip);
          if (found) return found;
        }
      }
      return null;
    }

    function walk(el) {
      if (!el || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
      const t = (el.innerText || '').trim();
      const zipMatch = t.match(/\b(\d{5})\b/);
      if (zipMatch && !seen.has(zipMatch[1]) && t.length < 150) {
        seen.add(zipMatch[1]);
        let styledEl = el.getAttribute('style') ? el : findStyledDescendant(el, zipMatch[1]);
        const styleAttr = styledEl ? styledEl.getAttribute('style') : null;
        const tier = styleAttr ? tierFromInlineStyle(styleAttr) : null;
        items.push({ zip: zipMatch[1], color: tier });
      }
      for (const c of el.children || []) walk(c);
    }

    walk(document.body);
    return items;
  });
}

async function main() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1400, height: 900 },
    args: ['--no-sandbox'],
    userDataDir: USER_DATA_DIR,
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36');

  const { stateAbbr, stateId } = getStateConfig();
  console.log(`State: ${stateAbbr} (id=${stateId})\n`);

  const allRows = [];

  try {
    console.log('Loading...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 60000 });

    const skipPrompt = process.env.SKIP_PROMPT === '1';
    if (!skipPrompt) {
      console.log('\n>>> Log in if needed, then press ENTER <<<');
      await ask('Press ENTER when logged in... ');
    } else {
      await wait(5000);
    }

    console.log('Fetching county list...');
    let countiesPromise;
    page.on('response', (response) => {
      if (response.url().includes(`get-counties-by-state/${stateId}`)) {
        countiesPromise = response.text();
      }
    });
    await page.goto(`${BASE_URL}/properties/browse?state_id=${stateId}`, { waitUntil: 'networkidle0', timeout: 60000 });
    await wait(3000);

    if (!countiesPromise) throw new Error('Counties API not called. Log in and try again.');
    const countiesText = await countiesPromise;
    const counties = JSON.parse(countiesText?.trim() || '{}');

    const entries = Object.entries(counties);
    console.log(`Found ${entries.length} counties. Navigating to each and scraping colors...\n`);

    for (let i = 0; i < entries.length; i++) {
      const [countyId, countyName] = entries[i];
      const countyDisplay = countyName.endsWith(' County') ? countyName : countyName + ' County';
      const url = `${BASE_URL}/properties/browse?state_id=${stateId}&county_id=${countyId}`;

      try {
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
        await wait(2500);

        const allZips = [];
        let pageNum = 0;
        const maxPages = 20; // safety limit (25 zips/page)
        while (pageNum < maxPages) {
          const batch = await scrapeZipColorsFromPage(page);
          for (const z of batch) {
            if (!allZips.find((x) => x.zip === z.zip)) allZips.push(z);
          }
          // Only look for Next inside the Zipcodes section (has "Showing X record(s)")
          const hasNext = await page.evaluate(() => {
            const result = document.evaluate(
              "//*[contains(., 'Showing') and contains(., 'record(s)')]",
              document,
              null,
              XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
              null
            );
            let scope = document.body;
            for (let i = 0; i < result.snapshotLength; i++) {
              let el = result.snapshotItem(i);
              while (el) {
                if ((el.textContent || '').includes('Next')) {
                  scope = el;
                  break;
                }
                el = el.parentElement;
              }
              if (scope !== document.body) break;
            }
            const candidates = scope.querySelectorAll('a, button, [role="button"], span');
            for (const el of candidates) {
              const text = (el.textContent || '').trim();
              if (/^Next\s*>?\s*$/.test(text)) {
                const li = el.closest('li');
                if (li?.classList?.contains('disabled') || el.closest('[aria-disabled="true"]')) return false;
                if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
                el.scrollIntoView({ block: 'center' });
                el.click();
                return true;
              }
            }
            return false;
          });
          if (!hasNext) break;
          await wait(1800);
          pageNum++;
        }
        if (pageNum > 0) {
          console.log(`    (pagination: ${pageNum + 1} page(s))`);
        }
        const zips = allZips;

        for (const z of zips) {
          if (!z.color) continue;
          allRows.push({
            state: stateAbbr,
            zip: z.zip,
            county: countyDisplay,
            green: z.color === 'Green' ? 'Green' : '',
            yellow: z.color === 'Yellow' ? 'Yellow' : '',
            red: z.color === 'Red' ? 'Red' : '',
          });
        }

        console.log(`  [${i + 1}/${entries.length}] ${countyDisplay}: ${zips.length} zips (total: ${allRows.length})`);
      } catch (e) {
        console.log(`  [${i + 1}/${entries.length}] ${countyDisplay}: error - ${e.message} (total: ${allRows.length})`);
      }
    }

    allRows.sort((a, b) => {
      const cmp = (a.county || '').localeCompare(b.county || '');
      return cmp !== 0 ? cmp : (a.zip || '').localeCompare(b.zip || '');
    });

    const outPath = path.join(__dirname, `../data/scraped-${stateAbbr.toLowerCase()}-zipcodes.csv`);
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
