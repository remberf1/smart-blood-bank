# Deploying Smart Blood Bank to Render

The stack is three web services plus your existing MongoDB Atlas:

| Service | Folder | What it is |
|---|---|---|
| `sbb-ml` | `ml-service/` | Python XGBoost demand-prediction API |
| `sbb-api` | `backend/` | Node/Express API |
| `sbb-web` | `frontend/` | Next.js frontend |

`render.yaml` at the repo root defines all three. Everything below is a one-time
setup; after it, every `git push` redeploys automatically.

---

## 0. Prerequisites
- The repo pushed to **GitHub** (Render deploys from GitHub).
- A **MongoDB Atlas** cluster + its connection string (`MONGODB_URI`).
- A **Render** account (free): https://render.com

## 1. Let Atlas accept Render
Render's free tier has no fixed outbound IP, so in Atlas → **Network Access** →
**Add IP Address** → **Allow access from anywhere** (`0.0.0.0/0`).
> This is fine for a demo. For production, use an egress-static plan and
> whitelist those IPs instead.

## 2. Create the Blueprint
1. Push this repo to GitHub.
2. Render dashboard → **New +** → **Blueprint** → pick the repo.
3. Render reads `render.yaml` and proposes `sbb-ml`, `sbb-api`, `sbb-web`.
4. Click **Apply**. All three start building. `sbb-ml` and the others will come
   up; a couple of env vars still need values (next step), so `sbb-api`/`sbb-web`
   may not work fully until you set them.

## 3. Set the secret env vars
Blueprint marks these `sync: false` — you fill them in the dashboard.

**On `sbb-api`** (→ the service → **Environment**):
| Key | Value |
|---|---|
| `MONGODB_URI` | your Atlas connection string |
| `JWT_SECRET` | a long random string (e.g. `openssl rand -hex 32`) |
| `APP_URL` | the `sbb-api` URL, e.g. `https://sbb-api.onrender.com` |
| `FRONTEND_ORIGINS` | the `sbb-web` URL, e.g. `https://sbb-web.onrender.com` |

`ML_SERVICE_URL` is wired automatically from the `sbb-ml` service — leave it.
Notifications (`SMTP_*`, `TWILIO_*`) are optional; leave `EMAIL_ENABLED` and
`NOTIFICATIONS_ENABLED` at `false` to run without them.

**On `sbb-web`** (→ **Environment**):
| Key | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | the `sbb-api` URL **with `/api`**, e.g. `https://sbb-api.onrender.com/api` |

> `NEXT_PUBLIC_API_URL` is baked in at **build** time. After setting it, open
> `sbb-web` → **Manual Deploy → Deploy latest commit** so the value is compiled
> into the frontend. (Redeploy `sbb-api` too if you set `FRONTEND_ORIGINS` after
> its first build.)

## 4. Seed the first admin
The API has no users yet. Either:
- **Render Shell** (sbb-api → *Shell*): `npm run seed:admin` — set `SEED_ADMIN_EMAIL`,
  `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME` env vars first; or
- run it locally against Atlas: `cd backend && npm run seed:admin`.

Then sign in at the `sbb-web` URL.

## 5. Verify
- `https://sbb-ml.onrender.com/health` → `{"status":"ok","model_loaded":true}`
- `https://sbb-ml.onrender.com/model/info` → metrics + feature importances
- `https://sbb-api.onrender.com/` → API running message
- `sbb-web` URL → landing page → log in → **Forecast** shows the **XGBoost** badge.

---

## Notes for the demo
- **Cold starts:** free services sleep after ~15 min idle; the first request
  wakes them (~30–60s). Before a live defense, open each URL once to warm them.
- **The model retrains on every deploy** (`buildCommand` runs `train.py`), so
  no model binary is committed. To retrain locally: `cd ml-service && python train.py`.
- **Fallback:** if `sbb-ml` is down, `sbb-api` automatically serves the built-in
  heuristic forecast — the site keeps working, the badge just reads "heuristic".
- **Costs:** all three fit Render's free tier; Atlas free (M0) is enough for a demo.
