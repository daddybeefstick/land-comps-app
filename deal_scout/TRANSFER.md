# Transfer this project to another PC (same Cursor account)

Use this to move Deal Scout to your other computer so you can keep working as if it never left.

---

## What you’re moving

| Item | Where it lives on this Mac |
|------|----------------------------|
| **Deal Scout (main project)** | `~/Downloads/deal_scout_clean` |
| **Cursor Desktop Agent** (optional; only if you use it) | `~/Downloads/cursor_desktop_agent` |
| **Google credentials** | e.g. `~/Downloads/vibrant-magpie-489607-k4-39a4bb5930d6.json` |

The **Google Sheet** (TX_Review_Queue) is already in the cloud; you only need the same spreadsheet ID and sheet name on the new PC.

---

## Option A: Zip and move (simplest)

### On this Mac

1. **Create a zip of the project** (exclude the virtual env and cache so it’s small and portable):

   ```bash
   cd ~/Downloads
   zip -r deal_scout_transfer.zip deal_scout_clean \
     -x "deal_scout_clean/.venv/*" \
     -x "deal_scout_clean/__pycache__/*" \
     -x "deal_scout_clean/*/__pycache__/*" \
     -x "deal_scout_clean/.env"
   ```

   (We exclude `.env` so you don’t accidentally share keys; you’ll recreate it on the new PC.)

2. **Copy the zip** to the other PC (USB drive, iCloud, Google Drive, AirDrop to another Mac, etc.).

3. **Copy these separately** (they’re not in the zip):
   - Your **Google service account JSON** (e.g. `vibrant-magpie-489607-k4-39a4bb5930d6.json`) — same way (USB, cloud, etc.).
   - If you want to keep your current env, copy **`.env`** from `deal_scout_clean` to the new PC into the same folder after unzipping (or recreate it from `.env.example` on the new PC).

4. **Optional:** If you use the Cursor Desktop Agent, zip it too (no need to exclude much; it’s small):

   ```bash
   cd ~/Downloads
   zip -r cursor_desktop_agent_transfer.zip cursor_desktop_agent
   ```

   Then copy that zip to the other PC as well.

### On the other PC

1. **Unzip** `deal_scout_transfer.zip` where you want the project (e.g. `~/Projects/deal_scout_clean` or `~/Downloads/deal_scout_clean`).

2. **Put the Google JSON** in a known place, e.g.:
   - Same folder as the project, or
   - e.g. `~/Downloads/vibrant-magpie-489607-k4-39a4bb5930d6.json`

3. **Create a virtual env and install deps:**

   ```bash
   cd /path/to/deal_scout_clean
   python3 -m venv .venv
   source .venv/bin/activate   # Linux/Mac
   # or:  .venv\Scripts\activate   # Windows
   pip install -r requirements.txt
   ```

4. **Create `.env`** (copy from `.env.example` or from your old `.env`):

   ```bash
   cp .env.example .env
   # Edit .env and set:
   # - RAPIDAPI_KEY, RAPIDAPI_HOST (if you use the pipeline)
   # - GOOGLE_APPLICATION_CREDENTIALS, SHEETS_SPREADSHEET_ID, SHEETS_SHEET_NAME (for sync script)
   ```

   For the sync script, you can also just use env vars in the terminal (see COMMANDS.md).

5. **Open the project in Cursor** on the new PC: File → Open Folder → select `deal_scout_clean`. You’re on the same Cursor account, so settings can sync; the code and data are now on this machine.

6. **Optional — Cursor Desktop Agent:** Unzip `cursor_desktop_agent_transfer.zip`, then:

   ```bash
   cd /path/to/cursor_desktop_agent
   pip install -e .
   ```

7. **Update paths in COMMANDS.md** on the new PC if you want (replace `/Users/wcovert/Downloads/deal_scout_clean` with your new path, or run commands from the project directory so `cd` is enough).

8. **Quick check:** From the project folder, run:

   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/service-account.json"
   export CDA_SHEETS_SPREADSHEET_ID="1ReXX_N9-wE23Tpw7TaqxN5U_CK2Dfot6qiYwUakIyqA"
   export CDA_SHEETS_SHEET_NAME="TX_Review_Queue"
   python3 scripts/sync_review_list_to_sheet.py
   ```

   If the sheet updates, you’re good.

---

## Option B: Git (good if you’ll keep two copies in sync)

### On this Mac (one-time)

1. **Use the project’s `.gitignore`** (already there). It ignores `.venv/`, `.env`, `__pycache__/`, and `.DS_Store`. **Do not add your Google service account `.json` file to the repo** — keep it only on each machine and copy it separately when transferring.

2. **Create a repo and push to GitHub (or GitLab):**

   ```bash
   cd ~/Downloads/deal_scout_clean
   git init
   git add .
   git commit -m "Initial commit: Deal Scout"
   # Create a new repo on GitHub (e.g. deal-scout-clean), then:
   git remote add origin https://github.com/YOUR_USERNAME/deal-scout-clean.git
   git branch -M main
   git push -u origin main
   ```

3. **Copy to the other PC** (only the Google JSON and optionally `.env`), same as in Option A.

### On the other PC

1. **Clone the repo:**

   ```bash
   cd ~/Projects   # or wherever you keep code
   git clone https://github.com/YOUR_USERNAME/deal-scout-clean.git
   cd deal-scout-clean
   ```

2. **Add the Google JSON** and **`.env`** (they’re not in the repo). Then create the venv and install deps (same as Option A, steps 3–4).

3. **Open the folder in Cursor** and continue working. Use `git pull` / `git push` to sync between the two PCs when you want.

---

## Checklist (other PC)

- [ ] Project folder unzipped or cloned
- [ ] Google service account JSON copied and path noted
- [ ] `.env` created (from `.env.example` or old `.env`)
- [ ] Python 3 + venv + `pip install -r requirements.txt`
- [ ] Cursor: Open Folder → this project
- [ ] Ran sync script once with env vars to confirm sheet access
- [ ] (Optional) Cursor Desktop Agent unzipped and `pip install -e .` if you use it

After that, use **COMMANDS.md** on the new PC as usual; only the paths in the `export` and `cd` commands might need updating to match your new paths.
