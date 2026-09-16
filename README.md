# Pharmacy Inventory Management System (PIMS)

Graduation project - King Hussein School of Computing Sciences, Princess Sumaya University
for Technology. Prepared by **Abdallah Hasan** and **Ahmad Sadiq**, supervised by
**Dr. Ahmad Altamimi**.

A web application that combines pharmacy inventory management, real-time patient/staff
chat, and machine-learning reorder alerts, built exactly to the GP1 software documentation.

## Repository layout

```
/pharmacy-ims
  /client       -> React app (staff + patient portals)      - Vite, React Router
  /server       -> Node.js REST API + WebSocket chat server  - Express, mysql2, ws, node-cron
  /ml-service   -> Python forecasting microservice           - Flask, scikit-learn
  /shared       -> constants shared by client and server (thresholds, roles, statuses)
```

The server follows a routes -> controllers -> services -> models layering (NFR 5.1):

```
server/src
  config/        environment + MySQL pool
  db/            schema.sql, migrate.js, seed.js
  models/        one data-access module per table (parameterized queries only)
  services/      business logic (auth, medications, chat, forecast, availability)
  controllers/   HTTP handlers
  routes/        Express routers + auth / role middleware wiring
  middleware/    authenticate, requireRole, errorHandler
  validation/    pure input validation (unit tested)
  ws/            WebSocket chat hub
  jobs/          scheduled forecast job
  utils/         stock flags, HttpError, asyncHandler
```

## Prerequisites

- Node.js 22 or newer
- **Python 3.12** - not 3.13 or 3.14. The pinned `numpy` and `scikit-learn` versions in
  `ml-service/requirements.txt` have no prebuilt wheels for those releases, so `pip` falls back to
  compiling from source and the install fails. On Windows: `winget install Python.Python.3.12`
- MySQL 8.x running locally (the default config expects `root` with an empty password on
  `127.0.0.1:3306`; change `server/.env` if yours differs)

Nothing machine-specific is committed: `node_modules/`, `ml-service/venv/`, the trained
`*.joblib` models and `server/.env` are all git-ignored, and the database lives in MySQL rather
than in the repository. The steps below recreate all of them from scratch on a new machine.

## Setup

### 1. Install dependencies

```bash
npm install
```

This installs the `client` and `server` workspaces from the repository root.

Create the Python environment with 3.12 explicitly, so it does not pick up a newer default
interpreter:

```bash
cd ml-service
py -3.12 -m venv venv                             # Windows
venv\Scripts\pip install -r requirements.txt
```

```bash
# macOS / Linux
python3.12 -m venv venv
source venv/bin/activate && pip install -r requirements.txt
```

`venv\Scripts\python --version` should report 3.12.x before you continue.

### 2. Configure the server

```bash
cp server/.env.example server/.env
```

Edit `server/.env` and set at least `DB_PASSWORD` (if your MySQL root has one) and a random
`JWT_SECRET`.

`server/.env` is git-ignored, so it never arrives with a clone - you must create it on every new
machine. The server scripts run with `node --env-file=.env` and will refuse to start if the file
is missing.

### 3. Create the database and demo data

```bash
npm run db:migrate
npm run db:seed
```

`db:migrate` creates the `pharmacy_ims` database with seven tables (`users`, `medications`,
`medication_batches`, `chat_sessions`, `chat_messages`, `sales_history`, `reorder_alerts`).
`db:seed` creates the demo accounts, a starter catalog held as dated stock lots and 90 days of
synthetic sales history.

`db:migrate` only issues `CREATE TABLE IF NOT EXISTS`, so it cannot apply schema changes to
tables that already exist. After a schema change, rebuild the database instead:

```bash
npm run db:reset      # drops the database, then migrates and seeds it again
```

| Account | Email | Password | Role |
|---|---|---|---|
| Pharmacy Staff | `staff@pharmacy.com` | `Staff123!` | staff |
| Demo Patient | `patient@example.com` | `Patient123!` | patient |

Patients can also self-register from the login page. Staff accounts are created by the
administrator (see `server/src/db/seed.js`).

## Running

Open two terminals - the second command starts both the API and the client.

**ML service** (port 5001):

```bash
cd ml-service
venv\Scripts\python app.py
```

**API + WebSocket server** (port 4000) and **React client** (port 5173), from the repo root:

```bash
npm run dev
```

(or separately: `npm run dev -w server` and `npm run dev -w client`).

Open <http://localhost:5173>.

The staff portal has five pages: **Inventory** (stock levels, flags and per-medication reorder
thresholds), **Add stock** (receive a lot, or add a medication the catalog does not carry yet),
**Dispense** (record a multi-item sale), **Forecast** (per-medication demand charts) and
**Chat inbox**. The ML service only needs to be running for the forecast features.

### Useful commands

| Command | What it does |
|---|---|
| `npm test` | Runs the server unit tests (auth validation, lockout, role middleware, medication validation, stock flags, FEFO allocation) |
| `npm run db:reset` | Drops, migrates and re-seeds the database (needed after a schema change) |
| `npm run forecast -w server` | Runs the ML forecast / reorder-alert check once and prints the result |
| `npm run build -w client` | Production build of the React app into `client/dist` |

## Features and requirement traceability

| Requirement | Where it is implemented |
|---|---|
| FR 1 - authenticate before any access | `server/src/middleware/authenticate.js`, `client/src/components/ProtectedRoute.jsx` |
| FR 2 / 2.1 / 2.2 - role-based access | `server/src/middleware/requireRole.js`, role-specific routes and navigation in `client/src/App.jsx` |
| FR 3 / 3.1 / 3.2 - manage medication catalog | `server/src/routes/medicationRoutes.js` -> `medicationService.js`; `client/src/pages/staff/StaffInventoryPage.jsx` |
| FR 4 - stock levels with low-stock / near-expiry flags | `server/src/utils/stockFlags.js` (per-medication threshold, 30 days) |
| UC-1 - update stock quantity | receiving or correcting a stock lot: `batchService.js`, `client/src/components/inventory/BatchPanel.jsx` |
| Dispensing (GP2 addition) - record a sale, deplete stock FEFO, feed the forecast | `server/src/services/salesService.js`, `server/src/utils/fefo.js`, `client/src/pages/staff/StaffSellPage.jsx` |
| Forecast charts (GP2 addition) - per-medication demand history and prediction | `forecastService.getMedicationForecast`, `client/src/pages/staff/StaffForecastPage.jsx`, `client/src/components/forecast/` |
| FR 5 / 5.1 / 5.2 - real-time chat, persisted, unified inbox | `server/src/ws/chatHub.js`, `chatService.js`; `PatientChatPage.jsx`, `StaffChatInboxPage.jsx` |
| FR 6 / 6.1 / 6.2 - ML forecast + 7-day reorder alerts | `ml-service/forecaster.py`, `server/src/services/forecastService.js`, `server/src/jobs/forecastJob.js`, `ReorderAlertPanel.jsx` |
| FR 7 - availability without exact quantities | `server/src/services/availabilityService.js`, `PatientAvailabilityPage.jsx` |
| NFR 2.1 - secure storage | bcrypt password hashes, parameterized SQL everywhere, JWT-protected API and WebSocket |
| NFR 2.3 - lock after 5 failed logins | `server/src/services/loginAttemptService.js` (15-minute lock) |
| NFR 3.2 - desktop and mobile | responsive CSS in `client/src/styles.css` |
| NFR 5.1 - modular code | layering described above |

Thresholds live in `shared/constants.json`:

| Constant | Value | Used for |
|---|---|---|
| `LOW_STOCK_THRESHOLD` | 10 | *default* low-stock threshold for a new medication; each medication stores its own `low_stock_threshold`, used for the FR 4 flag and the FR 6.2 reorder alerts |
| `NEAR_EXPIRY_DAYS` | 30 | near-expiry flag (FR 4) |
| `FORECAST_HORIZON_DAYS` | 7 | reorder alert window (FR 6.2) |
| `MAX_LOGIN_ATTEMPTS` / `LOCKOUT_MINUTES` | 5 / 15 | login lockout (NFR 2.3) |

## How the forecasting works

0. Every sale recorded at the dispensing counter writes a row into `sales_history`, so the model
   trains on real demand as the pharmacy is used, not only on the seeded history.
1. The backend job (hourly by default, `FORECAST_CRON`, and once 5 s after start-up) sends each
   medication's `sales_history` rows to the ML service `POST /train`.
2. The service aggregates sales per day and fits a scikit-learn `LinearRegression` per
   medication on a time index plus day-of-week indicators. Medications with fewer than 14 days
   of history are skipped (no model, no alert - UC-3 alternative flow). Models are persisted
   under `ml-service/models/`.
3. The backend calls `POST /predict` with each medication's current quantity and the safe
   threshold. The service forecasts the next 7 days of demand and reports the first day the
   stock is predicted to fall below the threshold.
4. Predicted breaches are written to `reorder_alerts` (created, or refreshed if already
   active). Medications that are fine again have their active alert removed. Alerts staff
   dismissed are not re-raised while the prediction is unchanged.
5. The staff dashboard shows active alerts with the medication name and days until the
   threshold; staff can dismiss them.

## API summary

All endpoints are under `/api` and, except register/login, require `Authorization: Bearer <jwt>`.

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/auth/register` | public | create a patient account |
| POST | `/auth/login` | public | sign in (locks after 5 failures) |
| GET | `/auth/me` | any | current user |
| GET/POST | `/medications` | staff | list / add medication (adding also creates its opening stock lot) |
| GET/PUT/DELETE | `/medications/:id` | staff | read / update catalog fields / delete |
| GET/POST | `/medications/:id/batches` | staff | list stock lots / receive a new lot (UC-1) |
| PATCH/DELETE | `/medications/batches/:batchId` | staff | correct or remove a stock lot (UC-1) |
| GET/POST | `/sales` | staff | recent sales / record a multi-item sale `{ items: [{ medication_id, quantity }] }`, depleting stock FEFO in one transaction |
| GET | `/sales/preview` | staff | which lots one basket line would draw from, before committing |
| GET | `/forecast/:medicationId` | staff | sales history + 7-day forecast for one medication (retrains on request; powers the forecast charts) |
| GET | `/alerts` | staff | active reorder alerts |
| PATCH | `/alerts/:id/dismiss` | staff | dismiss an alert |
| POST | `/chat/sessions` | patient | open (or create) the patient's chat session |
| GET | `/chat/sessions` | staff | unified inbox |
| GET | `/chat/sessions/:id/messages` | participant | message history |
| POST | `/chat/sessions/:id/messages` | participant | send (HTTP fallback; also pushed over WebSocket) |
| GET | `/availability` | any | in-stock / out-of-stock list |
| WS | `/ws?token=<jwt>` | any | real-time chat channel |

## Testing

See [docs/TESTING.md](docs/TESTING.md) for the unit tests, the manual verification of every
non-functional requirement and the user-acceptance pass through UC-1, UC-2 and UC-3.
