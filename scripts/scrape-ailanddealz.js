/**
 * Scrape NC zipcodes + colors from AI Land Dealz
 * Run: npm run scrape:nc
 * Output: data/scraped-nc-zipcodes.csv
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const BASE_URL = 'https://app.ailanddealz.com';
const NC_URL = `${BASE_URL}/properties/browse?state_id=38`;
const USER_DATA_DIR = path.join(__dirname, '../.puppeteer-session');

const NC_COUNTIES = [
  'Alamance', 'Alexander', 'Alleghany', 'Anson', 'Ashe', 'Avery', 'Beaufort', 'Bertie', 'Bladen',
  'Brunswick', 'Buncombe', 'Burke', 'Cabarrus', 'Caldwell', 'Camden', 'Carteret', 'Caswell', 'Catawba',
  'Chatham', 'Cherokee', 'Chowan', 'Clay', 'Cleveland', 'Columbus', 'Craven', 'Cumberland', 'Currituck',
  'Dare', 'Davidson', 'Davie', 'Duplin', 'Durham', 'Edgecombe', 'Forsyth', 'Franklin', 'Gaston', 'Gates',
  'Graham', 'Granville', 'Greene', 'Guilford', 'Halifax', 'Harnett', 'Haywood', 'Henderson', 'Hertford',
  'Hoke', 'Hyde', 'Iredell', 'Jackson', 'Johnston', 'Jones', 'Lee', 'Lenoir', 'Lincoln', 'McDowell',
  'Macon', 'Madison', 'Martin', 'Mecklenburg', 'Mitchell', 'Montgomery', 'Moore', 'Nash', 'New Hanover',
  'Northampton', 'Onslow', 'Orange', 'Pamlico', 'Pasquotank', 'Pender', 'Perquimans', 'Person', 'Pitt',
  'Polk', 'Randolph', 'Richmond', 'Robeson', 'Rockingham', 'Rowan', 'Rutherford', 'Sampson', 'Scotland',
  'Stanly', 'Stokes', 'Surry', 'Swain', 'Transylvania', 'Tyrrell', 'Union', 'Vance', 'Wake', 'Warren',
  'Washington', 'Watauga', 'Wayne', 'Wilkes', 'Wilson', 'Yadkin', 'Yancey',
];

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

async function scrapeZipCards(page) {
  return page.evaluate(() => {
    const items = [];
    const seen = new Set();
    const root = document.querySelector('main, [role="main"], [class*="content"]') || document.body;

    function rgbToTier(rgb) {
      if (!rgb) return null;
      const m = rgb.match(/\d+/g);
      if (!m || m.length < 3) return null;
      const [r, g, b] = m.map(Number);
      if (r > 220 && g < 120 && b < 120) return 'Red';
      if (r > 200 && g > 160 && b < 80) return 'Yellow';
      if (r < 80 && g > 160 && b > 60) return 'Green';
      return null;
    }

    const walk = (el) => {
      if (!el || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
      const t = (el.innerText || '').trim();
      const zipMatch = t.match(/\b(\d{5})\b/);
      if (zipMatch && !seen.has(zipMatch[1]) && t.length < 100) {
        seen.add(zipMatch[1]);
        let color = null;
        const style = window.getComputedStyle(el);
        color = rgbToTier(style.color);
        if (!color && el.parentElement) {
          color = rgbToTier(window.getComputedStyle(el.parentElement).color);
        }
        if (!color && el.previousElementSibling) {
          const prev = el.previousElementSibling;
          color = rgbToTier(window.getComputedStyle(prev).color) || rgbToTier(window.getComputedStyle(prev).backgroundColor);
        }
        if (!color && el.nextElementSibling) {
          const next = el.nextElementSibling;
          color = rgbToTier(window.getComputedStyle(next).color) || rgbToTier(window.getComputedStyle(next).backgroundColor);
        }
        if (!color) {
          const html = (el.outerHTML || '') + (el.parentElement?.outerHTML || '');
          const arrowHex = html.match(/→\s*#([0-9a-f]{6})/i);
          if (arrowHex) {
            const hex = '#' + arrowHex[1].toLowerCase();
            if (hex === '#ef4444' || hex === '#dc2626') color = 'Red';
            else if (hex === '#eab308' || hex === '#f59e0b') color = 'Yellow';
            else if (hex === '#22c55e' || hex === '#10b981') color = 'Green';
          }
        }
        if (!color) {
          const html = (el.outerHTML || '') + (el.parentElement?.outerHTML || '');
          if (/red|#ef4444|#dc2626|rgb\(239|rgb\(220/i.test(html)) color = 'Red';
          else if (/yellow|#eab308|#f59e0b|rgb\(234|rgb\(250/i.test(html)) color = 'Yellow';
          else if (/green|#22c55e|#10b981|rgb\(34|rgb\(76/i.test(html)) color = 'Green';
        }
        items.push({ zip: zipMatch[1], color: color || 'Green' });
      }
      for (const c of el.children || []) walk(c);
    };
    walk(root);
    return items;
  });
}

async function scrapeCountyZips(page, countyName) {
  const allZips = [];
  let pageNum = 1;
    while (pageNum <= 6) {
    await wait(1200);
    const batch = await scrapeZipCards(page);
    for (const r of batch) allZips.push({ ...r, county: countyName });
    const nextClicked = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('a, button')];
      const nextBtn = btns.find((b) => /next|›|»/i.test((b.innerText || '').trim()) && (b.innerText || '').length < 20);
      if (nextBtn && !nextBtn.disabled) { nextBtn.click(); return true; }
      return false;
    });
    if (!nextClicked) break;
    pageNum++;
  }
  return allZips;
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

  const allRows = [];

  try {
    console.log('Opening', BASE_URL);
    await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 90000 });

    const skipPrompt = process.env.SKIP_PROMPT === '1';
    if (!skipPrompt) {
      console.log('\n>>> Log in if needed, then press ENTER <<<\n');
      await ask('Press ENTER when logged in... ');
    } else {
      console.log('\nAuto-starting in 5s (SKIP_PROMPT=1)...');
      await wait(5000);
    }

    console.log('Going to NC...');
    await page.goto(NC_URL, { waitUntil: 'networkidle0', timeout: 90000 });
    await wait(4000);

    const seenCounties = new Set();

    for (let pageNum = 1; pageNum <= 4; pageNum++) {
      const url = pageNum === 1 ? NC_URL : `${NC_URL}&counties[page]=${pageNum}`;
      console.log(`\n--- Page ${pageNum} ---`);
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
      await wait(3000);

      await page.evaluate(() => {
        const scrollContainers = document.querySelectorAll('[class*="scroll"], [overflow-y="auto"], [style*="overflow"]');
        scrollContainers.forEach((el) => { el.scrollTop = el.scrollHeight; });
        [...document.querySelectorAll('a, button')].forEach((el) => {
          const t = (el.innerText || '').toLowerCase();
          const href = (el.href || '').toLowerCase();
          if (t.includes('add to cart') || t.includes('favorite') || href.includes('favorite') || el.closest('[class*="favorite"]')) {
            el.style.pointerEvents = 'none';
          }
        });
        document.querySelectorAll('[class*="favorite"], [class*="heart"], [aria-label*="avorite"]').forEach((el) => {
          el.style.pointerEvents = 'none';
        });
      });
      await wait(1500);

      if (pageNum === 1) {
        const debugText = await page.evaluate(() => document.body?.innerText?.slice(0, 4000) || '');
        fs.writeFileSync(path.join(__dirname, '../data/debug-page.txt'), debugText);
        console.log('  (saved page text to data/debug-page.txt)');
      }

      const visibleCounties = await page.evaluate((countiesJson) => {
        const validSet = new Set(JSON.parse(countiesJson));
        const names = [];
        const all = document.querySelectorAll('a, [class*="card"], article, [class*="Card"], div');
        for (const el of all) {
          const t = (el.innerText || el.textContent || '').trim();
          if (!t.includes('Land Parcels') || (t.includes('Add to cart') && t.length < 50)) continue;
          const firstLine = t.split('\n')[0]?.trim();
          if (firstLine && validSet.has(firstLine) && !names.includes(firstLine)) {
            names.push(firstLine);
          }
        }
        return names;
      }, JSON.stringify(NC_COUNTIES));

      console.log(`  Found ${visibleCounties.length} counties on this page`);
      for (const baseName of visibleCounties) {
        const countyName = baseName + ' County';
        if (seenCounties.has(countyName)) continue;

        const clicked = await page.evaluate((name) => {
          const all = document.querySelectorAll('a, [class*="card"], article, [class*="Card"], div');
          for (const el of all) {
            const t = (el.innerText || el.textContent || '').trim();
            if (!t.startsWith(name + '\n') || !t.includes('Land Parcels')) continue;

            el.scrollIntoView({ block: 'center' });
            const link = el.closest('a');
            if (link && link.href && !/cart|favorite/i.test(link.href)) {
              link.click();
              return true;
            }
            const links = el.querySelectorAll('a');
            for (const a of links) {
              const txt = (a.innerText || '').trim();
              const href = (a.href || '');
              if (/add to cart|favorite|heart/i.test(txt)) continue;
              if (href && !/cart|favorite/i.test(href)) {
                a.click();
                return true;
              }
            }
            el.click();
            return true;
          }
          return false;
        }, baseName);

        if (!clicked) continue;
        seenCounties.add(countyName);

        await wait(2500);
        const zips = await scrapeCountyZips(page, countyName);
        for (const z of zips) {
          allRows.push({
            state: 'NC', zip: z.zip, county: countyName,
            green: z.color === 'Green' ? 'Green' : '',
            yellow: z.color === 'Yellow' ? 'Yellow' : '',
            red: z.color === 'Red' ? 'Red' : '',
          });
        }
        console.log(`  ${countyName}: ${zips.length} zips`);

        await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
        await wait(2000);
      }
    }

    const outPath = path.join(__dirname, '../data/scraped-nc-zipcodes.csv');
    const outDir = path.dirname(outPath);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const lines = [
      'NC,Zip,County,Green,Yellow,Red',
      ...allRows.map((r) => `NC,${r.zip},${csvEscape(r.county)},${r.green},${r.yellow},${r.red}`),
    ];
    fs.writeFileSync(outPath, lines.join('\n'));
    console.log('\nDone! Saved', allRows.length, 'rows to', outPath);
  } catch (e) {
    console.error('Error:', e);
    await wait(15000);
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
