"""Demand forecasting for medication reorder alerts (FR 6, FR 6.1, FR 6.2).

One model is trained per medication on its historical daily sales. The model
is a scikit-learn LinearRegression over two kinds of features:

* a linear time index (captures rising / falling demand), and
* one-hot day-of-week indicators (captures weekly seasonality).

The trained model predicts demand for each of the next N days; the cumulative
predicted demand is subtracted from the current stock to find the first day on
which the quantity falls below the safe threshold.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta

import numpy as np
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error

# A medication needs at least this many days of history before a forecast is
# attempted (UC-3 alternative flow: insufficient data -> no alert).
MIN_HISTORY_DAYS = 14
HOLDOUT_DAYS = 7


def parse_date(value) -> date:
    if isinstance(value, date):
        return value
    return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()


def features(day_indices: np.ndarray, start: date) -> np.ndarray:
    """Builds the feature matrix: [day_index, dow_0 ... dow_6]."""
    rows = []
    for idx in day_indices:
        dow = (start + timedelta(days=int(idx))).weekday()
        one_hot = [0] * 7
        one_hot[dow] = 1
        rows.append([float(idx)] + one_hot)
    return np.array(rows, dtype=float)


def aggregate_daily(sales: list[dict]) -> tuple[date, np.ndarray] | None:
    """Sums sales per calendar day and fills days with no sales with 0.

    Returns (start_date, daily_quantities) or None when there are no sales.
    """
    totals: dict[date, float] = {}
    for row in sales:
        day = parse_date(row["date"])
        totals[day] = totals.get(day, 0.0) + float(row["quantity_sold"])
    if not totals:
        return None
    start, end = min(totals), max(totals)
    n_days = (end - start).days + 1
    daily = np.zeros(n_days, dtype=float)
    for day, qty in totals.items():
        daily[(day - start).days] = qty
    return start, daily


@dataclass
class TrainedModel:
    model: LinearRegression
    start_date: date
    last_date: date
    n_days: int
    mae: float | None


def train(sales: list[dict]) -> tuple[TrainedModel | None, str]:
    """Trains a model for one medication. Returns (model, reason)."""
    aggregated = aggregate_daily(sales)
    if aggregated is None:
        return None, "no sales history"
    start, daily = aggregated
    n_days = len(daily)
    if n_days < MIN_HISTORY_DAYS:
        return None, f"insufficient data: {n_days} day(s) of history, need {MIN_HISTORY_DAYS}"

    idx = np.arange(n_days)
    X = features(idx, start)

    # Report accuracy on a short holdout when there is enough data, then refit on everything.
    mae = None
    if n_days >= MIN_HISTORY_DAYS + HOLDOUT_DAYS:
        split = n_days - HOLDOUT_DAYS
        holdout_model = LinearRegression().fit(X[:split], daily[:split])
        predicted = np.clip(holdout_model.predict(X[split:]), 0, None)
        mae = float(mean_absolute_error(daily[split:], predicted))

    model = LinearRegression().fit(X, daily)
    trained = TrainedModel(
        model=model,
        start_date=start,
        last_date=start + timedelta(days=n_days - 1),
        n_days=n_days,
        mae=mae,
    )
    return trained, "trained"


def forecast_demand(trained: TrainedModel, as_of: date, horizon_days: int) -> list[float]:
    """Predicted units sold on each of the `horizon_days` days after `as_of`."""
    first_idx = (as_of - trained.start_date).days + 1
    idx = np.arange(first_idx, first_idx + horizon_days)
    predicted = trained.model.predict(features(idx, trained.start_date))
    return [float(v) for v in np.clip(predicted, 0, None)]


def predict_threshold_breach(
    trained: TrainedModel, current_quantity: float, threshold: float, as_of: date, horizon_days: int
) -> dict:
    """Finds the first day within the horizon on which stock falls below the threshold."""
    daily_demand = forecast_demand(trained, as_of, horizon_days)

    if current_quantity < threshold:
        return {
            "status": "alert",
            "days_until_threshold": 0,
            "predicted_date": as_of.isoformat(),
            "daily_demand": daily_demand,
        }

    remaining = float(current_quantity)
    for day_offset, demand in enumerate(daily_demand, start=1):
        remaining -= demand
        if remaining < threshold:
            return {
                "status": "alert",
                "days_until_threshold": day_offset,
                "predicted_date": (as_of + timedelta(days=day_offset)).isoformat(),
                "daily_demand": daily_demand,
            }

    return {
        "status": "ok",
        "days_until_threshold": None,
        "predicted_date": None,
        "daily_demand": daily_demand,
    }
