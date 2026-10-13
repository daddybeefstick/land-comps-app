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

// Verified on ailanddealz.com only.
const STATE_IDS = { NC: 38, SC: 48, GA: 13, FL: 12, TN: 50, OH: 41, RI: 47 };

const STATE_EXPECTED_NAME = {
  NC: 'north carolina',
  SC: 'south carolina',
  FL: 'florida',
  GA: 'georgia',
  VA: 'virginia',
  TX: 'texas',
  TN: 'tennessee',
  OH: 'ohio',
  RI: 'rhode island',
  AZ: 'arizona',
};

function getStateConfig() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
Usage: node scrape-ailanddealz-with-colors.js [STATE|STATE_ID|--state-id=N]
       STATE=TN npm run scrape:nc

Verified IDs: NC(38), SC(48), GA(13), FL(12).
For TN, OH, etc.: open the site, select the state, copy state_id from the URL, then --state-id=NN.

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

/**
 * Walk the page's visible text line-by-line and extract one record per
 * "Total # of Land Parcels" anchor. Handles narrow-column wraps where
 * "% Sell Through Rate-12 months" spans two lines.
 *
 * Each card looks like:
 *   NAME
 *   Total # of Land Parcels
 *   <number>
 *   % Sell Through Rate-6 months   (may wrap to "% Sell Through Rate-6" + "months")
 *   <number>%
 *   % Sell Through Rate-12 months
 *   <number>%
 *
 * NAME = county on state page, zip on county page.
 */
async function scrapeStatBlocksFromPage(page) {
  return page.evaluate(() => {
    const lines = (document.body.innerText || '')
      .split(/\r?\n/)
      .map((l) => l.trim());

    function findNumberAfterLabel(startIdx, labelSubstr) {
      let foundLabel = false;
      for (let j = startIdx; j < lines.length && j < startIdx + 12; j++) {
        if (!foundLabel) {
          if (lines[j].includes(labelSubstr)) foundLabel = true;
          continue;
        }
        if (!lines[j] || /^months$/i.test(lines[j])) continue;
        const m = lines[j].match(/^(\d+)\s*%?$/);
        if (m) return m[1];
        if (/parcels|sell\s*through|add to cart/i.test(lines[j])) return '';
      }
      return '';
    }

    const out = [];
    for (let i = 0; i < lines.length; i++) {
      if (!/^Total\s*#\s*of\s*Land\s*Parcels$/i.test(lines[i])) continue;

      let name = '';
      let zipName = '';
      for (let j = i - 1; j >= 0 && j >= i - 8; j--) {
        const l = lines[j];
        if (!l) continue;
        if (/^img$/i.test(l)) continue;
        if (/parcel|sell\s*through|add to cart|total|^%$|months/i.test(l)) continue;
        if (/^\d{5}$/.test(l)) { zipName = l; break; }
        if (/^[\d,]+%?$/.test(l)) continue;
        if (!name) name = l;
      }
      name = zipName || name;
      if (!name) continue;
      if (/^(Counties|Zip\s*Codes|North|South|East|West)/i.test(name) && name.length > 20) continue;

      let parcels = '';
      for (let j = i + 1; j < lines.length && j <= i + 4; j++) {
        if (!lines[j]) continue;
        const m = lines[j].match(/^([\d,]+)$/);
        if (m) {
          parcels = m[1].replace(/,/g, '');
          break;
        }
      }

      const str6 = findNumberAfterLabel(i, 'Rate-6');
      const str12 = findNumberAfterLabel(i, 'Rate-12');
      out.push({ name, parcels, str6, str12 });
    }
    return out;
  });
}

/** zip -> 'Red'|'Green'|'Yellow' from inline style="color:..." on elements whose text is exactly that zip. */
async function scrapeZipColorsFromPage(page) {
  return page.evaluate(() => {
    const HEX = { fcf67f: 'Yellow', '69e363': 'Green', ef4444: 'Red', dc2626: 'Red' };
    const NAMED = { red: 'Red', green: 'Green', yellow: 'Yellow' };
    function tier(styleAttr) {
      if (!styleAttr) return null;
      const m = String(styleAttr).match(/(?:^|;)\s*(?:color|background-color)\s*:\s*([^;]+)/i);
      if (!m) return null;
      const v = m[1].trim().toLowerCase();
      if (NAMED[v]) return NAMED[v];
      const hex = v.replace(/^#/, '');
      return HEX[hex] || null;
    }
    const out = {};
    const els = document.querySelectorAll('[style*="color"]');
    for (const el of els) {
      const t = (el.textContent || '').trim();
      if (!/^\d{5}$/.test(t)) continue;
      const c = tier(el.getAttribute('style'));
      if (c && !out[t]) out[t] = c;
    }
    return out;
  });
}

async function getDisplayedStateName(page) {
  return page.evaluate(() => {
    const names = [
      'Rhode Island', 'North Carolina', 'South Carolina', 'West Virginia', 'New Hampshire',
      'New Jersey', 'New Mexico', 'North Dakota', 'South Dakota', 'District of Columbia',
      'Tennessee', 'Texas', 'Florida', 'Georgia', 'Ohio', 'Alabama', 'Alaska', 'Arizona',
      'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'Hawaii', 'Idaho',
      'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland',
      'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana',
      'Nebraska', 'Nevada', 'New York', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Utah',
      'Vermont', 'Virginia', 'Washington', 'Wisconsin', 'Wyoming',
    ];
    names.sort((a, b) => b.length - a.length);
    const text = document.body.innerText || '';

    // Prefer matches that follow the "Counties N" badge — that's the state header.
    const countiesIdx = text.search(/Counties\s*\n+\d+/);
    if (countiesIdx !== -1) {
      const after = text.slice(countiesIdx, countiesIdx + 400);
      for (const n of names) {
        const re = new RegExp(`(?:^|\\n)\\s*${n.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*(?:\\n|$)`);
        if (re.test(after)) return n;
      }
    }
    // Fallback: first occurrence in body
    for (const n of names) {
      if (text.includes(n)) return n;
    }
    return null;
  });
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
      console.log('\n>>> Log in if needed in the browser window, then press ENTER. <<<');
      await ask('Press ENTER when logged in... ');
    } else {
      await wait(5000);
    }

    console.log('Loading state page...');
    let countiesPromise;
    page.on('response', (response) => {
      if (response.url().includes(`get-counties-by-state/${stateId}`)) {
        countiesPromise = response.text();
      }
    });
    await page.goto(`${BASE_URL}/properties/browse?state_id=${stateId}`, { waitUntil: 'networkidle0', timeout: 60000 });
    await wait(3000);

    // Critical: let the user clear any active filter that hides counties.
    if (!skipPrompt) {
      const status = await page.evaluate(() => {
        const t = document.body.innerText || '';
        const countiesMatch = t.match(/Counties\s*\n+(\d+)/);
        return {
          counties: countiesMatch ? parseInt(countiesMatch[1], 10) : null,
          hasStr: t.includes('Sell Through Rate-6 months'),
        };
      });
      if (!status.hasStr || status.counties === 0) {
        console.log('');
        console.log('  ⚠ The state page in the browser window is showing 0 counties.');
        console.log('  ⚠ Look at the RIGHT PANEL — if it says "Counties 0", click the yellow');
        console.log('  ⚠ "Filter" button and clear any active filters (or remove favorites)');
        console.log('  ⚠ until you see counties listed.');
        console.log('');
        await ask('  >>> Press ENTER when counties are visible (or to continue anyway)... ');
      }
    }

    // Wait for county cards to actually render (STR labels appear).
    try {
      await page.waitForFunction(
        () => (document.body.innerText || '').includes('Sell Through Rate-6 months'),
        { timeout: 20000 }
      );
    } catch {
      console.log('  Warning: STR labels still not detected on state page within 20s.');
    }
    await wait(2000);

    const displayedState = await getDisplayedStateName(page);
    const expectedName = STATE_EXPECTED_NAME[stateAbbr];
    if (displayedState && expectedName && !displayedState.toLowerCase().includes(expectedName)) {
      throw new Error(
        `Wrong state loaded: page shows "${displayedState}" but you requested ${stateAbbr} (state_id=${stateId}). ` +
          `Open app.ailanddealz.com, select ${stateAbbr}, and run: node scripts/scrape-ailanddealz-with-colors.js --state-id=ID_FROM_URL`
      );
    }
    if (displayedState) console.log(`  Page state: ${displayedState}`);

    if (!countiesPromise) throw new Error('Counties API not called. Log in and try again.');
    const countiesText = await countiesPromise;
    const counties = JSON.parse(countiesText?.trim() || '{}');

    let statePageNum = 0;
    const maxStatePages = 20;
    while (statePageNum < maxStatePages) {
      const blocks = await scrapeStatBlocksFromPage(page);
      for (const c of blocks) {
        if (/^\d{5}$/.test(c.name)) continue;
        const key = normalizeCountyName(c.name);
        const prev = countyStatsMap.get(key) || {};
        countyStatsMap.set(key, {
          name: c.name,
          parcels: c.parcels || prev.parcels || '',
          str6: c.str6 || prev.str6 || '',
          str12: c.str12 || prev.str12 || '',
        });
      }
      const hasNext = await clickZipPaginationNext(page);
      if (!hasNext) break;
      await wait(1800);
      statePageNum++;
    }
    console.log(`  Counties with sell-through scraped: ${countyStatsMap.size} (state pages: ${statePageNum + 1})`);

    if (countyStatsMap.size === 0) {
      const recordsZero = await page.evaluate(() => {
        const t = document.body.innerText || '';
        return /Showing\s+0\s+record\(s\)|Counties\s*\n+0\b/.test(t);
      });
      if (recordsZero) {
        console.log('');
        console.log('  ⚠ State page shows 0 counties — your account has filters/favorites hiding them.');
        console.log('  ⚠ Open app.ailanddealz.com → Search → ' + stateAbbr + ', click "Filter" and clear');
        console.log('  ⚠ any active filters (or remove favorites), then re-run.');
        console.log('  Continuing anyway — zip-level data will still be captured.');
        console.log('');
      }
      try {
        const debugText = await page.evaluate(() => (document.body.innerText || '').slice(0, 4000));
        const debugPath = path.join(__dirname, '../data/debug-state-page.txt');
        fs.writeFileSync(debugPath, debugText);
        console.log(`  Dumped state-page text to ${debugPath}`);
      } catch {}
    }

    const outDir = path.join(__dirname, '../data');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const zipPath = path.join(outDir, `scraped-${stateAbbr.toLowerCase()}-zipcodes.csv`);
    const countyPath = path.join(outDir, `scraped-${stateAbbr.toLowerCase()}-counties.csv`);
    fs.writeFileSync(
      zipPath,
      'State,Zip,County,Green,Yellow,Red,Parcels,Zip_STR_6mo,Zip_STR_12mo,County_STR_6mo,County_STR_12mo,County_Parcels\n'
    );
    fs.writeFileSync(countyPath, 'State,County,Parcels,STR_6mo,STR_12mo\n');
    console.log(`  Live output:\n    ${zipPath}\n    ${countyPath}\n`);

    const entries = Object.entries(counties);
    console.log(`Found ${entries.length} counties. Scraping zip colors + sell-through...\n`);

    for (let i = 0; i < entries.length; i++) {
      const [countyId, countyName] = entries[i];
      const countyDisplay = countyName.endsWith(' County') ? countyName : countyName + ' County';
      const countyKey = normalizeCountyName(countyName);
      const countyStats = countyStatsMap.get(countyKey) || { parcels: '', str6: '', str12: '' };
      const url = `${BASE_URL}/properties/browse?state_id=${stateId}&county_id=${countyId}`;

      try {
        let subsPromise;
        const subsListener = (response) => {
          if (response.url().includes(`get-subdivisions-by-county/${countyId}`)) {
            subsPromise = response.text();
          }
        };
        page.on('response', subsListener);

        await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
        await wait(2500);
        page.off('response', subsListener);

        const domByZip = new Map();
        let pageNum = 0;
        const maxPages = 20;
        while (pageNum < maxPages) {
          const blocks = await scrapeStatBlocksFromPage(page);
          const colors = await scrapeZipColorsFromPage(page);
          for (const b of blocks) {
            if (!/^\d{5}$/.test(b.name)) continue;
            const zip = b.name;
            if (!domByZip.has(zip)) {
              domByZip.set(zip, {
                zip,
                color: colors[zip] || null,
                parcels: b.parcels,
                str6: b.str6,
                str12: b.str12,
              });
            }
          }
          const hasNext = await clickZipPaginationNext(page);
          if (!hasNext) break;
          await wait(1800);
          pageNum++;
        }
        if (pageNum > 0) {
          console.log(`    (pagination: ${pageNum + 1} page(s))`);
        }

        let apiZips = [];
        if (subsPromise) {
          try {
            const subsText = await subsPromise;
            const subs = JSON.parse(subsText?.trim() || '{}');
            apiZips = Object.values(subs).filter((z) => /^\d{5}$/.test(String(z)));
          } catch {
            apiZips = [];
          }
        }
        const zipList = apiZips.length > 0 ? apiZips : [...domByZip.keys()];
        let withColor = 0;

        const newRows = [];
        for (const zip of zipList) {
          const z = domByZip.get(String(zip)) || {};
          if (z.color) withColor++;
          const row = {
            state: stateAbbr,
            zip: String(zip),
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
          };
          allRows.push(row);
          newRows.push(row);
        }

        // Append zip rows + the county summary row live.
        if (newRows.length > 0) {
          const zipAppend = newRows
            .map(
              (r) =>
                `${r.state},${r.zip},${csvEscape(r.county)},${r.green},${r.yellow},${r.red},${r.parcels},${r.zipStr6},${r.zipStr12},${r.countyStr6},${r.countyStr12},${r.countyParcels}`
            )
            .join('\n') + '\n';
          fs.appendFileSync(zipPath, zipAppend);
        }
        fs.appendFileSync(
          countyPath,
          `${stateAbbr},${csvEscape(countyDisplay)},${countyStats.parcels || ''},${countyStats.str6 || ''},${countyStats.str12 || ''}\n`
        );

        console.log(
          `  [${i + 1}/${entries.length}] ${countyDisplay}: ${zipList.length} zips (${withColor} w/ color) STR ${countyStats.str6 || '-'}/${countyStats.str12 || '-'} (total: ${allRows.length})`
        );
      } catch (e) {
        console.log(`  [${i + 1}/${entries.length}] ${countyDisplay}: error - ${e.message} (total: ${allRows.length})`);
      }
    }

    // Final pass: rewrite both files sorted (live writes were in scrape order).
    allRows.sort((a, b) => {
      const cmp = (a.county || '').localeCompare(b.county || '');
      return cmp !== 0 ? cmp : (a.zip || '').localeCompare(b.zip || '');
    });
    const zipLines = [
      'State,Zip,County,Green,Yellow,Red,Parcels,Zip_STR_6mo,Zip_STR_12mo,County_STR_6mo,County_STR_12mo,County_Parcels',
      ...allRows.map(
        (r) =>
          `${r.state},${r.zip},${csvEscape(r.county)},${r.green},${r.yellow},${r.red},${r.parcels},${r.zipStr6},${r.zipStr12},${r.countyStr6},${r.countyStr12},${r.countyParcels}`
      ),
    ];
    fs.writeFileSync(zipPath, zipLines.join('\n') + '\n');

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
    const countyLines = [
      'State,County,Parcels,STR_6mo,STR_12mo',
      ...countyRows.map((r) => `${r.state},${csvEscape(r.county)},${r.parcels},${r.str6},${r.str12}`),
    ];
    fs.writeFileSync(countyPath, countyLines.join('\n') + '\n');

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
