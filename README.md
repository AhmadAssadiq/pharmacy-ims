# Pharmacy Inventory Management System (PIMS)

Graduation project - King Hussein School of Computing Sciences, Princess Sumaya University
for Technology. Prepared by **Abdallah Hasan** and **Ahmad Sadiq**, supervised by
**Dr. Ahmad Altamimi**.

A web application that combines pharmacy inventory management, real-time patient/staff
chat, and machine-learning reorder alerts, built exactly to the GP1 software documentation.
GP2 adds dispensing, forecast charts, preorders, image messages, online status, password
reset, account deletion, dark mode and a full Arabic (right-to-left) interface.

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
  db/            schema.sql, migrate.js (+ upgrades.js: in-place upgrades), seed.js
  models/        one data-access module per table (parameterized queries only)
  services/      business logic (auth, medications, chat, forecast, availability)
  controllers/   HTTP handlers
  routes/        Express routers + auth / role middleware wiring
  middleware/    authenticate, requireRole, errorHandler
  validation/    pure input validation (unit tested)
  ws/            WebSocket chat hub + presence.js (who is online)
  jobs/          scheduled forecast job
  utils/         stock flags, FEFO, HttpError, reset tokens, image sniffing, upload store
```

The client keeps the same split, plus `client/src/i18n/` (English and Arabic dictionaries and
the translator), `client/src/context/ThemeContext.jsx` (light / dark / system) and
`client/src/config/pharmacy.js` (the pharmacy's own details, see below).

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

| Variable | Default | Purpose |
|---|---|---|
| `PORT`, `DB_*`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CLIENT_ORIGIN`, `ML_SERVICE_URL`, `FORECAST_CRON` | see `.env.example` | as before |
| `AUTH_RESET_DEBUG` | `false` | `true` prints password reset links to the server console (development only; ignored when `NODE_ENV=production`). There is no mail service yet - see "Password reset" |
| `UPLOADS_DIR` | `server/uploads` | where chat images are stored; created at start-up, git-ignored |
| `NODE_ENV` | `development` | set to `production` in production |

`server/.env` is git-ignored, so it never arrives with a clone - you must create it on every new
machine. The server scripts run with `node --env-file=.env` and will refuse to start if the file
is missing.

### 3. Create the database and demo data

```bash
npm run db:migrate
npm run db:seed
```

`db:migrate` creates the `pharmacy_ims` database with nine tables (`users`, `medications`,
`medication_batches`, `chat_sessions`, `chat_messages`, `sales_history`, `reorder_alerts`,
`preorders`, `password_resets`). `db:seed` creates the demo accounts, a starter catalog held as
dated stock lots and 90 days of synthetic sales history.

`schema.sql` only issues `CREATE TABLE IF NOT EXISTS`, so on its own it cannot change a table that
already exists. `db:migrate` therefore also runs `server/src/db/upgrades.js`, whose steps check
whether they are needed and are safe to re-run. **An existing database upgrades in place with
`npm run db:migrate`; no reset is needed for the GP2 changes.** The steps so far:

- one chat session per patient: merges duplicate sessions (moving their messages), then adds a
  unique key on `chat_sessions.patient_id`;
- image attachments: adds `attachment_path`, `attachment_mime`, `attachment_size`,
  `attachment_name` (and a unique key on the path) to `chat_messages`.

New tables need nothing special: `CREATE TABLE IF NOT EXISTS` adds them. To start from a clean
slate (seed data goes stale after a few weeks):

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

The staff portal has six pages: **Inventory** (stock levels, flags and per-medication reorder
thresholds), **Add stock** (receive a lot, or add a medication the catalog does not carry yet),
**Dispense** (record a multi-item sale), **Preorders** (patient requests for out-of-stock
medication), **Forecast** (per-medication demand charts) and **Chat inbox**. The patient portal
has **Medication availability** (with preorder requests), **Chat with pharmacy**, **About**,
**Contact** and, behind the patient's name in the top bar, **Your account**. **Contact** and the
**404** page also work signed out. The ML service only needs to be running for the forecast
features.

Every page has a live date and time, a language switch (English / العربية) and a theme switch
(system / light / dark) in the top bar; the signed-out pages have the language and theme switches
and a Contact link.

### Useful commands

| Command | What it does |
|---|---|
| `npm test` | Runs the unit tests (92): validation, lockout, roles, stock flags, FEFO, preorders, reset tokens, rate limiter, presence, image sniffing, account deletion, the i18n dictionaries and the translator |
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
| Live clock (GP2 addition) | `client/src/components/Clock.jsx` |
| Dark mode (GP2 addition) | `client/src/context/ThemeContext.jsx`, `ThemeToggle.jsx`, dark token set in `styles.css`, pre-paint script in `client/index.html` |
| Arabic / RTL (GP2 addition) | `client/src/i18n/`, `LanguageToggle.jsx`, logical CSS properties, error `code`s from `server/src/utils/httpError.js` |
| Preorders (GP2 addition) | `server/src/services/preorderService.js` (collect = FEFO dispense in one transaction), `PatientAvailabilityPage.jsx`, `StaffPreordersPage.jsx` |
| Forgot password (GP2 addition) | `server/src/services/passwordResetService.js`, `utils/resetToken.js`, `ForgotPasswordPage.jsx`, `ResetPasswordPage.jsx` |
| Online status (GP2 addition) | `server/src/ws/presence.js`, `chatHub.js`; `ChatWindow.jsx` (`PresenceMark`) |
| Image messages (GP2 addition) | `server/src/utils/imageSniff.js`, `uploadStore.js`, `chatService.sendImage`; `ChatWindow.jsx`, `ChatImage.jsx` |
| Delete account (GP2 addition) | `authService.deleteOwnAccount`, `middleware/authenticate.js` (user must still exist), `PatientAccountPage.jsx` |
| 404, About, Contact (GP2 addition) | `NotFoundPage.jsx`, `PatientAboutPage.jsx`, `ContactPage.jsx`, `client/src/config/pharmacy.js` |

Thresholds live in `shared/constants.json`:

| Constant | Value | Used for |
|---|---|---|
| `LOW_STOCK_THRESHOLD` | 10 | *default* low-stock threshold for a new medication; each medication stores its own `low_stock_threshold`, used for the FR 4 flag and the FR 6.2 reorder alerts |
| `NEAR_EXPIRY_DAYS` | 30 | near-expiry flag (FR 4) |
| `FORECAST_HORIZON_DAYS` | 7 | reorder alert window (FR 6.2) |
| `MAX_LOGIN_ATTEMPTS` / `LOCKOUT_MINUTES` | 5 / 15 | login lockout (NFR 2.3) |
| `PASSWORD_MIN_LENGTH` | 8 | registration and password reset |
| `PASSWORD_RESET_MINUTES` | 15 | how long a reset link works |
| `PREORDER_MAX_QUANTITY` / `PREORDER_NOTE_MAX_LENGTH` | 100 / 500 | preorder limits |
| `CHAT_MESSAGE_MAX_LENGTH` | 2000 | message and image caption length |
| `CHAT_IMAGE_MAX_BYTES` / `CHAT_IMAGE_TYPES` | 5 MB / PNG, JPEG, WebP, GIF | image messages |
| `ERROR_CODES` | - | stable codes the server sends with user-visible errors, translated by the client |

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

All endpoints are under `/api` and, except register, login, forgot-password and reset-password,
require `Authorization: Bearer <jwt>` for a user that still exists. Errors are
`{ error, code?, params?, details? }`: `error` is English, `code` is one of `ERROR_CODES`.

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/auth/register` | public | create a patient account |
| POST | `/auth/login` | public | sign in (locks after 5 failures) |
| GET | `/auth/me` | any | current user |
| DELETE | `/auth/me` | patient | delete your own account `{ password }`; staff get 403 |
| POST | `/auth/forgot-password` | public | `{ email }`; always the same 200 answer (rate limited) |
| POST | `/auth/reset-password` | public | `{ token, password }` (rate limited) |
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
| POST | `/chat/sessions/:id/attachments` | participant | multipart: `image` (PNG/JPEG/WebP/GIF, max 5 MB) + optional `caption` |
| GET | `/chat/attachments/:key` | participant | the image, after re-checking access |
| POST | `/preorders` | patient | request an out-of-stock medication `{ medication_id, quantity, note? }` |
| GET | `/preorders/mine` | patient | your own requests |
| POST | `/preorders/:id/cancel` | patient | cancel your own pending request |
| GET | `/preorders` | staff | all requests, newest first, `?status=` optional |
| PATCH | `/preorders/:id` | staff | `{ status }`: pending -> ready / cancelled, ready -> collected / cancelled |
| GET | `/availability` | any | in-stock / out-of-stock list |
| WS | `/ws?token=<jwt>` | any | real-time chat channel, plus `presence` frames |

## Notes on the GP2 features

**Languages.** English and Arabic, chosen in the top bar (stored as `pims_lang`; the default
follows the browser). Arabic switches the whole layout to right to left through logical CSS
properties; charts stay left to right, as is usual for time series. Arabic keeps Western digits
(`ar-JO-u-nu-latn`) so quantities and prices read the same to everyone, and Jordanian month
names. Every string lives in `client/src/i18n/en.json` and `ar.json`; a unit test fails if the
two files ever have different keys or an error code has no translation. Stored data (medication
names, categories, suppliers) is shown as entered. The Arabic font, IBM Plex Sans Arabic, loads
only when Arabic is chosen.

**Password reset.** `POST /auth/forgot-password` answers identically for any email and issues
the token after the response, so neither the body nor the timing reveals which emails have
accounts. A link holds a 32-byte random token; only its SHA-256 is stored, it works once, for 15
minutes, and a newer link retires older ones. **There is no mail service.** For local testing
set `AUTH_RESET_DEBUG=true` in `server/.env` and the link appears in the server console.
**Before production, add an SMTP server or a mail provider's API** at the `TODO(production)` in
`server/src/services/passwordResetService.js`; until then nobody receives a reset link. Both
endpoints are rate limited in memory per IP (and per email for forgot-password); behind a
reverse proxy, set Express's `trust proxy` so the limiter sees client addresses.

**Online status.** Presence is in memory only (`server/src/ws/presence.js`): nothing is written
to the database on connect or disconnect, it resets when the server restarts, and there is
therefore no "last seen". Staff see which patients are online; a patient only learns whether
anyone at the pharmacy is online. A closed laptop goes offline within about a minute through the
WebSocket heartbeat.

**Image messages.** Uploads are sniffed by their bytes (SVG is always refused), written to
`UPLOADS_DIR` under a random UUID name, and served only by the authenticated route, which
re-checks access and sends `nosniff` and a sandboxing CSP. The folder is never served
statically. Deleting a patient's account also deletes their conversation's image files.

**Account deletion.** Patients only, confirmed with their password (a wrong one counts toward
the login lockout). The foreign keys remove the patient's chat session (with every message in it,
staff replies included), preorders and reset tokens; `sales_history` has no link to users, so
dispensing records and the forecast are untouched. `authenticate` checks that the user still
exists on every request, so a deleted account's token stops working immediately, and the
patient's open sockets are closed.

**The pharmacy's details.** `client/src/config/pharmacy.js` holds the name, address, map
query, phone, email, licence number and opening hours used by About and Contact. **Every value
there is a placeholder** and must be replaced with the real pharmacy's details.

**Deploying the client.** The app routes in the browser, so the static host must serve
`index.html` for unknown paths (a "single-page app" fallback); otherwise the 404 page, and any
reload on a deep link, never renders.

## Testing

See [docs/TESTING.md](docs/TESTING.md) for the unit tests, the manual verification of every
non-functional requirement and the user-acceptance pass through UC-1, UC-2 and UC-3.
