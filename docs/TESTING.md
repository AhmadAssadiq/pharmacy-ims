# Testing and Verification Report

> **Note (GP2 simplification):** sections 1-5 record the test runs of the original code. The
> code was later simplified (branch `simplify`): the server tests were rewritten for the new
> modules (61 tests, `npm test`), and every API response was checked against the original with a
> 102-request snapshot. File names in the tables below refer to the original layout.
>
> **Note (GP2 feedback features):** section 7 records the features added after that (orders,
> payment, prescriptions, alternatives, interactions, Rafiq, voice messages, notifications and
> more). The suite is now 87 server tests and 8 forecaster tests. Sections 5 and 6 describe
> preorders as they were before orders replaced them.

Environment: Windows 10, Node.js 22.16, MySQL 8.4.9, all three services running locally.
Sections 2-4 were recorded on 2026-09-15 (Python 3.13, scikit-learn 1.6.1); section 5 covers the
GP2 additions and was recorded on 2026-10-21.

## 1. Unit tests (`npm test`)

Runner: Node's built-in `node:test`. 101 tests in 17 files, all passing (2026-10-24).

| File | Covers |
|---|---|
| `server/test/authValidation.test.js` | register/login payload validation, email normalisation, password length, phone number required and normalised |
| `server/test/loginAttempt.test.js` | lock after 5 failures, lock expiry, reset on success, per-account tracking (NFR 2.3) |
| `server/test/requireRole.test.js` | staff allowed, patient rejected with 403, anonymous rejected with 401 (NFR 2.2) |
| `server/test/authenticate.test.js` | valid token accepted; a deleted user's token refused at once; name and role taken from the database; missing or forged token refused |
| `server/test/medicationValidation.test.js` | all six FR 3.1 fields required, negative / non-integer quantity rejected (UC-1), invalid dates, negative price |
| `server/test/stockFlags.test.js` | low-stock threshold, out of stock, 30-day near-expiry boundary, expired (FR 4) |
| `server/test/fefo.test.js`, `salesValidation.test.js` | nearest-expiry-first allocation, expired lots never dispensed, sale basket validation |
| `server/test/sessionMerge.test.js` | folding a patient's duplicate chat sessions into one (the in-place upgrade) |
| `server/test/preorderValidation.test.js` | preorder request rules (quantity cap, note length), every allowed and forbidden status transition, the delivery recorded on "ready" |
| `server/test/passwordReset.test.js` | reset token shape and SHA-256, expiry and single use, the rate limiter and its pruning, forgot / reset validation, the reset email in both languages |
| `server/test/smtp.test.js` | message building (UTF-8 headers, base64 body), header-injection refusal, a full SMTP conversation against a fake server with dot-stuffing, AUTH PLAIN, no credentials without TLS |
| `server/test/presence.test.js` | first-socket / last-socket edges, several tabs, idempotent disconnect, the pharmacy's online edge |
| `server/test/attachments.test.js` | magic-byte sniffing (PNG, JPEG, GIF, WebP; SVG and others refused), upload and caption rules, display-name sanitising, Content-Disposition |
| `server/test/accountDeletion.test.js` | password required, only patients may self-delete (staff 403), a locked account cannot delete |
| `server/test/i18nDictionaries.test.js` | `en.json` and `ar.json` have exactly the same keys; every server error code is translated in both |
| `server/test/translate.test.js` | Arabic and English plural forms, isolation of interpolated names, fallbacks, element parts, date and price formats |

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
| NFR 5.1 | Modular code | Server split into routes / services / validation / middleware / socket / jobs / utils / db (simplified in GP2: models merged into services, controllers into routes); client split into api / context / hooks / i18n / components / pages; ML service split into `app.py` (HTTP) and `forecaster.py` (model) | **pass** |

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

## 5. GP2 additions - verification (2026-10-21)

Each feature was exercised in the browser as staff and as a patient, and its server rules over
HTTP and WebSocket with scripts. Where a script needed an extra account it created a temporary
one and deleted it afterwards.

| Feature | Verified | Not verified |
|---|---|---|
| Live clock | `<time>` with a machine-readable `dateTime`, tabular digits, no live region; the page under it does not re-render; the minute turns within a second; one interval, cleared on sign-out; both roles; phone width | with a screen reader |
| Dark mode | follows the OS while on "system"; each toggle step stored and applied; stored choice applied before first paint (no light flash in the production build); every screen checked in dark; all 41 colour tokens have a dark value; contrast measured (text >= 11.6:1, muted >= 5.6:1, input border 4.6:1, pills >= 9.5:1) | a real OS-level switch (emulated in the browser) |
| Arabic / RTL | every page in Arabic for both roles; layout mirrors (row edge, chat bubbles, dialogs); charts stay LTR with labels inside the frame; Latin data kept in order with `<bdi>`; server errors arrive as codes and are translated (e.g. "تتبقى 4 محاولات"); phone width with no horizontal scroll | with a screen reader in Arabic |
| One chat session per patient | the dev database's duplicates merged with no message lost; second `db:migrate` a no-op; five concurrent first opens -> one session; fresh install gets the unique key from `schema.sql` | - |
| Preorders | request, duplicate -> 409, unknown medication -> 404, patient blocked from staff endpoints (403); cancel own, another patient's -> 404; ready -> collected with only expired stock -> 409, status unchanged, nothing dispensed; after receiving a lot, collected -> that lot 10 -> 8 and one `sales_history` row; finished requests cannot move (400); deleting a patient removes their requests | - |
| Forgot password | same status and body for existing and unknown emails, ~2 ms either way; per-email limit -> 429; older link retired by a newer one; reused and expired links refused; mismatched confirmation caught; reset clears the login lockout and does not sign in; old password refused, new one works; deleting the user removes their tokens | a real email (there is no mail service) |
| Online status | staff `ready` snapshot; staff told when a patient arrives and leaves; a patient never hears about other patients; inbox `online` flag; heartbeat dropped a socket that ignored pings after 49 s; staff UI flips online / offline live | patients seeing "pharmacy offline" live, because another staff client was connected during the test (covered by `presence.test.js`) |
| Image messages | valid PNG stored under a UUID name and pushed live; SVG sent as `image/png` -> refused (ATTACHMENT_TYPE); 6 MB -> 413; long caption -> 400; nothing written for rejected uploads; another patient -> 403 for upload and download; no token -> 401; download headers (sniffed type, `nosniff`, sandbox CSP, Content-Disposition, private long cache); path traversal -> 404; folder not served statically; browser: thumbnail via blob URL, preview, caption, sending state, SVG refused on the client, staff sees the image with sender alt text | upload progress (only a sending state is shown) |
| Delete account | wrong password -> stays signed in, counts toward lockout; correct password -> signed out to login with a notice; old token -> 401 at once; open socket closed with 4401; user, session, messages (staff replies included), preorders, reset tokens and the image file all removed; staff self-delete -> 403 | - |
| 404 page | signed out in the signed-out frame with "Go to sign in"; signed in inside the normal layout with the right home link; requested path shown; tab title set in both languages; `/` and wrong-role redirects unchanged | - |
| About / Contact | placeholders from `config/pharmacy.js`; `tel:` and `mailto:` links; plain maps link; opening hours; Contact in both frames, "Message the pharmacy" only for a signed-in patient; nav and signed-out links; Arabic and dark mode | - |

## 6. Phone numbers, preorder deliveries, password reset email, bug sweep (2026-10-24)

| Change | Verified |
|---|---|
| Phone numbers | registration refuses a bad number (translated message) and stores `079 555 1234` as `0795551234`; a patient without one sees the banner, cannot request a preorder (UI link, API 409 PHONE_REQUIRED), adds one on the account page and the banner goes; staff see it as a `tel:` link on the preorder queue and in the chat inbox; `db:migrate` added the column in place and `db:seed` gave the demo patient its number |
| Preorder delivery | "Mark ready" dialog pre-fills the requested quantity; too few units and a past expiry are refused inside the dialog; a delivery of 10 put a lot of 10 into stock (Inventory 0 -> 10); collecting 3 left 7 and wrote one `sales_history` row of 3 |
| Password reset email | against a local mail catcher: one message, sender and Arabic subject correctly encoded, body in Arabic with the link; that link reset the password over HTTP and the new password signed in. Without SMTP settings the server logs "SMTP is not configured" once. Not verified: a real provider (needs your SMTP credentials) |
| Bug sweep | a socket waiting on its user lookup is no longer killed by the heartbeat; a token the hub refuses (4401) signs the user out instead of reconnecting every 2 s (checked with a deleted account); a stored image missing from disk now gives a plain 404 with no server path in it; the rate limiter prunes expired windows; Inventory's "expiring" KPI and headline now say medications, which is what they count; signed-out pages no longer slide under the language / theme bar on a phone (checked at 375 px) |
| Regression | 16 pages across staff, patient and signed-out load with no console errors |

## 7. GP2 feedback features - verification (2026-11-14 and 2026-11-15)

Checked on a separate test database (`pharmacy_ims_snapshot`), with the server on port 4100 and
the site on port 5174, so the working database was never touched. The server rules were
exercised over HTTP with scripts, and the pages in the browser as staff and as a patient. The
password test created a temporary account and deleted it afterwards.

Unit tests: `npm test` runs 87 tests in 8 files, all passing; the forecaster's 8 tests pass.
New test files: `catalogue.test.js` (alternatives, ingredients, interactions, bell items) and
`assistant.test.js` (Rafiq, with the database and DeepSeek replaced by fakes). New tests were
added to `validation.test.js` (orders, prescription decisions, medication fields),
`chatAndReset.test.js` (voice recordings) and `accounts.test.js` (change password).

| Feature | Verified | Not verified |
|---|---|---|
| Demo data | `prepare_demo_sales.py` rebuilt `demo-sales.json` with fifteen series of 2,922 days; the ten existing series are identical to before; the seed created 16 medications, 26,675 sales rows and 10 interactions | `evaluate.py` was not run again (the forecaster did not change) |
| Discontinue | discontinue -> 200; delete with history -> 409 MEDICATION_HAS_HISTORY; selling a discontinued medication -> 400 MEDICATION_DISCONTINUED; restore -> 200 | the Discontinue and Restore buttons were not clicked in the browser (the page builds and its dialog is the shared one) |
| Alternatives | Ibuprofen 200mg (sold out) lists Ibuprofen 400mg as "same active ingredient", then the two paracetamols as "similar use"; shown on the Dispense page when the sold-out medication is chosen | - |
| Interaction check | Aspirin + Warfarin -> major; Paracetamol 500mg + 1000mg -> same ingredient; Paracetamol + Cetirizine -> none; a bad list -> 400; the notice appears in the Dispense basket and in the patient's cart | the "prescription checked" tick box on the Dispense dialog was not clicked in the browser |
| Orders | three-medication order by card with an antibiotic: refused without a photo (400 PRESCRIPTION_REQUIRED), accepted with one (paid, prescription waiting); "ready" before approval -> 409; approved; "ready" with a line out of stock -> 409 PREORDER_STOCK_SHORT naming it; after receiving stock -> ready -> collected, stock down on all three lines; a patient calling staff endpoints -> 403 | two staff members changing the same order at once |
| Payment (demo) | card: "Processing payment", then "Payment successful", order saved as paid; cash: unpaid until collected; cancelled card order -> refunded | - |
| Prescriptions | photo stored and opened by staff (200, `image/png`) and shown in the staff dialog; rejecting without a reason -> 400; with one -> order cancelled, refunded, reason shown to the patient | a second patient trying to open another patient's photo (the rule is the same 404 as for orders) |
| My orders | open and past orders with lines, totals, payment and prescription state; cancel a pending order | "Order again" was not clicked in the browser |
| Voice messages | a WebM recording sent over HTTP is stored as `audio/webm`, appears in the inbox as "Voice message" and plays in the chat bubble; a PNG sent as a recording -> 415 VOICE_TYPE; the microphone button is shown | **recording with a real microphone** (hold, release, preview, send): the test browser has no microphone |
| Rafiq | fifteen questions as a patient and as staff, in English and Arabic (see `docs/rafiq-test-questions.md`): stock, prices and alternatives from the catalogue; no quantities for a patient; refusals to diagnose, change a dose, dose a child, give overdose amounts and go off-topic; an emergency answered with 911; the Rafiq tab and its first-use notice for staff | the Rafiq tab was not opened as a patient in the browser; the 20-questions limit was not reached |
| Notification bell | staff: a new patient message and a new order raised the bell to 2 without a reload; opening the conversation cleared its unread mark and lowered the bell. Patient (over HTTP): unread message, order ready and medication back in stock listed, and each cleared when opened | the patient's bell in the browser; the reorder-alert line (the forecast service was switched off on the test server) |
| Tell me when it's back | watch a sold-out medication -> after stock is received it is listed in the bell with its name -> opening it removes the watch | the button on the patient page was not clicked in the browser |
| Phone menu | at 375 px wide the links fold behind "Menu" (top bar 117 px, was 177 px), open as a list, and the bell's list stays inside the screen; no sideways scrolling | Arabic at phone width; a real phone |
| Change password | wrong current password -> 401 and nothing changed; new = current -> 400; correct -> 204, the old login token -> 401 at once, the old password no longer signs in, the new one does | the form in the browser, and a second open tab being signed out |
| DawaDesk | the name in the top bar, the tab title and the reset email subject | - |

Still to do by hand before the defence: record a real voice message in Chrome and in Firefox;
go through the new pages in Arabic and in dark mode; have the wording of the ten interactions
in `server/src/db/demoInteractions.js` checked against a reference.
