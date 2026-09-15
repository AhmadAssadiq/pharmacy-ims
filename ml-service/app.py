"""Forecasting microservice (Flask + scikit-learn).

Called by the Node.js backend over REST:

  GET  /health
  POST /train    {"medications": [{"medication_id", "sales": [{"date", "quantity_sold"}]}]}
  POST /predict  {"as_of_date", "horizon_days",
                  "medications": [{"medication_id", "current_quantity", "threshold"}]}

Trained models are persisted with joblib under ./models so /predict can run
without re-sending the sales history.
"""
from __future__ import annotations

import os
from datetime import date
from pathlib import Path

import joblib
from flask import Flask, jsonify, request

import forecaster

MODEL_DIR = Path(__file__).parent / "models"
MODEL_DIR.mkdir(exist_ok=True)

app = Flask(__name__)


def model_path(medication_id: int) -> Path:
    return MODEL_DIR / f"medication_{int(medication_id)}.joblib"


@app.get("/health")
def health():
    trained = len(list(MODEL_DIR.glob("medication_*.joblib")))
    return jsonify({"status": "ok", "trained_models": trained})


@app.post("/train")
def train():
    body = request.get_json(silent=True) or {}
    medications = body.get("medications", [])
    results = []
    for med in medications:
        med_id = int(med["medication_id"])
        trained, reason = forecaster.train(med.get("sales", []))
        if trained is None:
            # Remove a stale model so predictions do not use outdated data.
            model_path(med_id).unlink(missing_ok=True)
            results.append({"medication_id": med_id, "trained": False, "reason": reason})
            continue
        joblib.dump(trained, model_path(med_id))
        results.append(
            {
                "medication_id": med_id,
                "trained": True,
                "reason": reason,
                "history_days": trained.n_days,
                "mae": trained.mae,
            }
        )
    return jsonify({"results": results})


@app.post("/predict")
def predict():
    body = request.get_json(silent=True) or {}
    as_of = forecaster.parse_date(body.get("as_of_date") or date.today())
    horizon = int(body.get("horizon_days", 7))
    results = []
    for med in body.get("medications", []):
        med_id = int(med["medication_id"])
        path = model_path(med_id)
        if not path.exists():
            results.append(
                {"medication_id": med_id, "status": "insufficient_data", "reason": "no trained model"}
            )
            continue
        trained: forecaster.TrainedModel = joblib.load(path)
        prediction = forecaster.predict_threshold_breach(
            trained,
            current_quantity=float(med["current_quantity"]),
            threshold=float(med["threshold"]),
            as_of=as_of,
            horizon_days=horizon,
        )
        results.append({"medication_id": med_id, **prediction})
    return jsonify({"as_of_date": as_of.isoformat(), "horizon_days": horizon, "results": results})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("ML_PORT", "5001")))
