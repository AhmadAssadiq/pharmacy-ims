"""Demand forecasting for medication reorder alerts (FR 6, FR 6.1, FR 6.2).

One model is trained per medication on its historical daily sales. The model
is a scikit-learn LinearRegression over three kinds of features:

* a linear time index (captures rising / falling demand),
* one-hot day-of-week indicators (captures weekly seasonality), and
* a yearly seasonal wave (GP2 addition): sine/cosine pairs of the date's
  position in the year, which let the model learn how demand moves through the
  months and seasons - antibiotics and cough syrup in winter, antihistamines
  in spring. It is only used once a medication has a full year of history;
  with less, a year's pattern cannot be told apart from the trend.

The trained model predicts demand for each of the next N days; the cumulative
predicted demand is subtracted from the current stock to find the first day on
which the quantity falls below the safe threshold.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, datetime, timedelta

import numpy as np
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error

# A medication needs at least this many days of history before a forecast is
# attempted (UC-3 alternative flow: insufficient data -> no alert).
MIN_HISTORY_DAYS = 14
HOLDOUT_DAYS = 7
# A year of history before the yearly wave is added, and how many harmonics it
# has: 3 sine/cosine pairs can follow a winter peak, a spring peak or both,
# and scored best in the backtest (evaluate.py) against 2 and 4.
MIN_SEASONAL_DAYS = 365
YEARLY_HARMONICS = 3
DAYS_PER_YEAR = 365.25


def parse_date(value) -> date:
    if isinstance(value, date):
        return value
    return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()


def features(day_indices: np.ndarray, start: date, seasonal: bool = False) -> np.ndarray:
    """Builds the feature matrix: [day_index, dow_0 ... dow_6], plus
    [sin_1, cos_1 ... sin_k, cos_k] of the yearly wave when `seasonal`."""
    rows = []
    for idx in day_indices:
        day = start + timedelta(days=int(idx))
        one_hot = [0] * 7
        one_hot[day.weekday()] = 1
        row = [float(idx)] + one_hot
        if seasonal:
            # Measured from a fixed calendar origin, so the same date always
            # gets the same position in the year whatever the training start.
            angle = 2 * math.pi * day.toordinal() / DAYS_PER_YEAR
            for k in range(1, YEARLY_HARMONICS + 1):
                row += [math.sin(k * angle), math.cos(k * angle)]
        rows.append(row)
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
    seasonal: bool = False


def train(sales: list[dict], seasonal: bool | None = None) -> tuple[TrainedModel | None, str]:
    """Trains a model for one medication. Returns (model, reason).

    `seasonal` forces the yearly wave on or off; by default it is used when
    there are at least MIN_SEASONAL_DAYS of history.
    """
    aggregated = aggregate_daily(sales)
    if aggregated is None:
        return None, "no sales history"
    start, daily = aggregated
    n_days = len(daily)
    if n_days < MIN_HISTORY_DAYS:
        return None, f"insufficient data: {n_days} day(s) of history, need {MIN_HISTORY_DAYS}"

    if seasonal is None:
        seasonal = n_days >= MIN_SEASONAL_DAYS
    idx = np.arange(n_days)
    X = features(idx, start, seasonal)

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
        seasonal=seasonal,
    )
    return trained, "trained"


def forecast_demand(trained: TrainedModel, as_of: date, horizon_days: int) -> list[float]:
    """Predicted units sold on each of the `horizon_days` days after `as_of`."""
    first_idx = (as_of - trained.start_date).days + 1
    idx = np.arange(first_idx, first_idx + horizon_days)
    # Models saved before the yearly wave existed have no `seasonal` attribute.
    seasonal = getattr(trained, "seasonal", False)
    predicted = trained.model.predict(features(idx, trained.start_date, seasonal))
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
