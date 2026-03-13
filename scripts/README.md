# Scrape AI Land Dealz (NC zipcodes + colors)

## Run the scraper

1. **Install dependencies** (includes Puppeteer)
   ```bash
   npm install
   ```

2. **Run the script**
   ```bash
   npm run scrape:nc
   ```

3. A browser window opens and goes to `app.ailanddealz.com`. **Log in** if you're not already.

4. The script will:
   - Navigate to NC (state_id=38)
   - Click through each county (25 per page, 4 pages)
   - For each county, paginate through zipcode pages
   - Extract zip + color (Green/Yellow/Red) from each card
   - Save to `data/scraped-nc-zipcodes.csv`

5. **Output format** (same as your Google Sheet):
   ```
   NC,Zip,County,Green,Yellow,Red
   NC,27201,Alamance County,Green,,
   NC,27215,Alamance County,,,Red
   ...
   ```

## If it doesn't find elements

The site's HTML may differ. Open DevTools (F12) on the AI Land Dealz page and update the selectors in `scrape-ailanddealz.js` (around line 20). Look for:

- County cards/links
- Zip code cards
- Next/pagination buttons
