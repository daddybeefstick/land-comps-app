/**
 * Scrape zipcodes + colors + sell-through rates from AI Land Dealz.
 * Colors: ONLY from inline style="..." (red/green/yellow + site hex).
 * Run: node scripts/scrape-ailanddealz-with-colors.js NC
 *      node scripts/scrape-ailanddealz-with-colors.js TN
 * Output: data/scraped-{STATE}-zipcodes.csv, data/scraped-{STATE}-counties.csv
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Verified: NC=38, SC=48, GA=13, FL=12. TN/OH — confirm state_id in site URL if scrape fails.
const STATE_IDS = { NC: 38, SC: 48, VA: 52, GA: 13, FL: 12, TX: 49, TN: 47, OH: 39, AZ: 4 };

function getStateConfig() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
Usage: node scrape-ailanddealz-with-colors.js [STATE|STATE_ID|--state-id=N]
       STATE=TN npm run scrape:nc

Predefined: NC(38), SC(48), GA(13), FL(12), TN(47), OH(39), AZ(4), TX(49), VA(52).
If wrong state loads, use --state-id=NN from the site URL after selecting the state.

Outputs:
  data/scraped-{state}-zipcodes.csv  — zip, color, sell-through per zip
  data/scraped-{state}-counties.csv  — sell-through per county
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

function normalizeCountyName(name) {
  return String(name || '')
    .replace(/\s+County$/i, '')
    .trim()
    .toLowerCase();
}

/** Shared DOM parsing logic (runs in browser). */
const BROWSER_SCRAPE_HELPERS = `
  function tierFromInlineStyle(styleAttr) {
    if (!styleAttr || typeof styleAttr !== 'string') return null;
    const m = styleAttr.match(/(?:^|;)\\s*(?:color|background-color)\\s*:\\s*([^;]+)/i);
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

  function parseStats(text) {
    const parcels = text.match(/Total\\s*#\\s*of\\s*Land\\s*Parcels\\s*([\\d,]+)/i);
    const str6 = text.match(/Sell\\s*Through\\s*Rate-6\\s*months\\s*(\\d+)%?/i);
    const str12 = text.match(/Sell\\s*Through\\s*Rate-12\\s*months\\s*(\\d+)%?/i);
    return {
      parcels: parcels ? parcels[1].replace(/,/g, '') : '',
      str6: str6 ? str6[1] : '',
      str12: str12 ? str12[1] : '',
    };
  }

  function findCardRoot(el) {
    let node = el;
    for (let i = 0; i < 15 && node; i++) {
      const t = node.innerText || '';
      if (t.includes('Sell Through Rate-6 months') && t.includes('Land Parcels')) return node;
      node = node.parentElement;
    }
    return null;
  }

  function findStyledZipEl(el, zip) {
    if (el.getAttribute('style') && tierFromInlineStyle(el.getAttribute('style'))) return el;
    for (const c of el.children || []) {
      const t = (c.innerText || '').trim();
      if (t === zip || (t.length < 150 && t.match(new RegExp('\\\\b' + zip + '\\\\b')))) {
        const found = findStyledZipEl(c, zip);
        if (found) return found;
      }
    }
    return null;
  }
`;

async function scrapeCountyStatsFromPage(page) {
  return page.evaluate(`${BROWSER_SCRAPE_HELPERS}
    (() => {
      const counties = [];
      const seen = new Set();
      const buttons = [...document.querySelectorAll('button, a, [role="button"]')];
      for (const btn of buttons) {
        if (!(btn.textContent || '').includes('Add to cart')) continue;
        const card = findCardRoot(btn);
        if (!card) continue;
        const text = card.innerText || '';
        if (text.match(/\\b\\d{5}\\b/)) continue;
        const lines = text.split('\\n').map((l) => l.trim()).filter(Boolean);
        const nameLine = lines.find(
          (l) =>
            l.length > 1 &&
            l.length < 50 &&
            !/parcel|sell through|add to cart|total|%/i.test(l) &&
            !/^\\d+$/.test(l)
        );
        if (!nameLine || seen.has(nameLine.toLowerCase())) continue;
        seen.add(nameLine.toLowerCase());
        const stats = parseStats(text);
        counties.push({ name: nameLine, ...stats });
      }
      return counties;
    })()
  `);
}

async function scrapeZipDataFromPage(page) {
  return page.evaluate(`${BROWSER_SCRAPE_HELPERS}
    (() => {
      const items = [];
      const seen = new Set();

      function walk(el) {
        if (!el || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
        const t = (el.innerText || '').trim();
        const zipMatch = t.match(/^\\b(\\d{5})\\b$/);
        if (zipMatch && !seen.has(zipMatch[1])) {
          const zip = zipMatch[1];
          let styledEl = el.getAttribute('style') ? el : findStyledZipEl(el, zip);
          if (!styledEl && el.parentElement) styledEl = findStyledZipEl(el.parentElement, zip);
          const styleAttr = styledEl ? styledEl.getAttribute('style') : null;
          const tier = styleAttr ? tierFromInlineStyle(styleAttr) : null;
          if (tier) {
            seen.add(zip);
            const card = findCardRoot(styledEl || el);
            const stats = card ? parseStats(card.innerText || '') : { parcels: '', str6: '', str12: '' };
            items.push({ zip, color: tier, ...stats });
          }
        }
        const zipInBlock = t.match(/\\b(\\d{5})\\b/);
        if (zipInBlock && !seen.has(zipInBlock[1]) && t.length < 500 && t.includes('Sell Through')) {
          const zip = zipInBlock[1];
          const styledEl = findStyledZipEl(el, zip) || el.querySelector('[style*="color"]');
          const styleAttr = styledEl ? styledEl.getAttribute('style') : null;
          const tier = styleAttr ? tierFromInlineStyle(styleAttr) : null;
          if (tier) {
            seen.add(zip);
            const stats = parseStats(t);
            items.push({ zip, color: tier, ...stats });
          }
        }
        for (const c of el.children || []) walk(c);
      }

      walk(document.body);
      return items;
    })()
  `);
}

async function clickZipPaginationNext(page) {
  return page.evaluate(() => {
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
  const countyStatsMap = new Map();

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

    console.log('Fetching county list + county sell-through rates...');
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

    const countyCards = await scrapeCountyStatsFromPage(page);
    for (const c of countyCards) {
      countyStatsMap.set(normalizeCountyName(c.name), c);
    }
    console.log(`  County cards on state page: ${countyCards.length}`);

    const entries = Object.entries(counties);
    console.log(`Found ${entries.length} counties. Scraping zip colors + sell-through...\n`);

    for (let i = 0; i < entries.length; i++) {
      const [countyId, countyName] = entries[i];
      const countyDisplay = countyName.endsWith(' County') ? countyName : countyName + ' County';
      const countyKey = normalizeCountyName(countyName);
      const countyStats = countyStatsMap.get(countyKey) || { parcels: '', str6: '', str12: '' };
      const url = `${BASE_URL}/properties/browse?state_id=${stateId}&county_id=${countyId}`;

      try {
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
        await wait(2500);

        const allZips = [];
        let pageNum = 0;
        const maxPages = 20;
        while (pageNum < maxPages) {
          const batch = await scrapeZipDataFromPage(page);
          for (const z of batch) {
            if (!allZips.find((x) => x.zip === z.zip)) allZips.push(z);
          }
          const hasNext = await clickZipPaginationNext(page);
          if (!hasNext) break;
          await wait(1800);
          pageNum++;
        }
        if (pageNum > 0) {
          console.log(`    (pagination: ${pageNum + 1} page(s))`);
        }

        for (const z of allZips) {
          if (!z.color) continue;
          allRows.push({
            state: stateAbbr,
            zip: z.zip,
            county: countyDisplay,
            green: z.color === 'Green' ? 'Green' : '',
            yellow: z.color === 'Yellow' ? 'Yellow' : '',
            red: z.color === 'Red' ? 'Red' : '',
            parcels: z.parcels || '',
            zipStr6: z.str6 || '',
            zipStr12: z.str12 || '',
            countyStr6: countyStats.str6 || '',
            countyStr12: countyStats.str12 || '',
            countyParcels: countyStats.parcels || '',
          });
        }

        console.log(`  [${i + 1}/${entries.length}] ${countyDisplay}: ${allZips.length} zips (total: ${allRows.length})`);
      } catch (e) {
        console.log(`  [${i + 1}/${entries.length}] ${countyDisplay}: error - ${e.message} (total: ${allRows.length})`);
      }
    }

    allRows.sort((a, b) => {
      const cmp = (a.county || '').localeCompare(b.county || '');
      return cmp !== 0 ? cmp : (a.zip || '').localeCompare(b.zip || '');
    });

    const outDir = path.join(__dirname, '../data');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const zipPath = path.join(outDir, `scraped-${stateAbbr.toLowerCase()}-zipcodes.csv`);
    const zipLines = [
      'State,Zip,County,Green,Yellow,Red,Parcels,Zip_STR_6mo,Zip_STR_12mo,County_STR_6mo,County_STR_12mo,County_Parcels',
      ...allRows.map(
        (r) =>
          `${r.state},${r.zip},${csvEscape(r.county)},${r.green},${r.yellow},${r.red},${r.parcels},${r.zipStr6},${r.zipStr12},${r.countyStr6},${r.countyStr12},${r.countyParcels}`
      ),
    ];
    fs.writeFileSync(zipPath, zipLines.join('\n'));

    const countyRows = entries.map(([, countyName]) => {
      const countyDisplay = countyName.endsWith(' County') ? countyName : countyName + ' County';
      const stats = countyStatsMap.get(normalizeCountyName(countyName)) || { parcels: '', str6: '', str12: '' };
      return {
        state: stateAbbr,
        county: countyDisplay,
        parcels: stats.parcels || '',
        str6: stats.str6 || '',
        str12: stats.str12 || '',
      };
    });
    countyRows.sort((a, b) => (a.county || '').localeCompare(b.county || ''));

    const countyPath = path.join(outDir, `scraped-${stateAbbr.toLowerCase()}-counties.csv`);
    const countyLines = [
      'State,County,Parcels,STR_6mo,STR_12mo',
      ...countyRows.map((r) => `${r.state},${csvEscape(r.county)},${r.parcels},${r.str6},${r.str12}`),
    ];
    fs.writeFileSync(countyPath, countyLines.join('\n'));

    console.log(`\nDone!`);
    console.log(`  Zips:     ${allRows.length} rows → ${zipPath}`);
    console.log(`  Counties: ${countyRows.length} rows → ${countyPath}`);
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
