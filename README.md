# Pharmacy Inventory Management System (PIMS)

Graduation project - King Hussein School of Computing Sciences, Princess Sumaya University
for Technology. Prepared by **Abdallah Hasan** and **Ahmad Sadiq**, supervised by
**Dr. Ahmad Altamimi**.

A web application that combines pharmacy inventory management, real-time patient/staff
chat, and machine-learning reorder alerts, built exactly to the GP1 software documentation.
GP2 adds dispensing, forecast charts, seasonal demand forecasting on Kaggle-based sales data,
preorders, image messages, online status, password reset, account deletion, dark mode and a full
Arabic (right-to-left) interface.

## Repository layout

```
/pharmacy-ims
  /client       -> React app (staff + patient portals)      - Vite, React Router
  /server       -> Node.js REST API + live chat server      - Express, mysql2, Socket.IO, node-cron
  /ml-service   -> Python forecasting microservice           - Flask, scikit-learn, pandas
  /shared       -> constants shared by client and server (thresholds, roles, statuses)
  /data         -> the demo pharmacy's sales history (demo-sales.json) and the script that builds it
```

The code is written to be read by students: plain functions with clear names, a comment at the
top of every file and on every step, and well-known libraries instead of hand-written plumbing.

### Server (`server/src`): three layers (NFR 5.1)

A request goes **route -> service -> database**: the route checks the input and calls a service,
the service does the work (logic and SQL together), and the route sends back the JSON.

```
server/src
  index.js        starts the HTTP server, the Socket.IO chat and the forecast job
  app.js          the Express app: middleware, every /api route, the error handler
  config.js       settings from server/.env        db.js   the MySQL pool + runInTransaction()
  constants.js    the shared constants (from shared/constants.json)
  routes/         one file per feature: auth, medications, sales, preorders, chat, forecast,
                  availability - URL -> check input -> call the service -> send JSON
  services/       one file per feature: the logic and its SQL (authService, medicationService,
                  salesService, preorderService, chatService, forecastService,
                  passwordResetService, emailService, demoSalesService, loginLockout)
  validation/     zod schemas for every form, with the English error messages
  middleware/     auth.js (login token check, role check), errorHandler.js
  socket/         chatSocket.js - live chat and online status with Socket.IO
  jobs/           forecastJob.js (hourly, at start-up, and 10 s after a sale), runForecastOnce.js
  utils/          fefo.js (sell the soonest-expiring lot first), stockFlags.js, dates.js, parseId.js
  db/             schema.sql, migrate.js, reset.js, seed.js, demoCatalog.js, demoSales.js
```

Libraries: Express 5, mysql2 (plain SQL), zod (validation), http-errors, jsonwebtoken + bcryptjs
(login), Socket.IO (chat), multer + file-type (image uploads), nodemailer (email),
express-rate-limit, node-cron.

### Client (`client/src`)

```
client/src
  App.jsx         which address shows which page
  pages/          one file per page (staff/, patient/, and the signed-out pages)
  components/     shared pieces: layout, dialogs, status badges, the chat window, charts,
                  the inventory table and stock lots
  api/            one file per feature; client.js is the axios setup (token, errors)
  hooks/          useChatSocket.js - the live chat connection (socket.io-client)
  context/        AuthContext (who is signed in), ThemeContext (light / dark / system)
  i18n/           en.json, ar.json, setup.js (i18next) and useI18n.js (texts, dates, prices)
  config/         pharmacy.js - the pharmacy's own details (see below)
  styles.css      every style, in labelled sections
```

Libraries: React 18, React Router, axios, i18next + react-i18next, socket.io-client, Recharts.

### ML service (`ml-service`)

`app.py` (the Flask web server), `forecaster.py` (the model, using pandas and scikit-learn),
`evaluate.py` (the before/after backtest) and `test_forecaster.py` (unit tests).

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
| `DEMO_SALES_TOPUP` | `true` | before each forecast run, fill days missing from the demo sales history up to yesterday - see "Demo sales data" |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | empty, `587` | outgoing email for password reset links; leave `SMTP_HOST` empty and no email is sent - see "Password reset" |
| `SMTP_SECURE` | `true` on port 465 | TLS from the first byte (465); otherwise STARTTLS is used (587) |
| `SMTP_REQUIRE_TLS` | `true` | `false` only for a local mail catcher such as Mailpit; never sends a password without TLS otherwise |
| `AUTH_RESET_DEBUG` | `false` | `true` also prints password reset links to the server console (development only; ignored when `NODE_ENV=production`) |
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
dated stock lots, and daily sales history from 1 January 2022 up to yesterday (see "Demo sales
data" below). Stock levels and reorder thresholds are sized from each medication's recent demand,
so the same demo situations appear whenever you seed.

Two kinds of change reach an existing database differently:

- **New tables** are added by `npm run db:migrate`. **Changed tables** (a new column) need one
  `npm run db:reset` - see below.
- **Demo data changes** also need one `npm run db:reset`, which deletes everything in the database and
  seeds it again. `db:seed` only adds medications to an empty catalog, so it cannot replace an
  old one. The seasonal forecasting change is one of these: it replaced the demo catalog
  (Omeprazole and Salbutamol made way for Cough Syrup, Vitamin C and Multivitamin, the medicines
  the sales data covers) and its stock. See "Updating an existing checkout" below.

`schema.sql` only issues `CREATE TABLE IF NOT EXISTS`: running `db:migrate` again adds new
tables but never changes a table that already exists. **The simplified code added a column
(`users.password_changed_at`), so a database made before it needs one `npm run db:reset`.**
To start from a clean slate at any time (seed data goes stale after a few weeks):

```bash
npm run db:reset      # drops the database, then migrates and seeds it again
```

| Account | Email | Password | Role |
|---|---|---|---|
| Pharmacy Staff | `staff@pharmacy.com` | `Staff123!` | staff |
| Demo Patient | `patient@example.com` | `Patient123!` | patient |

Patients can also self-register from the login page. Staff accounts are created by the
administrator (see `server/src/db/seed.js`).

### Updating an existing checkout

After pulling new commits:

1. `npm install` at the root, and `venv\Scripts\pip install -r requirements.txt` in `ml-service`,
   in case dependencies changed.
2. `npm run db:migrate` (safe to run every time; adds any new tables).
3. If the commit changed the demo data or an existing table - the seasonal forecasting commit and
   the simplified code both did - run `npm run db:reset` once. It deletes everything in the
   database (accounts, stock, sales, chats, preorders, alerts) and seeds it again.
4. Restart the **ML service**: it loads `forecaster.py` once at start-up, so a running one keeps
   the old model code. The API server restarts itself on file changes (`node --watch`), the
   client reloads itself.

### Coming from the old code layout (GP2 simplification)

In November 2026 the whole codebase was rewritten to be simpler to read, **without changing what
it does**: every API endpoint keeps the same URL, request, response, status codes and error codes
(checked by replaying 102 requests against the old and new server), and the pages keep the same
markup, CSS classes and look (only the charts look slightly different, now drawn by Recharts).

After pulling it, a checkout needs: `npm install` (new packages), `venv\Scripts\pip install -r
requirements.txt` in `ml-service` (pandas), **one `npm run db:reset`** (the `users` table gained
`password_changed_at`), and a restart of everything.

Where things moved:

| Old | New |
|---|---|
| `server/src/routes/*Routes.js` + `controllers/*Controller.js` | `server/src/routes/<feature>.js` (one file: URL, input check, service call, reply) |
| `server/src/models/*Model.js` (SQL) | inside `server/src/services/<feature>Service.js` (logic and SQL together) |
| `server/src/validation/*Validation.js` (hand-written) | `server/src/validation/*Schemas.js` (zod), same English messages |
| `config/env.js`, `config/db.js` | `config.js`, `db.js` (with `runInTransaction()`) |
| `middleware/authenticate.js`, `requireRole.js`, `services/tokenService.js` | `middleware/auth.js` |
| `utils/httpError.js`, `utils/asyncHandler.js` | `http-errors` library; Express 5 catches async errors itself |
| `ws/chatHub.js`, `ws/presence.js`, client `hooks/useChatSocket.js` (raw WebSocket) | `socket/chatSocket.js` and the new `hooks/useChatSocket.js` (Socket.IO, rooms, built-in reconnect and heartbeat) |
| `utils/smtp.js`, `services/mailService.js` | `services/emailService.js` (nodemailer) |
| `services/rateLimitService.js` | `express-rate-limit` in `routes/auth.js` |
| `services/loginAttemptService.js` | `services/loginLockout.js` |
| `utils/imageSniff.js`, `utils/uploadStore.js`, `utils/contentDisposition.js` | `file-type` + `content-disposition` libraries, image storage inside `services/chatService.js` |
| `services/batchService.js`, `availabilityService.js` | inside `services/medicationService.js` |
| `db/upgrades.js` (in-place upgrades) | removed: one clean `schema.sql`, rebuild with `db:reset` |
| CommonJS (`require`) on the server | ES modules (`import`), the same style as the client |
| client `i18n/I18nContext.jsx`, `translate.js`, `context.js` | `i18n/setup.js` (i18next) and `i18n/useI18n.js` (same `t`, `te`, `formatDate`... as before). Plurals in `en.json`/`ar.json` are now keys ending in `_one`, `_other`... A sentence with a styled number uses `<StyledText>` |
| client `api/client.js` (fetch) | `api/client.js` (axios), same `request()` and `ApiError` |
| hand-drawn SVG charts | Recharts (`components/forecast/`) |
| manual loops in `forecaster.py`, `data/prepare_demo_sales.py` | pandas (same results) |

Also new in the same change: reorder alerts are recalculated 10 seconds after a sale or a
collected preorder (`jobs/forecastJob.js`, `requestForecastSoon`); a password reset signs out every
older session (`users.password_changed_at` compared with the token's `iat` in `middleware/auth.js`);
Arabic image file names are now stored correctly; and a chat message refused by the server now
shows an error instead of failing silently.

## Running

Open two terminals - the second command starts both the API and the client.

**ML service** (port 5001):

```bash
cd ml-service
venv\Scripts\python app.py
```

**API + chat server** (port 4000) and **React client** (port 5173), from the repo root:

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
| `npm test` | Runs the server unit tests (61): form validation, login lockout, login tokens (including sign-out after a password reset), roles, stock flags, FEFO, preorders, image checks, reset emails, account deletion, demo sales, the forecast after a sale, and the English/Arabic dictionaries |
| `venv\Scripts\python -m unittest` (in `ml-service`) | Runs the forecaster's unit tests (8) |
| `venv\Scripts\python evaluate.py` (in `ml-service`) | Backtests the forecast before and after the seasonal wave - see "Demo sales data" |
| `npm run db:reset` | Drops, migrates and re-seeds the database: a clean slate, needed when the demo data or an existing table changes |
| `npm run forecast -w server` | Runs the ML forecast / reorder-alert check once and prints the result |
| `npm run build -w client` | Production build of the React app into `client/dist` |

## Features and requirement traceability

| Requirement | Where it is implemented |
|---|---|
| FR 1 - authenticate before any access | `requireLogin` in `server/src/middleware/auth.js`, `client/src/components/ProtectedRoute.jsx` |
| FR 2 / 2.1 / 2.2 - role-based access | `requireRole` in `server/src/middleware/auth.js`, role-specific routes and navigation in `client/src/App.jsx` |
| FR 3 / 3.1 / 3.2 - manage medication catalog | `server/src/routes/medications.js` -> `services/medicationService.js`; `client/src/pages/staff/StaffInventoryPage.jsx` |
| FR 4 - stock levels with low-stock / near-expiry flags | `server/src/utils/stockFlags.js` (per-medication threshold, 30 days) |
| UC-1 - update stock quantity | receiving or correcting a stock lot: `medicationService.addBatch` / `updateBatch`, `client/src/components/inventory/BatchPanel.jsx` |
| Dispensing (GP2 addition) - record a sale, deplete stock FEFO, feed the forecast | `server/src/services/salesService.js`, `server/src/utils/fefo.js`, `client/src/pages/staff/StaffSellPage.jsx` |
| Forecast charts (GP2 addition) - per-medication demand history and prediction | `forecastService.getMedicationForecast`, `client/src/pages/staff/StaffForecastPage.jsx`, `client/src/components/forecast/` |
| Seasonal forecasting (GP2 addition) - months and seasons in the model, Kaggle-based demo sales | `ml-service/forecaster.py` (yearly wave), `ml-service/evaluate.py`, `data/` (dataset + preparation script), `server/src/db/demoCatalog.js`, `demoSales.js`, `services/demoSalesService.js`, `client/src/components/forecast/MonthlyChart.jsx` |
| FR 5 / 5.1 / 5.2 - real-time chat, persisted, unified inbox | `server/src/socket/chatSocket.js`, `services/chatService.js`; `PatientChatPage.jsx`, `StaffChatInboxPage.jsx` |
| FR 6 / 6.1 / 6.2 - ML forecast + 7-day reorder alerts | `ml-service/forecaster.py`, `server/src/services/forecastService.js`, `server/src/jobs/forecastJob.js`, `ReorderAlertPanel.jsx` |
| FR 7 - availability without exact quantities | `medicationService.getAvailability`, `PatientAvailabilityPage.jsx` |
| NFR 2.1 - secure storage | bcrypt password hashes, parameterized SQL everywhere, JWT-protected API and chat connection |
| NFR 2.3 - lock after 5 failed logins | `server/src/services/loginLockout.js` (15-minute lock) |
| NFR 3.2 - desktop and mobile | responsive CSS in `client/src/styles.css` |
| NFR 5.1 - modular code | layering described above |
| Live clock (GP2 addition) | `client/src/components/Clock.jsx` |
| Dark mode (GP2 addition) | `client/src/context/ThemeContext.jsx`, `ThemeToggle.jsx`, dark token set in `styles.css`, pre-paint script in `client/index.html` |
| Arabic / RTL (GP2 addition) | `client/src/i18n/`, `LanguageToggle.jsx`, logical CSS properties, error `code`s sent by `server/src/middleware/errorHandler.js` |
| Preorders (GP2 addition) | `server/src/services/preorderService.js` (ready = record the delivered lot into stock; collect = FEFO dispense; each in one transaction), `PatientAvailabilityPage.jsx`, `StaffPreordersPage.jsx` |
| Patient phone numbers (GP2 addition) | `normalisePhone` in `server/src/validation/authSchemas.js`, `RegisterPage.jsx`, `PatientAccountPage.jsx`, `PhoneLink.jsx` (staff inbox and preorder queue) |
| Forgot password (GP2 addition) | `server/src/services/passwordResetService.js`, `services/emailService.js` (nodemailer), `ForgotPasswordPage.jsx`, `ResetPasswordPage.jsx` |
| Online status (GP2 addition) | `server/src/socket/chatSocket.js` (Socket.IO rooms); `ChatWindow.jsx` (`PresenceMark`) |
| Image messages (GP2 addition) | `chatService.sendImageMessage` (file-type checks the bytes), `routes/chat.js` (multer); `ChatWindow.jsx`, `ChatImage.jsx` |
| Delete account (GP2 addition) | `authService.deleteOwnAccount`, `middleware/auth.js` (user must still exist), `PatientAccountPage.jsx` |
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
1. The backend job (`server/src/jobs/forecastJob.js`) runs hourly (`FORECAST_CRON`), 5 s after
   start-up, and 10 s after a sale or a collected preorder (several sales close together cause one
   run), so reorder alerts react to real sales within seconds. It sends each
   medication's `sales_history` rows to the ML service `POST /train`.
2. The service aggregates sales per day and fits a scikit-learn `LinearRegression` per
   medication on a time index plus day-of-week indicators. Once a medication has a year of
   history, a yearly seasonal wave is added too (three sine/cosine pairs of the date's position
   in the year), so the model learns how demand moves through the months and seasons. With less
   than a year a season cannot be told apart from the trend, so it is left out. Medications with
   fewer than 14 days of history are skipped (no model, no alert - UC-3 alternative flow).
   Models are persisted under `ml-service/models/`.
3. The backend calls `POST /predict` with each medication's current quantity and the safe
   threshold. The service forecasts the next 7 days of demand and reports the first day the
   stock is predicted to fall below the threshold.
4. Predicted breaches are written to `reorder_alerts` (created, or refreshed if already
   active). Medications that are fine again have their active alert removed. Alerts staff
   dismissed are not re-raised while the prediction is unchanged.
5. The staff dashboard shows active alerts with the medication name and days until the
   threshold; staff can dismiss them.

The **Forecast** page retrains the selected medication on request. It shows the last 30 days and
the 7-day forecast, which model was used, and, for seasonal models, a monthly chart of the last two
years with the predicted demand for the next three months.

### Demo sales data

The demo pharmacy's sales come from the Kaggle
[Global Pharmacy Sales Dataset (2020-2025)](https://www.kaggle.com/datasets/annemark/global-pharmacy-sales-dataset-20202025),
a synthetic daily dataset of units sold per medicine, region, country and age group.

**What the app uses:** only `data/demo-sales.json` (committed): daily units sold for each of the
ten demo medicines, by calendar date. The seed reads it into `sales_history`, and the forecast
trains on `sales_history`. The app never runs the Python script below and never reads the Kaggle
CSV; those are only needed to rebuild the JSON, for example to change a medicine's pattern.

`data/prepare_demo_sales.py` is how the JSON was made, kept so the preparation can be checked and
reproduced (it uses a fixed random seed, so the same CSV gives the same JSON). It prints each
step:

1. Drop exact duplicate rows (2,630).
2. Drop 2020-2021. The dataset flags them as COVID years and their demand runs about 60% above
   normal.
3. Cap outliers above Q3 + 3 x IQR per medicine (1,506 rows).
4. Sum each medicine's rows per day and keep only its day-to-day variation. In the source every
   medicine follows the same seasonal curve, peaking in March in both hemispheres, so that curve
   is removed.
5. Rebuild each medicine's demand for one community pharmacy in Amman: its own volume, yearly
   growth and seasons (antibiotics and cough syrup peak in winter, Cetirizine in the spring
   pollen season, Metformin and Amlodipine barely move), and the Jordanian week (Friday is
   quietest). Each day's units are drawn around that expectation (Poisson, fixed seed).
6. Carry the series on to the end of 2029. Later years reuse the 2022-2025 day-to-day variation
   while volume, growth and seasons continue, so the demo always has history up to yesterday.

The file is read by calendar date. The seed writes 2022 to yesterday, and before each forecast run
the server fills any days missing since the last seed (`services/demoSalesService.js`), so a demo
weeks later needs no re-seed. Days that already have sales, including real ones, are never
touched. Set `DEMO_SALES_TOPUP=false` for a real pharmacy.

The raw CSV is not committed: its licence is listed as "Unknown". To rebuild the JSON, download it
into `data/raw/` and run
`ml-service/venv/Scripts/python -I data/prepare_demo_sales.py data/raw/global_pharmacy_sales_2020_2025_daily_dataset.csv`
(pandas is installed with the ML service).

`ml-service/evaluate.py` replays 2025 week by week. At each week it trains on the sales before it,
first the previous way (trend and weekday on the last 90 days), then with the seasonal wave on
all history, and compares both with what was actually sold:

| Horizon | Error in total units, before | After |
|---|---|---|
| next 7 days (the reorder alert) | 17.6% | 14.8% |
| next 28 days | 15.0% | 7.6% |

The biggest gains are the most seasonal medicines: Cough Syrup's 28-day error drops from 27.2% to
9.0%, Cetirizine's from 18.1% to 7.8%. The daily error improves less (2.14 to 2.01 units/day),
because a single day's sales at a small pharmacy are largely random. The total over several days
is what a reorder decision depends on.

## API summary

All endpoints are under `/api` and, except register, login, forgot-password and reset-password,
require `Authorization: Bearer <jwt>` for a user that still exists. Errors are
`{ error, code?, params?, details? }`: `error` is English, `code` is one of `ERROR_CODES`.

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/auth/register` | public | create a patient account `{ name, email, phone, password }` (phone required) |
| POST | `/auth/login` | public | sign in (locks after 5 failures) |
| GET | `/auth/me` | any | current user |
| DELETE | `/auth/me` | patient | delete your own account `{ password }`; staff get 403 |
| PUT | `/auth/me/phone` | any | add or change your phone number `{ phone }` |
| POST | `/auth/forgot-password` | public | `{ email, lang? }`; emails the link in `en` or `ar`; always the same 200 answer (rate limited) |
| POST | `/auth/reset-password` | public | `{ token, password }` (rate limited) |
| GET/POST | `/medications` | staff | list / add medication (adding also creates its opening stock lot) |
| GET/PUT/DELETE | `/medications/:id` | staff | read / update catalog fields / delete |
| GET/POST | `/medications/:id/batches` | staff | list stock lots / receive a new lot (UC-1) |
| PATCH/DELETE | `/medications/batches/:batchId` | staff | correct or remove a stock lot (UC-1) |
| GET/POST | `/sales` | staff | recent sales / record a multi-item sale `{ items: [{ medication_id, quantity }] }`, depleting stock FEFO in one transaction |
| GET | `/sales/preview` | staff | which lots one basket line would draw from, before committing |
| GET | `/forecast/:medicationId` | staff | sales history + 7-day forecast for one medication (retrains on request; powers the forecast charts). Also returns `seasonal` (whether the yearly wave was used) and, for seasonal models, an `outlook` of daily predicted demand to the end of the third month ahead, for the monthly chart |
| GET | `/alerts` | staff | active reorder alerts |
| PATCH | `/alerts/:id/dismiss` | staff | dismiss an alert |
| POST | `/chat/sessions` | patient | open (or create) the patient's chat session |
| GET | `/chat/sessions` | staff | unified inbox |
| GET | `/chat/sessions/:id/messages` | participant | message history |
| POST | `/chat/sessions/:id/messages` | participant | send (HTTP fallback; also pushed live over Socket.IO) |
| POST | `/chat/sessions/:id/attachments` | participant | multipart: `image` (PNG/JPEG/WebP/GIF, max 5 MB) + optional `caption` |
| GET | `/chat/attachments/:key` | participant | the image, after re-checking access |
| POST | `/preorders` | patient | request an out-of-stock medication `{ medication_id, quantity, note? }`; needs a phone number on the account |
| GET | `/preorders/mine` | patient | your own requests |
| POST | `/preorders/:id/cancel` | patient | cancel your own pending request |
| GET | `/preorders` | staff | all requests, newest first, `?status=` optional |
| PATCH | `/preorders/:id` | staff | `{ status, delivery? }`: pending -> ready / cancelled, ready -> collected / cancelled. With "ready", `delivery: { quantity, expiry_date, batch_number? }` adds that lot to stock (at least the requested quantity, expiring after today) |
| GET | `/availability` | any | in-stock / out-of-stock list |
| Socket.IO | `/socket.io` (login token in `auth.token`) | any | live chat: events `ready`, `message`, `presence`; send with `message` `{ sessionId, content }` and an acknowledgement callback |

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
minutes, and a newer link retires older ones. Both endpoints are rate limited in memory per IP
(and per email for forgot-password); behind a reverse proxy, set Express's `trust proxy` so the
limiter sees client addresses.

The link is emailed, in the language the patient was using, with nodemailer
(`server/src/services/emailService.js`). Resetting the password also records the time
(`users.password_changed_at`), and every login token issued before it is refused from then on -
so a reset signs out every other session, including a stolen token. **Email is only sent once
SMTP is set up in `server/.env`**; until then the server logs "SMTP is not configured" once and
nobody receives a link. With Gmail:

1. Turn on 2-step verification for the Google account, then create an App Password
   (Google Account > Security > App passwords).
2. In `server/.env` set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER=` the address,
   `SMTP_PASS=` the 16-character app password, and `MAIL_FROM=Pharmacy IMS <the address>`.
3. Restart the API (`npm run dev`).

Any other SMTP provider works the same way (port 465 or 587). For local testing without a real
account, run a mail catcher such as Mailpit and set `SMTP_HOST=localhost`, `SMTP_PORT=1025`,
`SMTP_REQUIRE_TLS=false`, or set `AUTH_RESET_DEBUG=true` to print links to the console.

**Phone numbers.** Every patient who registers gives one (8 to 15 digits; spaces, dashes and
brackets are ignored, `00` becomes `+`). Patients from before phone numbers were required see a
banner asking for one and cannot request a preorder until they add it on their account page.
Staff see the number, as a tap-to-call link, in the chat inbox and on the preorder queue;
patients never see each other's.

**Preorders and stock.** "Mark ready" records the delivery that came in for the request: staff
enter the lot (quantity, expiry, lot number) and it is added to stock in the same transaction,
so Inventory shows it straight away. If the stock was received through Add stock instead, staff
choose "already in stock" so it is not counted twice. Nothing is reserved: until the patient
collects, Dispense can sell those units like any others, and collecting then answers 409.

**Online status.** Presence comes from Socket.IO's rooms (`server/src/socket/chatSocket.js`):
nothing is written to the database, it resets when the server restarts, and there is therefore no
"last seen". Staff see which patients are online; a patient only learns whether anyone at the
pharmacy is online. A closed laptop goes offline within about a minute through Socket.IO's
built-in heartbeat.

**Image messages.** Uploads are checked by their bytes with the file-type library (SVG is always refused), written to
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
