"""Unit tests for forecaster.py. Run from ml-service/:  venv\\Scripts\\python -m unittest"""
import math
import unittest
from datetime import date, timedelta

import numpy as np

import forecaster

START = date(2023, 1, 1)


def sales_for(days: int, demand) -> list[dict]:
    return [
        {"date": (START + timedelta(days=i)).isoformat(), "quantity_sold": demand(START + timedelta(days=i))}
        for i in range(days)
    ]


def winter_peak(day: date) -> float:
    """10 units a day on average, 15 in mid-winter, 5 in mid-summer."""
    return 10 + 5 * math.cos(2 * math.pi * (day.timetuple().tm_yday - 15) / 365.25)


class FeatureTests(unittest.TestCase):
    def test_width_without_and_with_the_yearly_wave(self):
        self.assertEqual(forecaster.build_features(START, range(3), seasonal=False).shape, (3, 8))
        self.assertEqual(forecaster.build_features(START, range(3), seasonal=True).shape, (3, 8 + 2 * forecaster.YEARLY_HARMONICS))

    def test_same_date_same_wave_whatever_the_start(self):
        a = forecaster.build_features(START, [10], seasonal=True).iloc[0, 8:].to_numpy()
        b = forecaster.build_features(START + timedelta(days=10), [0], seasonal=True).iloc[0, 8:].to_numpy()
        np.testing.assert_allclose(a, b)


class TrainTests(unittest.TestCase):
    def test_too_little_history_is_refused(self):
        trained, reason = forecaster.train(sales_for(5, lambda d: 3))
        self.assertIsNone(trained)
        self.assertIn("insufficient data", reason)

    def test_yearly_wave_needs_a_year_of_history(self):
        short, _ = forecaster.train(sales_for(200, winter_peak))
        long, _ = forecaster.train(sales_for(400, winter_peak))
        self.assertFalse(short.seasonal)
        self.assertTrue(long.seasonal)

    def test_seasonal_model_follows_the_season_the_old_one_misses(self):
        sales = sales_for(3 * 365, winter_peak)
        last = START + timedelta(days=3 * 365 - 1)
        actual = np.array([winter_peak(last + timedelta(days=i)) for i in range(1, 91)])

        seasonal, _ = forecaster.train(sales)
        flat, _ = forecaster.train(sales, seasonal=False)
        seasonal_error = np.abs(np.array(forecaster.forecast_demand(seasonal, last, 90)) - actual).mean()
        flat_error = np.abs(np.array(forecaster.forecast_demand(flat, last, 90)) - actual).mean()

        self.assertLess(seasonal_error, 0.5)
        self.assertGreater(flat_error, 2.0)

    def test_predictions_are_never_negative(self):
        trained, _ = forecaster.train(sales_for(60, lambda d: max(0, 30 - (d - START).days)))
        self.assertTrue(all(v >= 0 for v in forecaster.forecast_demand(trained, START + timedelta(days=59), 30)))

    def test_models_saved_before_the_wave_still_predict(self):
        trained, _ = forecaster.train(sales_for(60, lambda d: 4))
        del trained.__dict__["seasonal"]  # what joblib loads from an older file
        self.assertEqual(len(forecaster.forecast_demand(trained, START + timedelta(days=59), 7)), 7)


class BreachTests(unittest.TestCase):
    def test_first_day_below_threshold(self):
        trained, _ = forecaster.train(sales_for(60, lambda d: 5))
        result = forecaster.predict_threshold_breach(trained, 30, 10, START + timedelta(days=59), 7)
        self.assertEqual(result["status"], "alert")
        self.assertEqual(result["days_until_threshold"], 5)  # 30 - 5 x 5 = 5 < 10


if __name__ == "__main__":
    unittest.main()
