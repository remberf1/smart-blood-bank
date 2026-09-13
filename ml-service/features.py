"""
Shared feature engineering — used identically by training (train.py) and
serving (app.py) so the model never sees a different feature layout at predict
time than it learned from. This train/serve parity is the single most important
correctness property of the service.
"""
from __future__ import annotations
import datetime as dt
from typing import Sequence

# The 8 ABO/Rh groups, in a fixed order. Index (not the raw "A+"/"O-" string)
# is used for the one-hot columns so feature names stay identifier-safe.
GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
GROUP_TO_IDX = {g: i for i, g in enumerate(GROUPS)}

# Hospital profile fields the model consumes (the "hospital profile drives
# demand" signal from the project vision — a maternity ward raises baseline
# demand, a trauma centre raises O+/O- demand, etc.).
PROFILE_COLS = ["has_maternity", "has_trauma", "has_pediatric", "bed_count", "catchment_k"]

# Per-day local context signals (accidents/crime → transfusion demand).
CONTEXT_COLS = ["accident_index", "crime_index"]

TEMPORAL_COLS = ["dow", "is_weekend", "dom", "month", "woy"]
LAG_COLS = ["lag_1", "lag_7", "lag_14", "roll_mean_7", "roll_mean_28", "roll_std_7"]
GROUP_COLS = [f"bg_{i}" for i in range(len(GROUPS))]

# Final, ordered feature vector the model is trained and served on.
FEATURE_COLS = TEMPORAL_COLS + PROFILE_COLS + CONTEXT_COLS + GROUP_COLS + LAG_COLS


def _to_date(d) -> dt.date:
    if isinstance(d, dt.datetime):
        return d.date()
    if isinstance(d, dt.date):
        return d
    return dt.date.fromisoformat(str(d)[:10])


def temporal_features(d) -> dict:
    d = _to_date(d)
    iso = d.isocalendar()
    return {
        "dow": d.weekday(),
        "is_weekend": 1 if d.weekday() >= 5 else 0,
        "dom": d.day,
        "month": d.month,
        "woy": iso[1],
    }


def _mean(xs: Sequence[float]) -> float:
    xs = list(xs)
    return sum(xs) / len(xs) if xs else 0.0


def _std(xs: Sequence[float]) -> float:
    xs = list(xs)
    if len(xs) < 2:
        return 0.0
    m = _mean(xs)
    return (sum((x - m) ** 2 for x in xs) / (len(xs) - 1)) ** 0.5


def lag_features(recent: Sequence[float]) -> dict:
    """`recent` is the group's own daily demand history, oldest→newest, ending
    the day BEFORE the day we're predicting. Missing history defaults to 0."""
    r = list(recent)

    def lag(n: int) -> float:
        return float(r[-n]) if len(r) >= n else 0.0

    return {
        "lag_1": lag(1),
        "lag_7": lag(7),
        "lag_14": lag(14),
        "roll_mean_7": _mean(r[-7:]),
        "roll_mean_28": _mean(r[-28:]),
        "roll_std_7": _std(r[-7:]),
    }


def group_onehot(group: str) -> dict:
    idx = GROUP_TO_IDX.get(group, -1)
    return {f"bg_{i}": (1 if i == idx else 0) for i in range(len(GROUPS))}


def assemble_row(profile: dict, group: str, date, recent: Sequence[float], context: dict) -> dict:
    """Build one fully-ordered feature row (dict keyed by FEATURE_COLS)."""
    row: dict = {}
    row.update(temporal_features(date))
    for c in PROFILE_COLS:
        row[c] = float(profile.get(c, 0) or 0)
    for c in CONTEXT_COLS:
        row[c] = float(context.get(c, 0) or 0)
    row.update(group_onehot(group))
    row.update(lag_features(recent))
    return {c: row.get(c, 0.0) for c in FEATURE_COLS}
