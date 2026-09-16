"""
Demand-prediction service (FastAPI + XGBoost).

Endpoints:
  GET  /health          liveness
  GET  /model/info      metrics + feature importances (for the dashboard)
  POST /predict         one group: profile + recent history -> per-day forecast
  POST /predict/batch   all groups for a hospital in one call (what the API uses)

Multi-step forecasting is autoregressive: each predicted day is fed back in as
the lag input for the next, so lag/rolling features stay consistent across the
horizon.
"""
from __future__ import annotations
from contextlib import asynccontextmanager
import datetime as dt
import json
from pathlib import Path

import pandas as pd
import xgboost as xgb
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from features import FEATURE_COLS, GROUPS, assemble_row

HERE = Path(__file__).parent
MODEL_PATH = HERE / "model.json"
META_PATH = HERE / "meta.json"

_booster: xgb.Booster | None = None
_meta: dict = {}


def _load():
    global _booster, _meta
    if MODEL_PATH.exists():
        b = xgb.Booster()
        b.load_model(str(MODEL_PATH))
        _booster = b
    if META_PATH.exists():
        _meta = json.loads(META_PATH.read_text())


@asynccontextmanager
async def lifespan(app: FastAPI):
    _load()
    yield


app = FastAPI(title="Smart Blood Bank — Demand Prediction", version="1.0.0", lifespan=lifespan)


class Profile(BaseModel):
    has_maternity: int = 0
    has_trauma: int = 0
    has_pediatric: int = 0
    bed_count: float = 200
    catchment_k: float = 200


class PredictRequest(BaseModel):
    profile: Profile = Field(default_factory=Profile)
    blood_group: str
    start_date: str | None = None            # ISO date; defaults to today
    horizon_days: int = Field(14, ge=1, le=90)
    recent: list[float] = Field(default_factory=list)                 # daily demand, oldest -> newest
    context: dict = Field(default_factory=dict)                       # accident_index / crime_index, held constant


class GroupSeries(BaseModel):
    blood_group: str
    recent: list[float] = Field(default_factory=list)


class BatchRequest(BaseModel):
    profile: Profile = Field(default_factory=Profile)
    start_date: str | None = None
    horizon_days: int = Field(14, ge=1, le=90)
    context: dict = Field(default_factory=dict)
    groups: list[GroupSeries] = Field(default_factory=list)           # empty -> all 8 groups with no history


def _predict_one(profile: dict, group: str, start: dt.date, horizon: int,
                 recent: list[float], context: dict) -> dict:
    if _booster is None:
        raise HTTPException(503, "Model not trained yet. Run train.py.")
    series = [float(x) for x in recent]
    per_day = []
    day = start
    for _ in range(horizon):
        row = assemble_row(profile, group, day, series, context)
        dmat = xgb.DMatrix(pd.DataFrame([row], columns=FEATURE_COLS))
        yhat = max(float(_booster.predict(dmat)[0]), 0.0)
        per_day.append({"date": day.isoformat(), "expected": round(yhat, 2)})
        series.append(yhat)                  # autoregressive feedback
        day += dt.timedelta(days=1)
    total = round(sum(p["expected"] for p in per_day), 2)
    return {"blood_group": group, "per_day": per_day, "total": total,
            "daily_mean": round(total / horizon, 2)}


def _start_date(s: str | None) -> dt.date:
    if not s:
        return dt.date.today()
    try:
        return dt.date.fromisoformat(s[:10])
    except (ValueError, TypeError):
        return dt.date.today()


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": _booster is not None,
            "trained_at": _meta.get("trained_at")}


@app.get("/model/info")
def model_info():
    if not _meta:
        raise HTTPException(503, "No model metadata. Run train.py.")
    return {
        "trained_at": _meta.get("trained_at"),
        "objective": _meta.get("objective"),
        "metrics": _meta.get("metrics"),
        "top_features": _meta.get("feature_importances", [])[:8],
        "n_train": _meta.get("n_train"),
        "n_test": _meta.get("n_test"),
    }


@app.post("/predict")
def predict(req: PredictRequest):
    if req.blood_group not in GROUPS:
        raise HTTPException(400, f"Unknown blood group '{req.blood_group}'")
    return _predict_one(req.profile.model_dump(), req.blood_group,
                        _start_date(req.start_date), req.horizon_days,
                        req.recent, req.context)


@app.post("/predict/batch")
def predict_batch(req: BatchRequest):
    start = _start_date(req.start_date)
    profile = req.profile.model_dump()
    series_by_group = {g.blood_group: g.recent for g in req.groups}
    groups = list(series_by_group) or GROUPS
    results = [
        _predict_one(profile, g, start, req.horizon_days,
                     series_by_group.get(g, []), req.context)
        for g in groups if g in GROUPS
    ]
    return {"horizon_days": req.horizon_days, "start_date": start.isoformat(),
            "groups": results, "model": {"trained_at": _meta.get("trained_at"),
                                         "metrics": _meta.get("metrics")}}
