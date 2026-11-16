# Handover: the `feedback-features` branch

This file explains what the `feedback-features` branch adds, how to run it, how the new code is
organised, and what is still open. Read it before changing anything on the branch. The README
has the full reference; this is the short version for someone picking the work up.

## State of the branch

- Branched from `main` at `461b00b`. 13 commits, one per step. **Not merged into `main` yet.**
- Tests: 87 server tests (`npm test`) and 8 forecaster tests, all passing.
- Thirteen features are done (list below). Nothing is half-finished.
- Do not push to `main` until both of us have looked at the branch and agreed to merge.

## Running it

1. `git fetch` then `git checkout feedback-features`
2. `npm install`
3. `npm run db:reset`. Several tables changed, so the old local database does not work with
   this code (every page shows "Something went wrong on the server"). The reset **deletes the
   local database** and rebuilds it with the demo data.
4. Add the DeepSeek key to `server/.env`:
   `DEEPSEEK_API_KEY=<the key, sent privately>`
   It is never in the repository. Without it everything works except Rafiq, which answers
   "unavailable".
5. Start the ML service, then `npm run dev`.

Demo accounts are unchanged: `staff@pharmacy.com` / `Staff123!` and `patient@example.com` /
`Patient123!`.

## What was added

| # | Feature | Main files |
|---|---|---|
| 1 | Rafiq, an AI assistant for patients and staff | `server/src/services/assistantService.js`, `routes/assistant.js`, `client/src/components/chat/AssistantChat.jsx` |
| 2 | Voice messages in chat | `chatService.sendVoiceMessage`, `client/src/hooks/useVoiceRecorder.js`, `ChatWindow.jsx`, `ChatAudio.jsx` |
| 3 | Alternatives for an out-of-stock medication | `server/src/utils/alternatives.js`, `components/AlternativesList.jsx` |
| 4 | Interaction check | `services/interactionService.js`, `db/demoInteractions.js`, `components/InteractionNotice.jsx` |
| 5 | Orders: any medication, several per order | `services/preorderService.js`, `validation/saleSchemas.js`, `PatientAvailabilityPage.jsx`, `components/order/OrderCart.jsx`, `StaffPreordersPage.jsx` |
| 6 | Notification bell | `services/notificationService.js`, `context/SocketContext.jsx`, `components/NotificationBell.jsx` |
| 7 | Cash or card payment (a demo) | `services/paymentService.js`, `components/order/PaymentDialog.jsx` |
| 8 | Order history | `pages/patient/PatientOrdersPage.jsx` |
| 9 | Discontinue a medication instead of deleting it | `medicationService.discontinueMedication`, `StaffInventoryPage.jsx` |
| 10 | Change password, staff account page | `authService.changePassword`, `components/ChangePasswordForm.jsx`, `StaffAccountPage.jsx` |
| 11 | "Tell me when it's back", "Order again" | `notificationService.js` (watches), `PatientAvailabilityPage.jsx`, `PatientOrdersPage.jsx` |
| 12 | Folding menu on phones | `components/Layout.jsx`, `styles.css` |
| 13 | Prescription-only medicines | `preorderService.createPreorder` / `decidePrescription`, `components/order/PrescriptionImage.jsx` |

The interface now calls the product **DawaDesk** (top bar, sign-in page, tab title, reset
email). The README and the GP documents keep the formal name, PIMS.

The README has a paragraph on each feature under "Notes on the GP2 features", and the full
route list under "API summary".

## Database changes

All in `server/src/db/schema.sql`. There is no upgrade script: a changed table needs
`npm run db:reset`.

| Table | Change |
|---|---|
| `users` | + `orders_seen_at` |
| `medications` | + `active_ingredient`, `requires_prescription`, `is_discontinued` |
| `chat_sessions` | + `patient_read_at`, `staff_read_at` (unread counts) |
| `preorders` | now the order header: payment and prescription columns; no `medication_id` or `quantity` |
| `preorder_items` (new) | one row per medication of an order, with the price when it was ordered |
| `medication_interactions` (new) | known interactions between two active ingredients |
| `stock_watches` (new) | "tell me when it's back" |
| `assistant_messages` (new) | each user's conversation with Rafiq |

The demo catalogue went from 11 to 16 medications. `data/demo-sales.json` now holds fifteen
series: the ten from the Kaggle file are unchanged, and five are derived in
`data/prepare_demo_sales.py` (each borrows the day-to-day variation of the closest Kaggle
medicine). New medicines must be added at the END of `PROFILES` in that script, or the
existing series change.

## Decisions worth knowing before changing anything

- **Orders reuse the sales code.** Collecting an order calls `salesService.dispenseLine` for
  every line inside one transaction, so FEFO, stock and `sales_history` behave exactly as on
  the Dispense page.
- **Nothing is reserved for an order.** "Ready" checks that every line is in stock; "collected"
  checks again while selling. The old delivery form on "Mark ready" is gone: stock is received
  on the Add stock page.
- **Payment is a demo.** `takeDemoPayment()` always succeeds and no card number is ever asked
  for. That function is the one place a real provider would be called.
- **A prescription photo is stored like a chat image**: type read from the file's bytes, random
  file name, served only through a route that checks access.
- **The bell has no table.** `notificationService.js` counts from existing data every time.
  The server emits a `notify` event (no payload) on the live connection and the bell asks
  again.
- **One Socket.IO connection for the whole signed-in app** (`SocketContext.jsx`, opened in
  `Layout.jsx`). The chat pages and the bell subscribe through `useChatSocket`. Because of
  this, "online" now means "has the app open".
- **Rafiq** sends the system prompt (`buildSystemPrompt`), the last ten messages and the
  catalogue to DeepSeek. Patients' catalogue lines never contain quantities. No name, phone or
  email is sent. The price sits right after the name on each catalogue line and `temperature`
  is 0, because in testing it once quoted another medication's price.
- **Interactions only warn.** They never block a sale or an order.
- **Delete is refused (409) for a medication with sales or orders.** Discontinue is the normal
  way to stop selling something.
- **Changing a password** sets `password_changed_at`, which makes every older login token
  invalid, the same mechanism as a password reset.

## Rules the code follows

- Three server layers: route (URL, login and role, validate, call a service) -> service (logic
  and SQL) -> database. No SQL in routes.
- Plain functions and simple control flow. A library where one fits; no clever patterns.
- A comment at the top of every file, above every function, and on every step that is not
  trivial. Written for someone reading it for the first time.
- Every user-visible text is in `client/src/i18n/en.json` AND `ar.json`. A test fails if the
  two files differ. Arabic plural texts need all six forms.
- Every new error code goes in `shared/constants.json` and needs a translation in both
  languages (`errors.<CODE>`), or the same test fails.
- Limits and allowed values live in `shared/constants.json`, used by server and client.
- Tests use Node's built-in runner. They replace the database with `t.mock.method(db, 'query')`
  and never touch MySQL or the network.
- Commit messages use a prefix (`feat(orders): ...`) and carry no co-author lines.
- The API key is only ever in `server/.env`. Before committing, `git grep "sk-"` must find
  nothing.

## How it was tested

`docs/TESTING.md` section 7 lists, per feature, what was verified and what was not. It was
tested on a separate database so the working one was never touched: start a second server with
`PORT=4100` and `DB_NAME=pharmacy_ims_snapshot` set in the environment (values in the
environment win over `server/.env`).

`docs/rafiq-test-questions.md` has fifteen questions for Rafiq, with the expected behaviour.
Its answers vary, so ask them again before a demo.

## Still open

Not verified by hand:
- Recording a real voice message with a microphone, in Chrome and in Firefox. Only the server
  side and playback were checked.
- The new pages in Arabic and in dark mode, and Arabic at phone width.
- These buttons in the browser (their server rules were tested): Discontinue and Restore,
  Order again, "Tell me when it's back", the change-password form, the patient's bell.

To do before the defence:
- Have the ten interactions in `server/src/db/demoInteractions.js` checked against a proper
  reference. The wording is ours and has not been reviewed by a pharmacist.
- Replace the remaining placeholders in `client/src/config/pharmacy.js` (address, phone,
  email, hours, licence number). Only the name is filled in.

Known weaknesses that were found in a review and deliberately left for later:
- The "newly stocked" demo medication (Vitamin D3) keeps the same five days of history, so its
  "just stocked" story goes stale.
- The Forecast page shows internal wording ("UC-3 alternative flow") and the ML service's raw
  English reason.
- The theme button's first click does nothing visible when the system theme is light.
- Chat times use a different date format from the rest of the app.
- A delivery with an expiry date in the past is accepted on Add stock.
- The login lockout is kept in memory (a restart clears it) and is keyed by email only.
- Sales do not record which staff member made them.
