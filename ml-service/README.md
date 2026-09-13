# Demand-Prediction Service (XGBoost)

Predicts near-term blood demand per hospital and blood group, so the platform
can flag shortages **before** they happen and recommend restocking. It is a
standalone Python (FastAPI) microservice; the Node API calls it and falls back
to an in-process heuristic if it is unavailable, so the model is a swappable
enhancement rather than a hard dependency.

```
Node API  ──POST /predict/batch──▶  FastAPI  ──▶  XGBoost model
   ▲                                                   │
   └────────── per-day forecast + risk ◀───────────────┘
   (falls back to the heuristic forecast on timeout/error)
```

---

## 1. Problem statement

For a hospital *h*, blood group *g*, and day *t*, predict the number of units
demanded

$$\hat{y}_{h,g,t} = f(\mathbf{x}_{h,g,t})$$

where $\mathbf{x}$ is a feature vector built from the calendar, the hospital's
profile, local accident/crime signals, and the group's own recent demand
history. Demand is a **non-negative count**, so we model it as a Poisson target.

---

## 2. Model: gradient-boosted regression trees

XGBoost predicts with an **additive ensemble** of $K$ regression trees
$f_k \in \mathcal{F}$:

$$\hat{y}_i = \sum_{k=1}^{K} f_k(\mathbf{x}_i), \qquad f_k(\mathbf{x}) = w_{q(\mathbf{x})}$$

where $q$ maps a sample to a leaf and $w \in \mathbb{R}^{T}$ are the leaf
weights of a tree with $T$ leaves.

### 2.1 Regularized objective

$$\mathcal{L} = \sum_i l(y_i, \hat{y}_i) + \sum_k \Omega(f_k),
\qquad \Omega(f) = \gamma T + \tfrac{1}{2}\lambda \lVert w \rVert^2$$

$\gamma$ penalizes the number of leaves and $\lambda$ is L2 regularization on
the leaf weights — together they control overfitting.

### 2.2 Additive training + second-order approximation

Trees are added greedily. At step $t$ we fit $f_t$ to minimize

$$\mathcal{L}^{(t)} = \sum_i l\!\left(y_i,\ \hat{y}_i^{(t-1)} + f_t(\mathbf{x}_i)\right) + \Omega(f_t).$$

Taking the second-order Taylor expansion with
$g_i = \partial_{\hat{y}} l$ and $h_i = \partial^2_{\hat{y}} l$:

$$\mathcal{L}^{(t)} \simeq \sum_i \left[ g_i f_t(\mathbf{x}_i) + \tfrac{1}{2} h_i f_t(\mathbf{x}_i)^2 \right] + \Omega(f_t).$$

For a fixed tree structure, the **optimal weight** of leaf $j$ (with instance
set $I_j$) and the resulting objective are

$$w_j^\* = -\frac{\sum_{i\in I_j} g_i}{\sum_{i\in I_j} h_i + \lambda},
\qquad
\tilde{\mathcal{L}} = -\tfrac{1}{2}\sum_{j=1}^{T}\frac{\big(\sum_{i\in I_j} g_i\big)^2}{\sum_{i\in I_j} h_i + \lambda} + \gamma T.$$

Splits are chosen to maximize the **gain**

$$\text{Gain} = \tfrac{1}{2}\left[\frac{G_L^2}{H_L+\lambda} + \frac{G_R^2}{H_R+\lambda} - \frac{(G_L+G_R)^2}{H_L+H_R+\lambda}\right] - \gamma,$$

with $G=\sum g_i,\ H=\sum h_i$ over the left/right child.

### 2.3 Poisson loss (count target)

Demand is a count, so we use `count:poisson` with a log link
$\hat{y} = e^{\,\eta}$, $\eta = \sum_k f_k(\mathbf{x})$. The per-sample loss is
the (unit) Poisson deviance / negative log-likelihood

$$l(y, \hat{y}) = \hat{y} - y\log\hat{y},\qquad
g = \hat{y} - y,\quad h = \hat{y},$$

which plugs directly into the gain and leaf-weight formulas above. Predictions
are guaranteed non-negative — appropriate for unit counts.

---

## 3. Features (the demand drivers)

| Group | Features |
|---|---|
| **Calendar** | day-of-week, is-weekend, day-of-month, month, week-of-year |
| **Hospital profile** | has-maternity, has-trauma, has-pediatric, bed count, catchment (000s) |
| **Local context** | accident index, crime index (daily, in $[0,1]$) |
| **Blood group** | one-hot over the 8 ABO/Rh groups |
| **Autoregressive** | lag-1, lag-7, lag-14, rolling mean(7), rolling mean(28), rolling std(7) |

Feature construction lives in `features.py` and is **shared by training and
serving**, guaranteeing the model sees the same layout at predict time that it
learned from.

---

## 4. Multi-step forecasting

Lag features make a single tree a one-step predictor. To forecast a horizon we
predict **autoregressively**: each predicted day is appended to the history and
becomes the lag input for the next day,

$$\hat{y}_{t+k} = f\!\left(\mathbf{x}_{t+k}\big(\hat{y}_{t+1},\dots,\hat{y}_{t+k-1}\right)\big),\quad k=1,\dots,H.$$

---

## 5. From prediction to action (safety stock)

The Node service turns the horizon forecast into a reorder recommendation.
With predicted daily demand $\bar{d}$, its standard deviation $\sigma$, lead
time $L$ days, and service level $z$ (default $z=1.65 \approx 95\%$):

$$\text{safety stock} = z\,\sigma\sqrt{L}, \qquad
\text{required} = \Big\lceil \textstyle\sum_{k=1}^{H}\hat{y}_{t+k} + z\sigma\sqrt{L}\Big\rceil,$$

$$\text{suggested restock} = \max(0,\ \text{required} - \text{current stock}).$$

A group is **critical** if current stock cannot cover expected demand over the
lead time, **at-risk** if it cannot cover the horizon, **watch** if it cannot
cover horizon + safety buffer, else **ok**.

---

## 6. Training & evaluation

- **Data.** The production DB has little history yet, so we train on a
  documented synthetic process (`data_gen.py`) with realistic drivers: group
  baselines (O+ common → AB- rare), ward multipliers, a strong weekly cycle,
  and sharp accident/crime spikes. This is disclosed, not hidden — the point is
  that the model *recovers* these drivers from data. As real requests
  accumulate, the same pipeline retrains on them unchanged.
- **Split.** Time-based: the last 15% of the calendar is the held-out test set,
  so we measure genuine forecasting, not interpolation.
- **Baseline.** "Tomorrow = last 7-day average." The model is scored against it.
- **Latest run.** See `meta.json` — test **MAE ≈ 0.94**, ~**13% better** than
  the naive baseline, with day-of-week, blood group, and the rolling-demand
  context as the top features, and a clear response to the accident signal
  (holding all else equal, raising `accident_index` from 0.1 → 0.9 roughly
  doubles predicted O+ demand).

---

## 7. API

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | liveness + whether a model is loaded |
| GET | `/model/info` | metrics + top feature importances (for the dashboard) |
| POST | `/predict` | one group: profile + recent history → per-day forecast |
| POST | `/predict/batch` | all groups for a hospital in one call (used by the API) |

Example:

```bash
curl -X POST localhost:8100/predict -H 'Content-Type: application/json' -d '{
  "profile": {"has_maternity":1,"has_trauma":1,"bed_count":600,"catchment_k":900},
  "blood_group": "O+", "horizon_days": 7,
  "recent": [8,7,9,10,8,7,9],
  "context": {"accident_index":0.8,"crime_index":0.4}
}'
```

---

## 8. Run it

```bash
python -m venv .venv
.venv/Scripts/activate          # Windows;  source .venv/bin/activate on Unix
pip install -r requirements.txt
python train.py                 # writes model.json + meta.json
uvicorn app:app --host 0.0.0.0 --port 8100
```

Point the Node API at it with `ML_SERVICE_URL=http://localhost:8100` in
`backend/.env`. Retrain any time with `python train.py`.

---

## 9. Roadmap

- Train on real `PatientRequest` history once enough has accrued (same pipeline).
- Feed live accident/crime feeds instead of the synthetic context.
- Add the **stochastic allocation** layer (optimize inter-hospital stock
  transfers) that consumes these forecasts.
