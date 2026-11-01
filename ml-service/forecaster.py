"""Demand forecasting for the reorder alerts (FR 6, FR 6.1, FR 6.2).

One model is trained per medication on its own daily sales. The model is a scikit-learn
LinearRegression that looks at three kinds of information ("features") about each day:

* the day number (0, 1, 2, ...)    -> lets the model learn rising or falling demand (trend)
* the day of the week              -> lets it learn the weekly pattern (e.g. a quiet Friday)
* the position in the year         -> lets it learn months and seasons (GP2 addition): antibiotics
                                       and cough syrup in winter, antihistamines in spring.
                                       Only used once a medication has a full year of history -
                                       with less, a season cannot be told apart from a trend.

To check for a stock problem, the model predicts the demand for each of the next days, and the
predicted demand is taken away from the current stock day by day. The first day the stock drops
below the medication's reorder threshold is the day the alert is about.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, datetime, timedelta

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error

# A medication needs at least 14 days of sales before we forecast it
# (UC-3 alternative flow: not enough data -> no alert).
MIN_HISTORY_DAYS = 14

# The last 7 days are held back once to measure how accurate the model is (its "MAE").
HOLDOUT_DAYS = 7

# A year of history is needed before the seasonal features are used.
MIN_SEASONAL_DAYS = 365

# The yearly pattern is described by 3 pairs of sine/cosine waves. One pair can follow a single
# winter peak; three pairs can also follow a spring peak, or both. 3 scored best in the backtest
# (evaluate.py) against 2 and 4.
YEARLY_HARMONICS = 3
DAYS_PER_YEAR = 365.25


def parse_date(value) -> date:
    """Turns '2026-11-01' (or a date) into a date."""
    if isinstance(value, date):
        return value
    return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()


def daily_totals(sales: list[dict]) -> pd.Series:
    """Adds up the units sold per day, with 0 for days that had no sales.

    `sales` is a list like [{"date": "2026-10-01", "quantity_sold": 3}, ...]; one day can appear
    several times (several sales). Returns a pandas Series: one value per calendar day, from the
    first sale to the last, with the date as the index.
    """
    table = pd.DataFrame(sales)
    table["date"] = pd.to_datetime(table["date"].map(parse_date))
    totals = table.groupby("date")["quantity_sold"].sum().astype(float)
    # asfreq("D") adds every missing day in between; fill_value=0 gives those days 0 sales
    return totals.asfreq("D", fill_value=0.0)


def build_features(start: date, day_numbers, seasonal: bool) -> pd.DataFrame:
    """Builds the table of features the model uses: one row per day, one column per feature.

    `start` is the first day of the history (day number 0) and `day_numbers` says which days
    (they can go past the history, to predict the future).
    Columns: day_number, weekday_0 ... weekday_6 (Monday ... Sunday, 1 on that weekday, else 0),
    and when `seasonal`: year_sin_1, year_cos_1 ... year_sin_3, year_cos_3.
    """
    days = [start + timedelta(days=int(number)) for number in day_numbers]
    table = pd.DataFrame({"day_number": [float(number) for number in day_numbers]})

    # The day of the week, as seven yes/no (1/0) columns
    weekdays = np.array([day.weekday() for day in days])
    for weekday in range(7):
        table[f"weekday_{weekday}"] = (weekdays == weekday).astype(float)

    if seasonal:
        # The position in the year as an angle. It is counted from a fixed calendar date
        # (toordinal = days since 1 January of year 1), so the same date always gets the
        # same position, whatever day the history starts on.
        angles = np.array([2 * math.pi * day.toordinal() / DAYS_PER_YEAR for day in days])
        for k in range(1, YEARLY_HARMONICS + 1):
            table[f"year_sin_{k}"] = np.sin(k * angles)
            table[f"year_cos_{k}"] = np.cos(k * angles)

    return table


@dataclass
class TrainedModel:
    """A trained model plus what is needed to use it later (saved to disk by app.py)."""

    model: LinearRegression
    start_date: date  # the first day of the history (day number 0)
    last_date: date  # the last day of the history
    n_days: int  # how many days of history it was trained on
    mae: float | None  # mean absolute error on the held-back days (None with too little data)
    seasonal: bool = False  # whether the yearly (season) features were used


def train(sales: list[dict], seasonal: bool | None = None) -> tuple[TrainedModel | None, str]:
    """Trains a model for one medication. Returns (model, reason).

    The model is None when there is not enough history; `reason` then says why.
    `seasonal` can force the season features on or off; normally (None) they are used when
    there are at least MIN_SEASONAL_DAYS days of history.
    """
    if not sales:
        return None, "no sales history"

    daily = daily_totals(sales)
    n_days = len(daily)
    if n_days < MIN_HISTORY_DAYS:
        return None, f"insufficient data: {n_days} day(s) of history, need {MIN_HISTORY_DAYS}"

    if seasonal is None:
        seasonal = n_days >= MIN_SEASONAL_DAYS

    start = daily.index[0].date()
    features = build_features(start, range(n_days), seasonal)
    targets = daily.to_numpy()

    # 1. Measure the accuracy: train on everything except the last 7 days, predict those 7 days,
    #    and compare with what was really sold (mean absolute error, in units per day)
    mae = None
    if n_days >= MIN_HISTORY_DAYS + HOLDOUT_DAYS:
        split = n_days - HOLDOUT_DAYS
        test_model = LinearRegression().fit(features.iloc[:split], targets[:split])
        predicted = np.clip(test_model.predict(features.iloc[split:]), 0, None)  # no negative sales
        mae = float(mean_absolute_error(targets[split:], predicted))

    # 2. The real model: trained on the whole history
    model = LinearRegression().fit(features, targets)

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
    """The predicted units sold on each of the `horizon_days` days after `as_of`."""
    # Day numbers continue from the start of the history: tomorrow is (as_of - start) + 1
    first_day_number = (as_of - trained.start_date).days + 1
    day_numbers = range(first_day_number, first_day_number + horizon_days)

    # Models saved before the season features existed have no `seasonal` attribute
    seasonal = getattr(trained, "seasonal", False)
    predicted = trained.model.predict(build_features(trained.start_date, day_numbers, seasonal))
    return [float(value) for value in np.clip(predicted, 0, None)]


def predict_threshold_breach(
    trained: TrainedModel, current_quantity: float, threshold: float, as_of: date, horizon_days: int
) -> dict:
    """Finds the first day within the horizon on which the stock falls below the threshold.

    Returns {"status": "alert" or "ok", "days_until_threshold", "predicted_date", "daily_demand"}.
    """
    daily_demand = forecast_demand(trained, as_of, horizon_days)

    # Already below the threshold today
    if current_quantity < threshold:
        return {
            "status": "alert",
            "days_until_threshold": 0,
            "predicted_date": as_of.isoformat(),
            "daily_demand": daily_demand,
        }

    # Take each day's predicted demand off the stock until it drops below the threshold
    stock_left = float(current_quantity)
    for day_offset, demand in enumerate(daily_demand, start=1):
        stock_left -= demand
        if stock_left < threshold:
            return {
                "status": "alert",
                "days_until_threshold": day_offset,
                "predicted_date": (as_of + timedelta(days=day_offset)).isoformat(),
                "daily_demand": daily_demand,
            }

    # Enough stock for the whole horizon
    return {"status": "ok", "days_until_threshold": None, "predicted_date": None, "daily_demand": daily_demand}
