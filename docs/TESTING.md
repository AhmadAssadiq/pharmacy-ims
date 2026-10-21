# Testing and Verification Report

Environment: Windows 10, Node.js 22.16, MySQL 8.4.9, all three services running locally.
Sections 2-4 were recorded on 2026-09-15 (Python 3.13, scikit-learn 1.6.1); section 5 covers the
GP2 additions and was recorded on 2026-10-21.

## 1. Unit tests (`npm test`)

Runner: Node's built-in `node:test`. 92 tests in 16 files, all passing (2026-10-21).

| File | Covers |
|---|---|
| `server/test/authValidation.test.js` | register/login payload validation, email normalisation, password length |
| `server/test/loginAttempt.test.js` | lock after 5 failures, lock expiry, reset on success, per-account tracking (NFR 2.3) |
| `server/test/requireRole.test.js` | staff allowed, patient rejected with 403, anonymous rejected with 401 (NFR 2.2) |
| `server/test/authenticate.test.js` | valid token accepted; a deleted user's token refused at once; name and role taken from the database; missing or forged token refused |
| `server/test/medicationValidation.test.js` | all six FR 3.1 fields required, negative / non-integer quantity rejected (UC-1), invalid dates, negative price |
| `server/test/stockFlags.test.js` | low-stock threshold, out of stock, 30-day near-expiry boundary, expired (FR 4) |
| `server/test/fefo.test.js`, `salesValidation.test.js` | nearest-expiry-first allocation, expired lots never dispensed, sale basket validation |
| `server/test/sessionMerge.test.js` | folding a patient's duplicate chat sessions into one (the in-place upgrade) |
| `server/test/preorderValidation.test.js` | preorder request rules (quantity cap, note length), every allowed and forbidden status transition |
| `server/test/passwordReset.test.js` | reset token shape and SHA-256, expiry and single use, the rate limiter, forgot / reset validation |
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
