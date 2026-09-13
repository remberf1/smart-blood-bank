"""
Train the demand model.

Pipeline: synthetic history -> per-series lag/rolling features -> time-based
train/test split -> XGBoost (Poisson count objective) -> metrics vs a naive
baseline -> save model.json + meta.json.

Run:  python train.py
"""
from __future__ import annotations
import json
import datetime as dt
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import mean_absolute_error, mean_squared_error

from features import FEATURE_COLS, PROFILE_COLS, CONTEXT_COLS, assemble_row
import data_gen

HERE = Path(__file__).parent
MODEL_PATH = HERE / "model.json"
META_PATH = HERE / "meta.json"


def build_training_frame(df: pd.DataFrame) -> pd.DataFrame:
    """Turn raw daily demand into supervised rows with lag/rolling features,
    computed per (hospital, group) series in date order — exactly how the
    serving path computes them from a recent window."""
    rows, targets, dates = [], [], []
    for (_, _), grp in df.groupby(["hospital_id", "blood_group"], sort=False):
        grp = grp.sort_values("date")
        demand = grp["demand"].tolist()
        profile = {c: grp.iloc[0][c] for c in PROFILE_COLS}
        recs = grp.to_dict("records")
        for t in range(len(recs)):
            r = recs[t]
            recent = demand[:t]  # strictly before day t
            context = {c: r[c] for c in CONTEXT_COLS}
            rows.append(assemble_row(profile, r["blood_group"], r["date"], recent, context))
            targets.append(r["demand"])
            dates.append(r["date"])
    X = pd.DataFrame(rows, columns=FEATURE_COLS)
    X["_date"] = dates
    X["_y"] = targets
    return X


def main():
    print("Generating synthetic history…")
    raw = data_gen.generate(n_hospitals=8, days=730, seed=42)
    print(f"  {len(raw):,} raw daily records")

    print("Engineering features…")
    data = build_training_frame(raw)

    # Time-based split: last 15% of the calendar as the held-out test set, so we
    # measure genuine forecasting (predicting the future), not interpolation.
    cutoff = data["_date"].quantile(0.85)
    train = data[data["_date"] <= cutoff]
    test = data[data["_date"] > cutoff]
    Xtr, ytr = train[FEATURE_COLS], train["_y"]
    Xte, yte = test[FEATURE_COLS], test["_y"]
    print(f"  train={len(Xtr):,}  test={len(Xte):,}  cutoff={pd.Timestamp(cutoff).date()}")

    model = xgb.XGBRegressor(
        objective="count:poisson",   # demand is a non-negative count
        n_estimators=400,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        reg_lambda=1.0,
        min_child_weight=3,
        n_jobs=0,
        random_state=42,
    )
    print("Training XGBoost…")
    model.fit(Xtr, ytr, eval_set=[(Xte, yte)], verbose=False)

    pred = np.clip(model.predict(Xte), 0, None)
    mae = mean_absolute_error(yte, pred)
    rmse = float(np.sqrt(mean_squared_error(yte, pred)))

    # Naive baseline: "tomorrow = last 7-day average" (roll_mean_7).
    base_pred = Xte["roll_mean_7"].to_numpy()
    base_mae = mean_absolute_error(yte, base_pred)
    improvement = round((1 - mae / base_mae) * 100, 1) if base_mae else 0.0

    importances = sorted(
        ({"feature": f, "gain": round(float(i), 4)}
         for f, i in zip(FEATURE_COLS, model.feature_importances_)),
        key=lambda d: d["gain"], reverse=True,
    )

    print(f"\nTest MAE  {mae:.3f}   RMSE {rmse:.3f}")
    print(f"Baseline MAE {base_mae:.3f}  ->  model is {improvement}% better")
    print("Top features:", ", ".join(d["feature"] for d in importances[:6]))

    model.get_booster().save_model(str(MODEL_PATH))
    meta = {
        "trained_at": dt.datetime.now(dt.UTC).isoformat(),
        "feature_cols": FEATURE_COLS,
        "objective": "count:poisson",
        "n_train": int(len(Xtr)),
        "n_test": int(len(Xte)),
        "metrics": {"mae": round(mae, 4), "rmse": round(rmse, 4),
                    "baseline_mae": round(base_mae, 4), "improvement_pct": improvement},
        "feature_importances": importances,
    }
    META_PATH.write_text(json.dumps(meta, indent=2))
    print(f"\nSaved {MODEL_PATH.name} + {META_PATH.name}")


if __name__ == "__main__":
    main()
