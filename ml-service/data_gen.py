"""
Synthetic historical-demand generator.

The production DB has little request history yet, so we train on data generated
from a documented, realistic demand process. This is deliberate and disclosed:
the point of the showcase is that XGBoost RECOVERS these known drivers (ward
profile, weekday seasonality, accident/crime signal) from data — feature
importances and error metrics on a held-out split demonstrate that. As real
requests accumulate, the same pipeline retrains on them with no code change.
"""
from __future__ import annotations
import numpy as np
import pandas as pd
from features import GROUPS, PROFILE_COLS, CONTEXT_COLS

# Relative baseline transfusion demand by group (O+ most common, AB- rarest).
BASE_RATE = {
    "O+": 1.00, "A+": 0.80, "B+": 0.50, "O-": 0.40,
    "A-": 0.25, "AB+": 0.20, "B-": 0.15, "AB-": 0.08,
}
# Ward effects: how much a ward multiplies a group's baseline.
MATERNITY_BOOST = {"O-": 0.6, "A+": 0.3, "B+": 0.3, "O+": 0.2}   # Rh-neg mothers, obstetric bleeding
TRAUMA_BOOST = {"O+": 0.7, "O-": 0.9, "A+": 0.3}                  # emergency universal use
# Sensitivity of each group's demand to the daily accident signal. Accidents
# cause sharp, same-day emergency-transfusion spikes — a pattern a trailing
# average can't anticipate but the accident feature can.
ACCIDENT_BETA = {"O+": 2.2, "O-": 2.6, "A+": 1.0, "B+": 0.7, "A-": 0.5, "O": 0.0}
CRIME_BETA = 1.0  # applied to the emergency groups O+/O-

# Day-of-week multipliers — a strong weekly cycle (busy Mondays, quiet Sundays)
# that a 7-day rolling mean averages away but the day-of-week feature recovers.
WEEKDAY_MULT = {0: 1.35, 1: 1.10, 2: 1.05, 3: 1.10, 4: 1.25, 5: 0.80, 6: 0.62}


def make_hospitals(n: int, rng: np.random.Generator) -> list[dict]:
    hospitals = []
    for i in range(n):
        beds = int(rng.integers(60, 800))
        hospitals.append({
            "hospital_id": f"H{i:02d}",
            "has_maternity": int(rng.random() < 0.6),
            "has_trauma": int(rng.random() < 0.4),
            "has_pediatric": int(rng.random() < 0.5),
            "bed_count": beds,
            "catchment_k": round(float(beds * rng.uniform(0.8, 2.5)), 1),  # thousands
        })
    return hospitals


def _random_walk(days: int, rng: np.random.Generator, vol: float = 0.08,
                 spike_prob: float = 0.0) -> np.ndarray:
    """A signal in [0,1] standing in for a local accident/crime index: a smooth
    baseline random walk with occasional sharp spikes (multi-casualty days)."""
    x = np.zeros(days)
    x[0] = rng.uniform(0.15, 0.4)
    for t in range(1, days):
        x[t] = np.clip(x[t - 1] + rng.normal(0, vol), 0.05, 0.6)
    if spike_prob:
        for t in range(days):
            if rng.random() < spike_prob:
                x[t] = min(0.98, x[t] + rng.uniform(0.4, 0.6))  # sharp same-day spike
    return x


def generate(n_hospitals: int = 8, days: int = 730, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    hospitals = make_hospitals(n_hospitals, rng)
    start = pd.Timestamp("2024-01-01")
    dates = [start + pd.Timedelta(days=d) for d in range(days)]

    rows = []
    for h in hospitals:
        size = h["bed_count"] / 220.0                      # ~0.3 .. 3.6
        accident = _random_walk(days, rng, spike_prob=0.05)  # ~1 spike / 3 weeks
        crime = _random_walk(days, rng, vol=0.05, spike_prob=0.02)
        for di, date in enumerate(dates):
            dow = date.weekday()
            weekday_mult = WEEKDAY_MULT[dow]
            for g in GROUPS:
                mean = BASE_RATE[g] * size * weekday_mult
                if h["has_maternity"]:
                    mean *= 1 + MATERNITY_BOOST.get(g, 0.0)
                if h["has_trauma"]:
                    mean *= 1 + TRAUMA_BOOST.get(g, 0.0)
                # Accident/crime lift the emergency groups.
                mean *= 1 + ACCIDENT_BETA.get(g, 0.0) * accident[di]
                if g in ("O+", "O-"):
                    mean *= 1 + CRIME_BETA * crime[di]
                demand = rng.poisson(max(mean, 0.02))
                rows.append({
                    "date": date,
                    "hospital_id": h["hospital_id"],
                    **{c: h[c] for c in PROFILE_COLS},
                    "accident_index": round(float(accident[di]), 3),
                    "crime_index": round(float(crime[di]), 3),
                    "blood_group": g,
                    "demand": int(demand),
                })
    df = pd.DataFrame(rows)
    return df.sort_values(["hospital_id", "blood_group", "date"]).reset_index(drop=True)


if __name__ == "__main__":
    d = generate()
    print(d.shape)
    print(d.groupby("blood_group")["demand"].mean().round(2))
