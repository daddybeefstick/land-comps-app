# Git sync between devices

## 1. Install Git (one-time)

1. Go to https://git-scm.com/download/win
2. Download and run the installer (use default options)
3. Close and reopen your terminal/Cursor
4. Verify: `git --version`

## 2. Create a GitHub repo (one-time)

1. Go to https://github.com/new
2. Create a new repo (e.g. `land-comps-app`)
3. Do **not** initialize with README (you already have code)
4. Copy the repo URL (e.g. `https://github.com/YOUR_USERNAME/land-comps-app.git`)

## 3. Initialize and push (this device)

Run in the project folder (`land-comps-app`):

```powershell
cd c:\Users\wjc32\land-comps-app

git init
git add .
git commit -m "Initial commit: deal scout pipeline"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/land-comps-app.git
git push -u origin main
```

When prompted for credentials, use a **Personal Access Token** (not your password):
- GitHub → Settings → Developer settings → Personal access tokens
- Generate token with `repo` scope
- Use the token as the password when git asks

## 4. Setup on another device

```powershell
git clone https://github.com/YOUR_USERNAME/land-comps-app.git
cd land-comps-app\deal_scout
copy .env.example .env
# Edit .env and add your RAPIDAPI_KEY
```

Then run the pipeline as usual.

## 5. Daily workflow

**After making changes on one device:**
```powershell
git add .
git commit -m "Describe what you changed"
git push
```

**On the other device, to get latest:**
```powershell
git pull
```

---

## What syncs vs what doesn’t

| Syncs via Git | Does not sync |
|---------------|----------------|
| Code, configs, scripts | `.env` (API keys) – copy manually or recreate from `.env.example` |
| `nc_sc_exclude_zpids.txt` | `database/deals.db` – re-collect or copy manually |
| Export CSVs | `.cache/` (enrichment cache) |

To sync the database between devices, copy `deal_scout/database/deals.db` manually (e.g. cloud storage or USB) or re-run `python main.py collect` on the new device (uses API calls).
