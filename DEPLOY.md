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
- `https://sbb-api.onrender.com/health` → `{"status":"ok","message":"Smart Blood Bank API is running"}`
- `sbb-web` URL → landing page → log in → **Forecast** shows the **XGBoost** badge.

---

## 6. WhatsApp Bot Integration & Webhooks

Smart Blood Bank supports two complementary WhatsApp integration engines:

### Option A: Baileys Native Socket (Zero-Cost, Real Number)
- **Active by default** when `WHATSAPP_PROVIDER=baileys` (or unset).
- Does **not** require Twilio, credit cards, or sandbox codes.
- Navigate in browser to: `https://<sbb-api-url>/api/whatsapp/qr`
- Open WhatsApp on any phone → **Linked Devices** → **Link a Device** → Scan the QR on screen.
- Once connected, the bot immediately listens and responds to all incoming messages.

### Option B: Twilio WhatsApp Sandbox / Production Webhook
To use Twilio WhatsApp instead of Baileys:
1. In `sbb-api` Environment variables:
   - `WHATSAPP_PROVIDER`: `twilio`
   - `TWILIO_ACCOUNT_SID`: your Twilio Account SID (`AC...`)
   - `TWILIO_AUTH_TOKEN`: your Twilio Auth Token
   - `TWILIO_WHATSAPP_NUMBER`: e.g. `whatsapp:+14155238886`
   - `TWILIO_WEBHOOK_URL`: `https://<sbb-api-url>/api/whatsapp/webhook`
   - `TWILIO_VALIDATE`: set to `false` if behind Render reverse proxy (or set `TWILIO_WEBHOOK_URL` explicitly).
2. In the **Twilio Console**:
   - Go to **Messaging** → **Try it out** → **Send a WhatsApp message** (Sandbox Settings) or your WhatsApp Sender.
   - Under **Sandbox Settings** → **"When a message comes in"**:
     - URL: `https://<sbb-api-url>/api/whatsapp/webhook`
     - Method: `HTTP POST`
   - Click **Save**.

---

## 7. Clinical Bot Architecture & Safety Gating

The WhatsApp bot enforces strict clinical and legal safety guardrails under **Section 53 of the National Health Act 2014**:

| Flow | Who | Safety Gate & Output |
|---|---|---|
| `1` (Public) | Patient / Family | **Find Emergency Hospital**: Nearest 24/7 facilities with emergency phone, distance, Google Maps directions. **Zero blood stock or unit counts are exposed.** |
| `2` (Public) | Patient / Family | **Doctor-Authorized Blood Search**: Verified clinical messenger bridge. Captures patient name, admitting hospital, doctor name/phone, blood group. Generates `SBB-XXXXX` ref. Only hospital-to-hospital transfer. |
| `3` (Public) | Patient / Family | **Track Request**: Instant requisition card by `SBB-XXXXX` or auto-lookup from sender phone. |
| `4` (Public) | Patient / Family | **Oxygen Facilities**: Accredited facilities with emergency oxygen without exposing raw cylinder inventory counts. |
| `5` (Public) | Donor | **Voluntary Donation Offer**: Captures name, blood group, **11-digit NIN** (NDPA 2023 protected), and preferred donation day. |
| `DOCTOR` | Licensed Doctor | **Doctor Verification**: Must enter Doctor PIN or Hospital Code (e.g. `DOC-2026`, `HOSP-OSUTH`, `HOSP-LUTH`). Unlocks component selection (PRBC, Whole Blood, Platelets, FFP, Cryoprecipitate), real-time stock levels, crossmatch status, and SOS stock-out alerts. |
| Inquiries | Public | Queries like `"O+"`, `"I need blood"`, `"Where to buy blood"` immediately trigger the **Clinical & Section 53 Legal Notice** preventing self-medication and illegal commercial transactions. |

---

## 8. Session Lifecycle & Memory Management
- User sessions in `botEngine.js` are tracked in-memory with a **30-minute Time-To-Live (TTL)**.
- An automatic background garbage collector runs every 15 minutes (`setInterval().unref()`) to evict expired sessions and prevent memory leaks.
- When Render free instances sleep after 15 minutes of inactivity, memory cleanly recycles; new messages automatically re-hydrate session state seamlessly.

---

## Notes for the Defense & Presentation
- **Cold starts:** Free services sleep after ~15 min idle; the first request wakes them (~30–60s). Open each URL once before your presentation.
- **ML Retraining:** Pre-trained model artifacts (`model.json` + `meta.json`) are committed in `ml-service/`. The Render build command uses the cached model or retrains if missing (`test -f model.json || python train.py`).
- **Python Version:** Configured to **Python 3.12.8** for guaranteed binary wheel compatibility with XGBoost, Scikit-Learn, and Pandas on Linux x86_64.
- **Fallback:** If `sbb-ml` is unreachable, `sbb-api` automatically falls back to its built-in heuristic forecast algorithm.
- **Costs:** All three web services fit Render's free tier; MongoDB Atlas free (M0) is sufficient.

