/**
 * Capture API/network data from AI Land Dealz (inspect-style).
 * Intercepts XHR/fetch responses and saves JSON for inspection.
 * Run: npm run scrape:nc:network
 * Output: data/network-captures/*.json
 *
 * Use this to find the real API structure – then we can pull data directly
 * from the API instead of scraping the DOM (cleaner, correct colors).
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const BASE_URL = 'https://app.ailanddealz.com';
const NC_URL = `${BASE_URL}/properties/browse?state_id=38`;
const USER_DATA_DIR = path.join(__dirname, '../.puppeteer-session');
const CAPTURE_DIR = path.join(__dirname, '../data/network-captures');

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, () => { rl.close(); resolve(); });
  });
}

async function main() {
  if (!fs.existsSync(CAPTURE_DIR)) fs.mkdirSync(CAPTURE_DIR, { recursive: true });

  console.log('Launching browser with network capture...');
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1400, height: 900 },
    args: ['--no-sandbox'],
    userDataDir: USER_DATA_DIR,
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36');

  const captured = [];
  const urlToFile = new Map();

  const allRequestUrls = [];

  page.on('request', (req) => {
    const url = req.url();
    if (req.resourceType() === 'xhr' || req.resourceType() === 'fetch') {
      allRequestUrls.push(url);
    }
  });

  page.on('response', async (response) => {
    const url = response.url();
    const req = response.request();
    const contentType = (response.headers()['content-type'] || '').toLowerCase();

    if (/\.(js|css|png|jpg|woff|ico|svg)(\?|$)/.test(url)) return;
    if (url.includes('google') || url.includes('gstatic') || url.includes('analytics')) return;
    if (req.resourceType() !== 'xhr' && req.resourceType() !== 'fetch') return;

    try {
      const body = await response.text();
      if (!body || body.length < 5) return;

      const shortUrl = url.replace(/^https?:\/\/[^/]+/, '').slice(0, 100);
      const safeName = shortUrl.replace(/[^\w\-._=]/g, '_').slice(0, 60) || 'response';
      const ts = Date.now();

      if (contentType.includes('json') || body.trim().startsWith('{') || body.trim().startsWith('[')) {
        try {
          const json = JSON.parse(body);
          const filename = `${ts}_${captured.length}_${safeName}.json`;
          const outPath = path.join(CAPTURE_DIR, filename);
          fs.writeFileSync(outPath, JSON.stringify(json, null, 2));
          captured.push({ url: shortUrl, file: filename });
          console.log(`  [captured] ${filename}`);
        } catch {
          const filename = `${ts}_${captured.length}_${safeName}.txt`;
          fs.writeFileSync(path.join(CAPTURE_DIR, filename), body.slice(0, 5000));
          console.log(`  [saved] ${filename} (raw)`);
        }
      } else if (/api|browse|county|zip|zipcode|properties/.test(url)) {
        const filename = `${ts}_${captured.length}_${safeName}.txt`;
        fs.writeFileSync(path.join(CAPTURE_DIR, filename), body.slice(0, 10000));
        console.log(`  [saved] ${filename} (${contentType.slice(0, 30)})`);
      }
    } catch (e) {
      // ignore
    }
  });

  try {
    console.log('Opening', BASE_URL);
    await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 90000 });

    console.log('\n>>> Log in if needed, then press ENTER <<<');
    await ask('Press ENTER when logged in... ');

    console.log('Navigating to NC counties...');
    await page.goto(NC_URL, { waitUntil: 'networkidle0', timeout: 60000 });
    await wait(2000);

    console.log('\n>>> MANUALLY click 2–3 county cards (click the card body, NOT the heart icon). <<<');
    console.log('>>> Each click should open the zipcode list. All API responses will be captured. <<<');
    console.log('>>> Press ENTER when done. <<<');
    await ask('Press ENTER to close... ');

    const urlsPath = path.join(CAPTURE_DIR, '_all-request-urls.txt');
    fs.writeFileSync(urlsPath, allRequestUrls.join('\n'));
    console.log(`\nCaptured ${captured.length} responses to ${CAPTURE_DIR}`);
    console.log(`All XHR/fetch URLs logged to ${urlsPath}`);
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
