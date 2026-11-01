# Pharmacy Inventory Management System (PIMS)

Graduation project - King Hussein School of Computing Sciences, Princess Sumaya University
for Technology. Prepared by **Abdallah Hasan** and **Ahmad Sadiq**, supervised by
**Dr. Ahmad Altamimi**.

A web application for a community pharmacy that combines inventory management, real-time chat
between patients and staff, and machine-learning reorder alerts, built to the GP1 software
documentation. GP2 adds dispensing, preorders, seasonal demand forecasting on Kaggle-based sales
data, forecast charts, image messages, online status, password reset by email, account deletion,
dark mode and a full Arabic (right-to-left) interface.

## Contents

- [Repository layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Setup (first time on a machine)](#setup-first-time-on-a-machine)
- [Running the system](#running-the-system)
- [Updating after a pull](#updating-after-a-pull)
- [Features and requirement traceability](#features-and-requirement-traceability)
- [How the forecasting works](#how-the-forecasting-works)
- [API summary](#api-summary)
- [Notes on the GP2 features](#notes-on-the-gp2-features)
- [Testing](#testing)

## Repository layout

```
/pharmacy-ims
  /client       React app (staff and patient portals)    Vite, React Router, axios, i18next, Recharts
  /server       Node.js REST API + live chat server      Express 5, mysql2, Socket.IO, zod, node-cron
  /ml-service   Python forecasting service               Flask, scikit-learn, pandas
  /shared       constants used by both client and server (limits, roles, statuses, error codes)
  /data         the demo pharmacy's sales history (demo-sales.json) and the script that built it
  /docs         testing and verification report
```

### Server (`server/src`)

A request goes **route -> service -> database** (NFR 5.1): the route checks the input and calls a
service, the service does the work (logic and SQL together), and the route sends back JSON.

```
server/src
  index.js        starts the HTTP server, the Socket.IO chat and the forecast job
  app.js          the Express app: middleware, every /api route, the error handler
  config.js       settings read from server/.env
  db.js           the MySQL connection pool and runInTransaction()
  constants.js    the shared constants (from shared/constants.json)
  routes/         one file per feature: auth, medications, sales, preorders, chat, forecast, availability
  services/       one file per feature: the logic and its SQL
  validation/     zod schemas for every form, with their error messages
  middleware/     auth.js (login token and role checks), errorHandler.js
  socket/         chatSocket.js - live chat and online status
  jobs/           forecastJob.js (the background forecast), runForecastOnce.js
  utils/          fefo.js (sell the soonest-expiring lot first), stockFlags.js, dates.js, parseId.js
  db/             schema.sql, migrate.js, reset.js, seed.js, demoCatalog.js, demoSales.js
```

### Client (`client/src`)

```
client/src
  App.jsx         which address shows which page
  pages/          one file per page (staff/, patient/, and the signed-out pages)
  components/     shared pieces: layout, dialogs, status badges, chat window, charts,
                  inventory table, stock lots
  api/            one file per feature; client.js sets up axios (login token, errors)
  hooks/          useChatSocket.js - the live chat connection
  context/        AuthContext (who is signed in), ThemeContext (light / dark / system)
  i18n/           en.json, ar.json, setup.js and useI18n.js (texts, dates, prices)
  config/         pharmacy.js - the pharmacy's own details (see the notes below)
  styles.css      all styles, in labelled sections
```

### ML service (`ml-service`)

`app.py` (the Flask web server), `forecaster.py` (the model), `evaluate.py` (the before/after
accuracy backtest) and `test_forecaster.py` (unit tests).

## Prerequisites

- **Node.js 22** or newer.
- **Python 3.12** - not 3.13 or 3.14. The pinned `numpy`, `pandas` and `scikit-learn` versions
  have no prebuilt packages for newer Pythons, so the install fails. On Windows:
  `winget install Python.Python.3.12`.
- **MySQL 8.x** running locally. The default settings expect user `root` with an empty password
  on `127.0.0.1:3306`; change `server/.env` if yours differs. On Windows MySQL runs as the
  **MySQL80** service: open `services.msc`, right-click MySQL80 and choose **Start** (set its
  Startup type to Automatic to skip this every time).
- Optional: **WebStorm** (API and client) and **PyCharm** (ML service). Every step below also
  works from a terminal.

Nothing machine-specific is in the repository: `node_modules/`, `ml-service/venv/`, the trained
models, `server/.env` and the database are all created by the setup steps.

## Setup (first time on a machine)

### 1. Install the Node.js packages

From the repository root:

```bash
npm install
```

(In WebStorm: open the repository root, then open `package.json` and click **Run 'npm install'**
when it is offered.)

### 2. Create the Python environment

```bash
cd ml-service
py -3.12 -m venv venv
venv\Scripts\pip install -r requirements.txt
```

On macOS / Linux: `python3.12 -m venv venv` then `venv/bin/pip install -r requirements.txt`.
`venv\Scripts\python --version` must report 3.12.x.

(In PyCharm: open the `ml-service` folder, then **Settings -> Project: ml-service -> Python
Interpreter -> Add Interpreter -> Add Local Interpreter -> Virtualenv -> New**, base interpreter
Python 3.12, location `ml-service\venv`. Then open `requirements.txt` and click **Install
requirements**.)

### 3. Create `server/.env`

Copy `server/.env.example` to `server/.env` and set at least `DB_PASSWORD` (if your MySQL root
user has one) and a long random `JWT_SECRET`. The file is never committed, so every machine needs
its own.

| Setting | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | port of the API and chat server |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | `127.0.0.1`, `3306`, `root`, empty, `pharmacy_ims` | MySQL connection |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | - , `8h` | signing key and lifetime of login tokens |
| `CLIENT_ORIGIN` | `http://localhost:5173` | address of the React app (CORS and password reset links) |
| `ML_SERVICE_URL` | `http://127.0.0.1:5001` | address of the forecasting service |
| `FORECAST_CRON` | `0 * * * *` | when the background forecast runs (every hour) |
| `DEMO_SALES_TOPUP` | `true` | fill missing demo sales days before each forecast run (see "Demo sales data"); `false` for a real pharmacy |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | empty, `587` | outgoing email for password reset links (see "Password reset emails") |
| `SMTP_SECURE` | `true` on port 465 | TLS from the first byte (465); otherwise STARTTLS (587) |
| `SMTP_REQUIRE_TLS` | `true` | set `false` only for a local test mail catcher |
| `AUTH_RESET_DEBUG` | `false` | `true` also prints password reset links in the server output (development only) |
| `UPLOADS_DIR` | `server/uploads` | where chat images are stored |
| `NODE_ENV` | `development` | `production` in production |

### 4. Create the database and the demo data

```bash
npm run db:migrate
npm run db:seed
```

(In WebStorm: **View -> Tool Windows -> npm**, then double-click `db:migrate`, then `db:seed`.)

`db:migrate` creates the `pharmacy_ims` database with nine tables: `users`, `medications`,
`medication_batches`, `chat_sessions`, `chat_messages`, `sales_history`, `reorder_alerts`,
`preorders`, `password_resets`. `db:seed` adds the demo accounts, the demo medications with their
stock lots, and daily sales history from 1 January 2022 up to yesterday. Stock levels and reorder
thresholds are worked out from each medication's recent demand, so the demo shows the same
situations whenever it is seeded (a few reorder alerts, an expired lot, a lot close to expiry,
and one medication with too little history to forecast).

| Account | Email | Password | Role |
|---|---|---|---|
| Pharmacy Staff | `staff@pharmacy.com` | `Staff123!` | staff |
| Demo Patient | `patient@example.com` | `Patient123!` | patient |

Patients can also register themselves from the login page. Staff accounts are created by the
administrator (see `server/src/db/seed.js`).

## Running the system

Start the three parts in this order: **MySQL**, then the **ML service**, then the **API and
client**. The website works without the ML service, but the forecast features need it.

**ML service** (port 5001):

- PyCharm: open `ml-service/app.py`, click the green run arrow next to
  `if __name__ == "__main__":` and choose **Run 'app'**.
- Terminal: `cd ml-service` then `venv\Scripts\python app.py`.

It is ready when it shows `Running on http://127.0.0.1:5001`.

**API and client** (ports 4000 and 5173), from the repository root:

- WebStorm: in the **npm** tool window, double-click `dev`.
- Terminal: `npm run dev` (or separately `npm run dev -w server` and `npm run dev -w client`).

Then open <http://localhost:5173>. To stop, press the red Stop button in each IDE (or Ctrl+C in
each terminal).

The staff portal has six pages: **Inventory** (stock, warning flags, reorder alerts), **Add
stock** (receive a lot, or add a new medication), **Dispense** (sell a multi-item basket),
**Preorders** (patient requests for out-of-stock medication), **Forecast** (demand charts per
medication) and **Chat inbox**. The patient portal has **Medication availability** (with preorder
requests), **Chat with pharmacy**, **About**, **Contact** and, behind the patient's name in the
top bar, **Your account**. Contact and the 404 page also work signed out. Every page has a live
clock, a language switch (English / العربية) and a theme switch (system / light / dark).

### Useful scripts

Run these from WebStorm's **npm** tool window or with `npm run <name>` at the repository root.

| Script | What it does |
|---|---|
| `dev` | starts the API (4000) and the client (5173) |
| `db:seed` | refreshes the demo sales history up to yesterday; keeps accounts and today's real sales. Run it before a demo or screenshots |
| `forecast` | runs the reorder-alert forecast once and prints the result |
| `test` | runs the server unit tests (61) |
| `db:migrate` | creates the database and any missing tables |
| `db:reset` | **deletes the whole database**, then migrates and seeds it again |

In `ml-service` (PyCharm: right-click the file and run it, or use the terminal):

| Command | What it does |
|---|---|
| `venv\Scripts\python -m unittest` | the forecaster's unit tests (8) |
| `venv\Scripts\python evaluate.py` | the before/after accuracy backtest (see "Demo sales data") |

## Updating after a pull

1. Run `npm install` at the root, and `venv\Scripts\pip install -r requirements.txt` in
   `ml-service`, in case new packages were added.
2. Run `npm run db:migrate`. It is safe to run every time and adds any new tables.
3. If the pulled changes altered an existing table or the demo data, run `npm run db:reset` once.
   **It deletes everything in your local database** (accounts, stock, sales, chats, preorders,
   alerts) and seeds it again. `db:migrate` alone cannot change a table that already exists.
4. Restart the ML service and `dev`. The ML service only loads code changes when it starts.

## Features and requirement traceability

| Requirement | Where it is implemented |
|---|---|
| FR 1 - authenticate before any access | `requireLogin` in `server/src/middleware/auth.js`, `client/src/components/ProtectedRoute.jsx` |
| FR 2 / 2.1 / 2.2 - role-based access | `requireRole` in `server/src/middleware/auth.js`, role-specific routes and navigation in `client/src/App.jsx` |
| FR 3 / 3.1 / 3.2 - manage the medication catalog | `server/src/routes/medications.js`, `services/medicationService.js`, `client/src/pages/staff/StaffInventoryPage.jsx` |
| FR 4 - stock levels with low-stock and near-expiry flags | `server/src/utils/stockFlags.js` (per-medication threshold, 30 days) |
| UC-1 - update stock | stock lots: `medicationService.addBatch` / `updateBatch`, `client/src/components/inventory/BatchPanel.jsx` |
| FR 5 / 5.1 / 5.2 - real-time chat, saved messages, unified inbox | `server/src/socket/chatSocket.js`, `services/chatService.js`, `PatientChatPage.jsx`, `StaffChatInboxPage.jsx` |
| FR 6 / 6.1 / 6.2 - ML forecast and 7-day reorder alerts | `ml-service/forecaster.py`, `server/src/services/forecastService.js`, `server/src/jobs/forecastJob.js`, `ReorderAlertPanel.jsx` |
| FR 7 - availability without exact quantities | `medicationService.getAvailability`, `PatientAvailabilityPage.jsx` |
| NFR 2.1 - secure storage | bcrypt password hashes, parameterised SQL everywhere, login tokens required on the API and the chat connection |
| NFR 2.3 - lock after 5 failed logins | `server/src/services/loginLockout.js` (15-minute lock) |
| NFR 3.2 - desktop and mobile | responsive CSS in `client/src/styles.css` |
| NFR 5.1 - modular code | the routes / services / validation layout described above |
| Dispensing (GP2) - sell a basket, take stock FEFO, feed the forecast | `server/src/services/salesService.js`, `server/src/utils/fefo.js`, `StaffSellPage.jsx` |
| Forecast charts (GP2) | `forecastService.getMedicationForecast`, `StaffForecastPage.jsx`, `client/src/components/forecast/` |
| Seasonal forecasting (GP2) - months and seasons, Kaggle-based demo sales | `ml-service/forecaster.py`, `ml-service/evaluate.py`, `data/`, `server/src/db/demoCatalog.js`, `demoSales.js`, `services/demoSalesService.js`, `MonthlyChart.jsx` |
| Preorders (GP2) | `server/src/services/preorderService.js`, `PatientAvailabilityPage.jsx`, `StaffPreordersPage.jsx` |
| Arabic / RTL (GP2) | `client/src/i18n/`, `LanguageToggle.jsx`, logical CSS properties, error codes from `server/src/middleware/errorHandler.js` |
| Dark mode (GP2) | `client/src/context/ThemeContext.jsx`, `ThemeToggle.jsx`, the dark colours in `styles.css`, the pre-paint script in `client/index.html` |
| Live clock (GP2) | `client/src/components/Clock.jsx` |
| Patient phone numbers (GP2) | `server/src/validation/authSchemas.js`, `RegisterPage.jsx`, `PatientAccountPage.jsx`, `PhoneLink.jsx` |
| Forgot / reset password (GP2) | `server/src/services/passwordResetService.js`, `services/emailService.js`, `ForgotPasswordPage.jsx`, `ResetPasswordPage.jsx` |
| Online status (GP2) | `server/src/socket/chatSocket.js`, `ChatWindow.jsx` (`PresenceMark`) |
| Image messages (GP2) | `server/src/routes/chat.js`, `chatService.sendImageMessage`, `ChatWindow.jsx`, `ChatImage.jsx` |
| Delete account (GP2) | `authService.deleteOwnAccount`, `PatientAccountPage.jsx` |
| 404, About, Contact (GP2) | `NotFoundPage.jsx`, `PatientAboutPage.jsx`, `ContactPage.jsx`, `client/src/config/pharmacy.js` |

Limits and thresholds live in `shared/constants.json`:

| Constant | Value | Used for |
|---|---|---|
| `LOW_STOCK_THRESHOLD` | 10 | default reorder threshold for a new medication (each medication stores its own) |
| `NEAR_EXPIRY_DAYS` | 30 | near-expiry flag (FR 4) |
| `FORECAST_HORIZON_DAYS` | 7 | reorder alert window (FR 6.2) |
| `MAX_LOGIN_ATTEMPTS` / `LOCKOUT_MINUTES` | 5 / 15 | login lockout (NFR 2.3) |
| `PASSWORD_MIN_LENGTH` | 8 | registration and password reset |
| `PASSWORD_RESET_MINUTES` | 15 | how long a reset link works |
| `PREORDER_MAX_QUANTITY` / `PREORDER_NOTE_MAX_LENGTH` | 100 / 500 | preorder limits |
| `CHAT_MESSAGE_MAX_LENGTH` | 2000 | message and image caption length |
| `CHAT_IMAGE_MAX_BYTES` / `CHAT_IMAGE_TYPES` | 5 MB / PNG, JPEG, WebP, GIF | image messages |
| `ERROR_CODES` | - | fixed codes sent with every user-visible error, shown in English or Arabic by the client |

## How the forecasting works

1. Every sale at the Dispense page (and every collected preorder) writes a row into
   `sales_history`, so the model learns from real demand as the pharmacy is used, on top of the
   seeded history.
2. The background job (`server/src/jobs/forecastJob.js`) runs every hour, 5 seconds after the
   server starts, and 10 seconds after a sale or a collected preorder (several sales close
   together cause one run). It sends each medication's sales history to the ML service
   (`POST /train`).
3. The ML service adds up the sales per day and fits a scikit-learn `LinearRegression` for each
   medication on three kinds of features: a day counter (the trend), the day of the week, and,
   once a medication has a year of history, its position in the year (three sine/cosine pairs),
   so it learns how demand moves through the months and seasons. With less than a year a season
   cannot be told apart from the trend, so that part is left out. Medications with fewer than
   14 days of history get no model and no alert (UC-3 alternative flow).
4. The server then calls `POST /predict` with each medication's current stock and reorder
   threshold. The model predicts the next 7 days of demand, takes it off the stock day by day, and
   reports the first day the stock is expected to fall below the threshold.
5. These predictions become rows in `reorder_alerts`: new alerts are created, existing ones
   refreshed, and alerts for medications that are fine again are removed. An alert staff
   dismissed is not raised again while the prediction stays the same.
6. The Inventory page shows the active alerts with the days left and a **Receive stock** button.

The **Forecast** page retrains the chosen medication on request and shows its last 30 days of
sales with the next 7 predicted days, the projected stock against the reorder threshold, which
model was used, and, for seasonal models, monthly sales for the last two years with the next
three months predicted.

### Demo sales data

The demo pharmacy's sales are based on the Kaggle
[Global Pharmacy Sales Dataset (2020-2025)](https://www.kaggle.com/datasets/annemark/global-pharmacy-sales-dataset-20202025),
a synthetic daily dataset of units sold per medicine, region, country and age group.

**The app only uses `data/demo-sales.json`** (in the repository): daily units sold for each of
the ten demo medicines, by calendar date. The seed copies it into `sales_history`, and the
forecast trains on `sales_history`. The Kaggle CSV and the preparation script are only needed to
rebuild that file, for example to change a medicine's pattern.

`data/prepare_demo_sales.py` built the file in these steps (it prints each one when it runs):

1. Remove exact duplicate rows (2,630).
2. Remove 2020-2021: the dataset marks them as COVID years and their demand is about 60% above
   normal.
3. Cap outliers above Q3 + 3 x IQR per medicine (1,506 rows).
4. Add up each medicine's rows per day and keep only the day-to-day variation. In the source every
   medicine follows the same seasonal curve (peaking in March, in both hemispheres), so that curve
   is removed.
5. Rebuild each medicine's demand for one community pharmacy in Amman: its own volume, yearly
   growth and seasons (antibiotics and cough syrup peak in winter, Cetirizine in the spring pollen
   season, Metformin and Amlodipine barely change), and the Jordanian week (Friday is quietest).
   Each day's units are drawn around that expectation (Poisson distribution, fixed random seed).
6. Continue the series to the end of 2029, reusing the 2022-2025 day-to-day variation while
   volume, growth and seasons carry on, so the demo always has history up to yesterday.

The seed writes the history from 2022 up to yesterday. Before each forecast run the server fills
any days missing since the last seed (`services/demoSalesService.js`), so a demo weeks later
needs no re-seed. Days that already have sales, including real ones, are never changed.

The raw CSV is not in the repository because its licence is listed as "Unknown". To rebuild the
JSON, download the dataset into `data/raw/` and run, from the repository root:

```bash
ml-service/venv/Scripts/python -I data/prepare_demo_sales.py data/raw/global_pharmacy_sales_2020_2025_daily_dataset.csv
```

`ml-service/evaluate.py` measures the gain from the seasonal features. It replays 2025 week by
week: each week it trains on the sales before it, once without seasons (trend and weekday on the
last 90 days) and once with them (on all history), and compares both with what was actually sold:

| Horizon | Error in total units, without seasons | With seasons |
|---|---|---|
| next 7 days (the reorder alert) | 17.6% | 14.8% |
| next 28 days | 15.0% | 7.6% |

The most seasonal medicines gain the most: Cough Syrup's 28-day error drops from 27.2% to 9.0%,
Cetirizine's from 18.1% to 7.8%. The error on a single day improves less (2.14 to 2.01 units),
because one day's sales at a small pharmacy are largely random; the total over several days is
what a reorder decision depends on.

## API summary

All endpoints are under `/api`. Apart from register, login, forgot-password and reset-password,
they need the header `Authorization: Bearer <token>` (the token from login). Errors are
`{ error, code?, params?, details? }`: `error` is an English message, `code` one of
`ERROR_CODES`, `details` per-field form messages.

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/auth/register` | public | create a patient account `{ name, email, phone, password }` |
| POST | `/auth/login` | public | sign in (locks after 5 wrong passwords) |
| GET | `/auth/me` | any | the signed-in user |
| DELETE | `/auth/me` | patient | delete your own account `{ password }` |
| PUT | `/auth/me/phone` | any | add or change your phone number `{ phone }` |
| POST | `/auth/forgot-password` | public | `{ email, lang? }`: emails a reset link; always the same answer (rate limited) |
| POST | `/auth/reset-password` | public | `{ token, password }` (rate limited) |
| GET/POST | `/medications` | staff | list medications / add one with its first stock lot |
| GET/PUT/DELETE | `/medications/:id` | staff | read / update catalog details / delete |
| GET/POST | `/medications/:id/batches` | staff | list stock lots / receive a new lot (UC-1) |
| PATCH/DELETE | `/medications/batches/:batchId` | staff | correct or remove a stock lot (UC-1) |
| GET/POST | `/sales` | staff | recent sales / sell a basket `{ items: [{ medication_id, quantity }] }` in one transaction |
| GET | `/sales/preview` | staff | which lots one basket line would use, before selling |
| GET | `/forecast/:medicationId` | staff | sales history and forecast for one medication (retrains first); seasonal models also get a 3-month `outlook` |
| GET | `/alerts` | staff | active reorder alerts |
| PATCH | `/alerts/:id/dismiss` | staff | dismiss an alert |
| POST | `/chat/sessions` | patient | open (or create) the patient's conversation |
| GET | `/chat/sessions` | staff | the unified inbox |
| GET | `/chat/sessions/:id/messages` | participant | message history |
| POST | `/chat/sessions/:id/messages` | participant | send a text message (also delivered live) |
| POST | `/chat/sessions/:id/attachments` | participant | send an image: multipart `image` (PNG/JPEG/WebP/GIF, max 5 MB) + optional `caption` |
| GET | `/chat/attachments/:key` | participant | download an image (access checked every time) |
| POST | `/preorders` | patient | request an out-of-stock medication `{ medication_id, quantity, note? }` (needs a phone number) |
| GET | `/preorders/mine` | patient | your own requests |
| POST | `/preorders/:id/cancel` | patient | cancel your own pending request |
| GET | `/preorders` | staff | all requests, newest first (`?status=` optional) |
| PATCH | `/preorders/:id` | staff | `{ status, delivery? }`: pending -> ready / cancelled, ready -> collected / cancelled; with "ready", `delivery` adds the arrived lot to stock |
| GET | `/availability` | any | in-stock / out-of-stock list |

Live chat uses **Socket.IO** on the same port (path `/socket.io`, login token in `auth.token`).
The server sends `ready`, `message` and `presence` events; the client sends a `message` event
`{ sessionId, content }` and gets the saved message back in the acknowledgement.

## Notes on the GP2 features

**Languages.** English and Arabic, chosen in the top bar (remembered in the browser; the first
choice follows the browser's language). Arabic switches the whole layout to right to left; charts
stay left to right, as is usual for time series. Arabic keeps Western digits so quantities and
prices read the same to everyone. All texts are in `client/src/i18n/en.json` and `ar.json`, and a
unit test fails if the two files ever differ or an error code has no translation. Medication
names, categories and suppliers are shown as entered.

**Password reset emails.** "Forgot password" always gives the same answer, whether or not the
email has an account, so it never reveals who is registered. The link contains a random token
(only its SHA-256 hash is stored); it works once, for 15 minutes, and a newer link cancels older
ones. Both endpoints are rate limited per IP address, and "forgot password" also per email.
Resetting the password signs out every other session of that account, including on other devices.

Emails are only sent once SMTP is set up in `server/.env`; until then the server prints "SMTP is
not configured" once and no email goes out. To send real emails with a Gmail account:

1. Turn on 2-step verification for the Google account, then create an **App password**
   (Google Account -> Security -> App passwords).
2. In `server/.env` set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER=` the Gmail
   address, `SMTP_PASS=` the 16-character app password, and
   `MAIL_FROM=Pharmacy IMS <the Gmail address>`.
3. Restart `dev`.

Any other email provider works the same way (port 465 or 587). **For testing without email**,
set `AUTH_RESET_DEBUG=true` in `server/.env` and restart `dev`: each reset link is then printed in
the server output (WebStorm's Run window, or the terminal running `npm run dev`).

**Phone numbers.** Every patient gives one when registering (8 to 15 digits; spaces, dashes and
brackets are ignored, a leading `00` becomes `+`). A patient without one sees a banner asking for
it and cannot request a preorder until it is added on their account page. Staff see the number as
a tap-to-call link in the chat inbox and the preorder queue; patients never see each other's.

**Preorders and stock.** "Mark ready" records the delivery that came in for the request: staff
enter the lot (quantity, expiry, lot number) and it goes into stock in the same step. If the stock
was already received on Add stock, staff choose "already in stock" so it is not counted twice.
Nothing is reserved: until the patient collects, those units can be sold like any others, and
collecting then reports that there is not enough stock.

**Online status.** Staff see which patients are online; a patient only sees whether anyone at the
pharmacy is online. It is kept in memory only (no "last seen"), and a closed laptop shows as
offline within about a minute.

**Image messages.** The file type is checked from the file's actual bytes, so only real PNG,
JPEG, WebP and GIF images are accepted (SVG never is). Images are saved under random names in
`UPLOADS_DIR`, which is never served directly: they are only downloaded through the logged-in
route, which checks access each time.

**Account deletion.** Patients only, confirmed with their password (a wrong one counts towards the
login lockout). Their chat (with every message and image), preorders and reset links are deleted
with the account; sales records have no link to users, so dispensing history and the forecast are
not affected. The account's login token and open chat connection stop working immediately.

**The pharmacy's details.** `client/src/config/pharmacy.js` holds the name, address, map search,
phone, email, licence number and opening hours used by About and Contact. **Every value there is
a placeholder** and must be replaced with the real pharmacy's details.

**Deploying the client.** The app handles its own page addresses, so the web host must serve
`index.html` for unknown paths (a "single-page app" fallback); otherwise the 404 page, and
reloading any page other than the home page, will not work.

## Testing

See [docs/TESTING.md](docs/TESTING.md) for the unit tests, the verification of every
non-functional requirement and the user-acceptance tests of UC-1, UC-2 and UC-3.
