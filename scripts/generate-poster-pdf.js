/**
 * Generates a printable PDF from the poster template.
 * Each section is sized to the 16.5"×14" poster layout specifications.
 * Print and cut along dashed lines, then glue onto your poster board.
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const HTML_PATH = path.join(__dirname, 'poster-print-template.html');
const OUT_PATH = path.join(__dirname, '..', 'Research_Poster_Cut_and_Glue.pdf');

async function main() {
  const htmlPath = path.resolve(HTML_PATH);
  if (!fs.existsSync(htmlPath)) {
    console.error('Template not found:', htmlPath);
    process.exit(1);
  }

  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  await page.goto(`file://${htmlPath}`, {
    waitUntil: 'networkidle0',
  });

  await page.pdf({
    path: OUT_PATH,
    format: 'Letter',
    printBackground: true,
    margin: {
      top: '0.5in',
      right: '0.5in',
      bottom: '0.5in',
      left: '0.5in',
    },
  });

  await browser.close();
  console.log('PDF saved to:', path.resolve(OUT_PATH));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
