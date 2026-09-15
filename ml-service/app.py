"""Forecasting microservice entry point (scikit-learn).

Exposes a small REST API used by the Node.js backend. The forecasting logic is
added in the ML phase; this file currently only exposes a health endpoint so the
service can be started and reached.
"""
import os

from flask import Flask, jsonify

app = Flask(__name__)


@app.get("/health")
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("ML_PORT", "5001")))
