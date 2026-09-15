# Testing and Verification Report

Environment: Windows 10, Node.js 22.16, Python 3.13 (scikit-learn 1.6.1), MySQL 8.4.9,
all three services running locally. Date: 2026-09-15.

## 1. Unit tests (`npm test`)

Runner: Node's built-in `node:test`. 23 tests, all passing.

| File | Covers |
|---|---|
| `server/test/authValidation.test.js` | register/login payload validation, email normalisation, password length |
| `server/test/loginAttempt.test.js` | lock after 5 failures, lock expiry, reset on success, per-account tracking (NFR 2.3) |
| `server/test/requireRole.test.js` | staff allowed, patient rejected with 403, anonymous rejected with 401 (NFR 2.2) |
| `server/test/medicationValidation.test.js` | all six FR 3.1 fields required, negative / non-integer quantity rejected (UC-1), invalid dates, negative price |
| `server/test/stockFlags.test.js` | low-stock threshold, out of stock, 30-day near-expiry boundary, expired (FR 4) |

## 2. Non-functional requirements - manual verification

| NFR | Requirement | How it was verified | Result |
|---|---|---|---|
| NFR 1.1 | Inventory pages load within 3 s | `GET /api/medications` latency measured with a script; browser navigation timing of `/staff/inventory` (Vite dev server, cold load) | `GET /api/medications` 2-10 ms; browser `loadEventEnd` for `/staff/inventory` 42 ms with the table (10 rows) and alert panel rendered - **pass** |
| NFR 1.2 | Chat delivered within 2 s | Script opens patient + staff WebSockets, sends a message, measures arrival at the other side | patient->staff 11 ms, staff->patient 19 ms; with 50 simultaneous senders the slowest delivery was 116 ms - **pass** |
| NFR 1.3 | High uptime | No specific implementation beyond stable code: WebSocket heartbeat drops dead sockets, forecast job never overlaps and logs (instead of crashing) when the ML service is unreachable, central error handler returns JSON instead of killing the process | **addressed** |
| NFR 2.1 | Data stored securely | `SELECT LEFT(password_hash,7)` shows `$2a$10$` bcrypt hashes (60 chars) for every user; every model uses `pool.execute` with `?` placeholders (grep for string-concatenated SQL found none); API and WebSocket require a valid JWT | **pass** |
| NFR 2.2 | Staff features restricted to staff role | Patient token on `GET /api/medications` and `GET /api/alerts` -> 403; no token -> 401; client redirects a signed-in patient from `/staff/*` to the patient home | **pass** |
| NFR 2.3 | Lock after 5 failed logins | 5 wrong passwords over HTTP: attempts 1-4 return 401 with remaining count, 5th returns 423 "Too many failed attempts", 6th returns 423 "Try again in 15 minute(s)" | **pass** |
| NFR 3.1 | Inventory usable without training | Every field has a plain-language label, flags are shown as coloured badges with text, quantity update is a visible "Update" button next to the number, validation errors appear inline | **pass** (UC-1 walkthrough below) |
| NFR 3.2 | Patient UI usable on desktop and mobile | Rendered availability and chat pages at 375x812 (mobile preset) and at desktop width; navigation wraps, lists stack, chat composer stays reachable | **pass** |
| NFR 4.1 | 50 concurrent users | Script: 100 simultaneous inventory/availability requests (all 200 OK in 170 ms total), 50 simultaneous WebSocket connections each sending a message (all delivered, slowest 116 ms). Connection pool of 20, stateless JWT auth, no per-request global locks | **pass** |
| NFR 5.1 | Modular code | Server split into config / db / models / services / controllers / routes / middleware / validation / ws / jobs / utils; client split into api / context / hooks / components / pages; ML service split into `app.py` (HTTP) and `forecaster.py` (model) | **pass** |

## 3. User acceptance testing

### UC-1 Update Medication Stock

| Step | Action | Expected | Observed |
|---|---|---|---|
| 1 | Sign in as `staff@pharmacy.com`, open Inventory | Inventory table with current quantities and flags | Table shown; Azithromycin (8) flagged "Low stock", Amlodipine flagged "Expires in 20 d", Omeprazole (0) "Out of stock" |
| 2 | Click "Update" next to Azithromycin, enter `-3`, Save | Error shown, nothing saved | Inline message "Quantity cannot be negative"; quantity still 8 (alternative flow) |
| 3 | Enter `25`, Save | Saved, table refreshed | "Stock quantity updated." shown; row shows 25 and the "Low stock" badge changed to "OK"; summary count dropped to 1 low stock |
| 4 | API check | `PATCH /medications/1/quantity {"quantity":-3}` -> 400, `{"quantity":130}` -> 200 | As expected |

### UC-2 Send Message to Pharmacy

| Step | Action | Expected | Observed |
|---|---|---|---|
| 1 | Sign in as `patient@example.com`, open "Chat with pharmacy" | Chat window opens (session created on first use) | Session created; history shown |
| 2 | Type "UAT UC-2: Do you have Metformin 850mg available today?" and Send | Message appears for the patient, is delivered to staff, and is stored | Bubble shown immediately; `chat_messages` row id 5 stored with timestamp; staff inbox `GET /api/chat/sessions` shows it as the session's last message; staff inbox page (open in another session) received it live without refresh |
| 3 | Staff replies from the inbox | Reply appears in the patient's chat in real time | Reply bubble appeared on the patient side within the same second |

### UC-3 Receive Reorder Alert

| Step | Action | Expected | Observed |
|---|---|---|---|
| 1 | Seed 90 days of synthetic sales; Amoxicillin 500mg has rising demand (~5-8/day) with 45 in stock | Model predicts a threshold breach within 7 days -> alert | `npm run forecast`: "medication 3: ALERT in 6 day(s) (2026-09-21)"; `reorder_alerts` row created (active) |
| 2 | Open the staff dashboard | Alert with medication name and days until threshold | Panel shows "Amoxicillin 500mg - Below threshold in 6 days - Predicted date 2026-09-21 - current stock 45" |
| 3 | Vitamin D3 1000IU has only 5 days of sales | No prediction, no alert (alternative flow) | ML `/train` returned "insufficient data: 5 day(s) of history, need 14"; `/predict` returned `insufficient_data`; no alert row |
| 4 | Restock Salbutamol (15 -> 100) and rerun | Its active alert is cleared | "cleared=1"; alert gone. Restoring 15 re-created it (4 days) |
| 5 | Dismiss the Omeprazole alert, rerun | Not re-raised while prediction unchanged | "alertsSuppressed: 1"; alert stays dismissed |
| 6 | Server start-up | Job runs automatically | Log: `[forecast:startup] trained=9 insufficient=1 created=0 updated=2 cleared=0` |

## 4. Other checks

- `npm run build -w client` produces a production bundle (~60 kB gzipped JS).
- Unauthenticated WebSocket connections are closed with code 4401.
- Schema verified in MySQL with `information_schema.COLUMNS`: exactly the six specified tables and columns.
