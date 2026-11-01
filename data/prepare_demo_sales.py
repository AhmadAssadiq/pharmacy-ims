"""Builds the demo pharmacy's daily sales history (data/demo-sales.json).

Source: "Global Pharmacy Sales Dataset (2020-2025)" on Kaggle (annemark),
https://www.kaggle.com/datasets/annemark/global-pharmacy-sales-dataset-20202025
- a synthetic daily dataset of units sold per medicine, region, country and age
group. The raw CSV is not committed (its licence is listed as "Unknown");
download it into data/raw/ and run:

    py -3.12 -I data/prepare_demo_sales.py data/raw/global_pharmacy_sales_2020_2025_daily_dataset.csv

Steps, all printed as they run:

1. Drop exact duplicate rows.
2. Drop 2020-2021: the dataset flags them as COVID years (covid_flag = 1) and
   their demand runs ~60% above normal, which is not a normal pharmacy year.
3. Cap outliers: units_sold above Q3 + 3 x IQR (per medicine) is clipped to
   that bound.
4. Sum the rows per medicine per day (every day has one row per region) and
   keep only the day-to-day variation: each day divided by its month's mean.
   Every medicine in the source shares one seasonal curve (peak in March in
   both hemispheres), so the source's seasonality is removed here.
5. Rebuild each medicine's demand for one community pharmacy in Amman:
   its own average volume, yearly growth, seasonal profile (antibiotics and
   cough syrup peak in winter, antihistamines in the spring pollen season,
   chronic medicines barely move) and the Jordanian week (Friday quietest).
   The day's units are drawn from a Poisson distribution around that
   expectation times the day's variation from step 4, with a fixed seed, so
   the output is reproducible.
6. Carry the series on past the source's last year, to the end of 2029, so
   the demo always has history up to "yesterday": the later years reuse the
   2022-2025 day-to-day variation in a four-year cycle, while volume, growth
   and seasons continue smoothly. The app reads the file by calendar date, so
   its 2022-2025 history is the cleaned source data itself.

Only the standard library is used.
"""
from __future__ import annotations

import csv
import json
import math
import random
import sys
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

FIRST_DAY = date(2022, 1, 1)
SOURCE_LAST_DAY = date(2025, 12, 31)  # last day of the cleaned source data
LAST_DAY = date(2029, 12, 31)  # last day written to demo-sales.json
OUTPUT = Path(__file__).resolve().parent / "demo-sales.json"
SEED = 2022

# Monday .. Sunday. Friday is the weekend in Jordan and Saturday is quieter;
# Thursday is busy ahead of the weekend.
WEEKDAY = [1.05, 1.00, 1.00, 1.05, 1.15, 0.65, 0.85]

# avg: units per day on an average day at the start of 2022.
# growth: change in demand per year.
# season: January .. December multipliers (rescaled to average 1).
PROFILES = {
    "Paracetamol": {"avg": 14, "growth": 0.00,
                    "season": [1.25, 1.20, 1.05, 0.95, 0.90, 0.88, 0.90, 0.90, 0.92, 1.00, 1.10, 1.25]},
    "Ibuprofen": {"avg": 8, "growth": 0.01,
                  "season": [1.15, 1.12, 1.02, 0.97, 0.95, 0.92, 0.92, 0.93, 0.95, 1.00, 1.05, 1.12]},
    # Respiratory infections: winter peak, summer low. Slowly falling with
    # antibiotic stewardship.
    "Amoxicillin": {"avg": 6, "growth": -0.02,
                    "season": [1.35, 1.30, 1.10, 0.95, 0.85, 0.75, 0.70, 0.72, 0.85, 1.00, 1.15, 1.30]},
    "Azithromycin": {"avg": 3, "growth": -0.01,
                     "season": [1.40, 1.35, 1.10, 0.90, 0.80, 0.70, 0.65, 0.70, 0.85, 1.00, 1.20, 1.35]},
    # Chronic medicines: steady all year, growing with the patient base.
    "Metformin": {"avg": 7, "growth": 0.06,
                  "season": [1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00]},
    "Amlodipine": {"avg": 6, "growth": 0.05,
                   "season": [1.02, 1.01, 1.00, 1.00, 0.99, 0.98, 0.98, 0.99, 1.00, 1.00, 1.01, 1.02]},
    # Spring pollen season, with a smaller autumn bump.
    "Cetirizine": {"avg": 5, "growth": 0.02,
                   "season": [0.80, 0.90, 1.30, 1.55, 1.45, 1.05, 0.80, 0.75, 0.95, 1.05, 0.85, 0.75]},
    "Cough Syrup": {"avg": 5, "growth": 0.00,
                    "season": [1.75, 1.60, 1.15, 0.80, 0.60, 0.45, 0.40, 0.45, 0.70, 1.00, 1.40, 1.70]},
    "Vitamin C": {"avg": 4, "growth": 0.04,
                  "season": [1.40, 1.30, 1.05, 0.90, 0.80, 0.70, 0.70, 0.75, 0.90, 1.05, 1.20, 1.35]},
    # New-year resolutions and back to school.
    "Multivitamin": {"avg": 3, "growth": 0.03,
                     "season": [1.25, 1.05, 1.00, 0.95, 0.92, 0.88, 0.88, 0.95, 1.15, 1.05, 0.95, 0.97]},
}


def read_rows(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def percentile(sorted_values: list[float], q: float) -> float:
    pos = (len(sorted_values) - 1) * q
    lo, hi = math.floor(pos), math.ceil(pos)
    return sorted_values[lo] + (sorted_values[hi] - sorted_values[lo]) * (pos - lo)


def clean(rows: list[dict]) -> list[dict]:
    seen, unique = set(), []
    for row in rows:
        key = tuple(row.values())
        if key not in seen:
            seen.add(key)
            unique.append(row)
    print(f"  rows read                 {len(rows):>7}")
    print(f"  exact duplicates dropped  {len(rows) - len(unique):>7}")

    kept = [r for r in unique if FIRST_DAY.isoformat() <= r["date"] <= SOURCE_LAST_DAY.isoformat()]
    covid_left = sum(r["covid_flag"] == "1" for r in kept)
    print(f"  2020-2021 rows dropped    {len(unique) - len(kept):>7}  (COVID-flagged rows left: {covid_left})")

    by_medicine = defaultdict(list)
    for r in kept:
        by_medicine[r["medicine"]].append(float(r["units_sold"]))
    caps = {}
    for medicine, values in by_medicine.items():
        values.sort()
        q1, q3 = percentile(values, 0.25), percentile(values, 0.75)
        caps[medicine] = q3 + 3 * (q3 - q1)
    capped = 0
    for r in kept:
        units = float(r["units_sold"])
        if units > caps[r["medicine"]]:
            capped += 1
            units = caps[r["medicine"]]
        r["units"] = units
    print(f"  outliers capped           {capped:>7}  (Q3 + 3 x IQR per medicine)")
    print(f"  rows used                 {len(kept):>7}")
    return kept


def daily_variation(rows: list[dict]) -> dict[str, dict[date, float]]:
    """Per medicine: each day's total divided by the mean of its calendar month."""
    totals = defaultdict(lambda: defaultdict(float))
    for r in rows:
        totals[r["medicine"]][date.fromisoformat(r["date"])] += r["units"]

    variation = {}
    for medicine, days in totals.items():
        month_days = defaultdict(list)
        for day, value in days.items():
            month_days[(day.year, day.month)].append(value)
        month_mean = {k: sum(v) / len(v) for k, v in month_days.items()}
        variation[medicine] = {d: v / month_mean[(d.year, d.month)] for d, v in days.items()}
    return variation


def seasonal_factor(profile: list[float], day: date) -> float:
    """Monthly multipliers placed at mid-month, linearly interpolated between them."""
    mean = sum(profile) / len(profile)
    months = [p / mean for p in profile]
    # Position in months, 0.0 = middle of January.
    position = (day.month - 1) + (day.day - 0.5) / 30.44 - 0.5
    lower = math.floor(position)
    frac = position - lower
    return months[lower % 12] * (1 - frac) + months[(lower + 1) % 12] * frac


def source_day(day: date) -> date:
    """The source day whose variation `day` uses: itself up to 2025, then a four-year cycle."""
    if day <= SOURCE_LAST_DAY:
        return day
    years = SOURCE_LAST_DAY.year - FIRST_DAY.year + 1
    year = FIRST_DAY.year + (day.year - FIRST_DAY.year) % years
    # 29 February only exists in leap years; fall back to the 28th.
    return date(year, day.month, min(day.day, 28 if day.month == 2 and year % 4 else day.day))


def poisson(rng: random.Random, lam: float) -> int:
    """Knuth's algorithm; fine for the small daily means used here."""
    limit, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= rng.random()
        if p <= limit:
            return k
        k += 1


def build(variation: dict[str, dict[date, float]]) -> dict[str, list[int]]:
    weekday_mean = sum(WEEKDAY) / 7
    n_days = (LAST_DAY - FIRST_DAY).days + 1
    series = {}
    for index, (medicine, profile) in enumerate(PROFILES.items()):
        if medicine not in variation:
            raise SystemExit(f"{medicine} is not in the source data")
        rng = random.Random(SEED + index)
        values = []
        for offset in range(n_days):
            day = FIRST_DAY + timedelta(days=offset)
            years = offset / 365.25
            expected = (
                profile["avg"]
                * (1 + profile["growth"]) ** years
                * seasonal_factor(profile["season"], day)
                * WEEKDAY[day.weekday()] / weekday_mean
                * variation[medicine].get(source_day(day), 1.0)
            )
            values.append(poisson(rng, expected))
        series[medicine] = values
    return series


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: prepare_demo_sales.py <path to the Kaggle CSV>")
    print("Cleaning the source data...")
    rows = clean(read_rows(Path(sys.argv[1])))
    print("Building the demo pharmacy's sales...")
    series = build(daily_variation(rows))
    for medicine, values in series.items():
        print(f"  {medicine:13s} {sum(values) / len(values):6.2f} units/day on average")

    # One medicine per line keeps the file readable and its git diffs small.
    header = {
        "source": "Kaggle: Global Pharmacy Sales Dataset (2020-2025), annemark - "
        "cleaned and re-shaped by data/prepare_demo_sales.py",
        "first_day": FIRST_DAY.isoformat(),
        "source_last_day": SOURCE_LAST_DAY.isoformat(),
        "last_day": LAST_DAY.isoformat(),
    }
    lines = [f"  {json.dumps(k)}: {json.dumps(v)}," for k, v in header.items()]
    medicines = [f"    {json.dumps(k)}: {json.dumps(v, separators=(',', ':'))}" for k, v in series.items()]
    text = "{\n" + "\n".join(lines) + '\n  "medicines": {\n' + ",\n".join(medicines) + "\n  }\n}\n"
    OUTPUT.write_text(text, encoding="utf-8")
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
