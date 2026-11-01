"""Backtest: how much the yearly seasonal wave improves the forecast (GP2 addition).

Replays the last year of the demo pharmacy's source-derived sales
(data/demo-sales.json, 2025) week by week. At each weekly origin both models
are trained on the sales before it, using forecaster.train exactly as the
service does, and asked for the following days:

* before - trend + weekday, on the last 90 days (the previous demo setup)
* after  - trend + weekday + yearly wave, on all history before the origin

Usage (from ml-service/):  venv\\Scripts\\python evaluate.py [path/to/demo-sales.json]

Two errors are printed per medication. "Daily MAE" is the mean absolute error
of each day's units. "Total error" is the error in the units summed over the
horizon, as a percentage of what was actually sold - the number a reorder
decision depends on, since the stock runs down by the total.
"""
from __future__ import annotations

import json
import sys
from datetime import date, timedelta
from pathlib import Path

import numpy as np

import forecaster

DEFAULT_DATA = Path(__file__).resolve().parent.parent / "data" / "demo-sales.json"
BEFORE_WINDOW_DAYS = 90
HORIZONS = (7, 28)
STEP_DAYS = 7


def backtest(values: list[int], first_day: date, test_days: int, horizon: int, seasonal: bool) -> tuple[float, float]:
    """Returns (daily MAE, mean total error %) over weekly origins in the test period."""
    daily_errors, total_errors = [], []
    n = len(values)
    for origin in range(n - test_days, n - horizon + 1, STEP_DAYS):
        start = 0 if seasonal else origin - BEFORE_WINDOW_DAYS
        sales = [
            {"date": first_day + timedelta(days=i), "quantity_sold": values[i]} for i in range(start, origin)
        ]
        trained, _ = forecaster.train(sales, seasonal=seasonal)
        predicted = np.array(forecaster.forecast_demand(trained, first_day + timedelta(days=origin - 1), horizon))
        actual = np.array(values[origin : origin + horizon], dtype=float)
        daily_errors.append(np.abs(predicted - actual).mean())
        total_errors.append(abs(predicted.sum() - actual.sum()) / max(actual.sum(), 1.0))
    return float(np.mean(daily_errors)), 100 * float(np.mean(total_errors))


def main() -> None:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_DATA
    data = json.loads(path.read_text(encoding="utf-8"))
    first_day = date.fromisoformat(data["first_day"])
    source_last = date.fromisoformat(data["source_last_day"])
    n_days = (source_last - first_day).days + 1
    test_days = 365
    test_from = source_last - timedelta(days=test_days - 1)
    print(f"Training from {first_day}, testing week by week from {test_from} to {source_last}.")

    for horizon in HORIZONS:
        print(f"\nNext {horizon} days            daily MAE (units)      total error")
        print(f"{'medication':16s}{'before':>10s}{'after':>10s}{'before':>12s}{'after':>10s}")
        sums = np.zeros(4)
        for medicine, values in data["medicines"].items():
            values = values[:n_days]
            before = backtest(values, first_day, test_days, horizon, seasonal=False)
            after = backtest(values, first_day, test_days, horizon, seasonal=True)
            row = np.array([before[0], after[0], before[1], after[1]])
            sums += row
            print(f"{medicine:16s}{row[0]:10.2f}{row[1]:10.2f}{row[2]:11.1f}%{row[3]:9.1f}%")
        avg = sums / len(data["medicines"])
        print(f"{'average':16s}{avg[0]:10.2f}{avg[1]:10.2f}{avg[2]:11.1f}%{avg[3]:9.1f}%")


if __name__ == "__main__":
    main()
