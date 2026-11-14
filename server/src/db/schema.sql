-- Pharmacy Inventory Management System - database schema.
-- Run by   npm run db:migrate   (see migrate.js).
-- The six tables from the project specification, plus:
--   medication_batches  stock is kept per lot, so each delivery has its own expiry date
--   preorders           patient orders, with their medications in preorder_items (GP2 addition)
--   medication_interactions  known interactions between active ingredients (GP2 addition)
--   password_resets     "forgot password" links (GP2 addition)

CREATE DATABASE IF NOT EXISTS pharmacy_ims
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE pharmacy_ims;

-- Staff and patient accounts. Passwords are stored only as bcrypt hashes.
-- phone: every patient who registers must give one (GP2 addition), so the pharmacy can
--   call them about a preorder. It is NULL for staff.
-- password_changed_at: when the password was last reset. Login tokens made before this
--   time are refused, so a reset signs out every old session (see middleware/auth.js).
CREATE TABLE IF NOT EXISTS users (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name                VARCHAR(100) NOT NULL,
  email               VARCHAR(255) NOT NULL,
  phone               VARCHAR(20) NULL,
  password_hash       VARCHAR(255) NOT NULL,
  role                ENUM('staff', 'patient') NOT NULL,
  password_changed_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

-- Medication catalog. Stock levels and expiry dates live in medication_batches;
-- this table holds only catalog data plus the per-medication reorder threshold.
-- active_ingredient: the chemical in it (e.g. "Paracetamol"). Used to suggest alternatives
--   and to check for interactions (both GP2 additions).
-- requires_prescription: 1 for prescription-only medicines such as antibiotics.
-- is_discontinued: 1 when the pharmacy no longer sells it. It is hidden from patients and
--   from the Dispense page, but its sales history is kept (GP2 addition).
CREATE TABLE IF NOT EXISTS medications (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name                  VARCHAR(150) NOT NULL,
  category              VARCHAR(100) NOT NULL,
  active_ingredient     VARCHAR(150) NOT NULL,
  unit_price            DECIMAL(10, 2) NOT NULL,
  supplier_info         VARCHAR(255) NOT NULL,
  low_stock_threshold   INT NOT NULL DEFAULT 10,
  requires_prescription TINYINT(1) NOT NULL DEFAULT 0,
  is_discontinued       TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  CONSTRAINT chk_medications_price CHECK (unit_price >= 0),
  CONSTRAINT chk_medications_threshold CHECK (low_stock_threshold >= 0)
) ENGINE=InnoDB;

-- One row per received lot. A medication's sellable quantity is the sum of its
-- unexpired batches; dispensing draws from the nearest expiry first (FEFO).
CREATE TABLE IF NOT EXISTS medication_batches (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  medication_id INT UNSIGNED NOT NULL,
  quantity      INT NOT NULL,
  expiry_date   DATE NOT NULL,
  batch_number  VARCHAR(60) NULL,
  received_date DATE NOT NULL,
  PRIMARY KEY (id),
  KEY idx_medication_batches_medication_expiry (medication_id, expiry_date),
  CONSTRAINT fk_medication_batches_medication FOREIGN KEY (medication_id) REFERENCES medications (id) ON DELETE CASCADE,
  CONSTRAINT chk_medication_batches_quantity CHECK (quantity >= 0)
) ENGINE=InnoDB;

-- Known negative interactions between two active ingredients (GP2 addition).
-- Each pair is stored once, in lower case, with ingredient_a before ingredient_b in the
-- alphabet, so a pair can be found with one lookup whichever way round it is asked.
-- The descriptions are shown to staff and patients in their own language.
-- Filled by the seed (db/demoInteractions.js).
CREATE TABLE IF NOT EXISTS medication_interactions (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  ingredient_a   VARCHAR(150) NOT NULL,
  ingredient_b   VARCHAR(150) NOT NULL,
  severity       ENUM('minor', 'moderate', 'major') NOT NULL,
  description_en VARCHAR(500) NOT NULL,
  description_ar VARCHAR(500) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_medication_interactions_pair (ingredient_a, ingredient_b)
) ENGINE=InnoDB;

-- One chat session per patient, enforced by the unique key so two racing
-- "open my session" requests cannot create a second one. staff_id is set
-- when a staff member replies.
CREATE TABLE IF NOT EXISTS chat_sessions (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  patient_id INT UNSIGNED NOT NULL,
  staff_id   INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_chat_sessions_patient (patient_id),
  CONSTRAINT fk_chat_sessions_patient FOREIGN KEY (patient_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_sessions_staff   FOREIGN KEY (staff_id)   REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Persisted chat log (FR 5.1). A message is text, an image, an image with a
-- caption, or a voice message. content stays NOT NULL: an image-only or voice
-- message stores '' and the rule "text or an attachment" is enforced in
-- services/chatService.js. The image or recording itself is a file on disk;
-- attachment_path holds only its generated name (never the client's filename),
-- attachment_mime its type (image/... or audio/...), and attachment_name a
-- sanitised name for the download header (GP2 additions).
CREATE TABLE IF NOT EXISTS chat_messages (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  chat_session_id INT UNSIGNED NOT NULL,
  sender_id       INT UNSIGNED NOT NULL,
  content         TEXT NOT NULL,
  attachment_path VARCHAR(64) NULL,
  attachment_mime VARCHAR(20) NULL,
  attachment_size INT UNSIGNED NULL,
  attachment_name VARCHAR(120) NULL,
  timestamp       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_chat_messages_session (chat_session_id, timestamp),
  UNIQUE KEY uq_chat_messages_attachment (attachment_path),
  CONSTRAINT fk_chat_messages_session FOREIGN KEY (chat_session_id) REFERENCES chat_sessions (id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_messages_sender  FOREIGN KEY (sender_id)       REFERENCES users (id)         ON DELETE CASCADE
) ENGINE=InnoDB;

-- Patient orders (GP2 addition). A patient orders one or more medications ahead of
-- time, in stock or not; staff mark the order ready and the patient collects it.
-- This table is the order itself; its medications are the rows of preorder_items.
--   status:       pending -> ready -> collected   (or cancelled before it is collected)
--   total_price:  the sum of its lines at the prices of the day it was ordered
--   payment_method / payment_status: cash is paid on collection; card is a DEMO payment
--     taken when the order is placed (no real card is charged). A cancelled paid order
--     becomes "refunded".
--   prescription_*: an order with a prescription-only medication must come with a photo
--     of the prescription. The photo is a file on disk (like a chat image); only its
--     generated name is stored. Staff approve or reject it; a rejection cancels the order
--     and prescription_reason tells the patient why.
-- No stock is reserved when an order is made; collecting it dispenses every line through
-- the normal FEFO path (services/preorderService.js).
-- Deleting a patient removes their orders with them.
CREATE TABLE IF NOT EXISTS preorders (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  patient_id          INT UNSIGNED NOT NULL,
  status              ENUM('pending', 'ready', 'collected', 'cancelled') NOT NULL DEFAULT 'pending',
  note                VARCHAR(500) NULL,
  total_price         DECIMAL(10, 2) NOT NULL,
  payment_method      ENUM('cash', 'card') NOT NULL DEFAULT 'cash',
  payment_status      ENUM('unpaid', 'paid', 'refunded') NOT NULL DEFAULT 'unpaid',
  prescription_status ENUM('not_needed', 'waiting', 'approved', 'rejected') NOT NULL DEFAULT 'not_needed',
  prescription_path   VARCHAR(64) NULL,
  prescription_mime   VARCHAR(20) NULL,
  prescription_reason VARCHAR(255) NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_preorders_prescription (prescription_path),
  KEY idx_preorders_status_created (status, created_at),
  KEY idx_preorders_patient (patient_id),
  CONSTRAINT fk_preorders_patient FOREIGN KEY (patient_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT chk_preorders_total CHECK (total_price >= 0)
) ENGINE=InnoDB;

-- The medications of an order: one row per medication, with the quantity and the price
-- it had when the order was placed (so a later price change does not alter old orders).
-- A medication that appears in an order cannot be deleted (it can be discontinued), so
-- the medication foreign key has no ON DELETE CASCADE.
CREATE TABLE IF NOT EXISTS preorder_items (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  preorder_id   INT UNSIGNED NOT NULL,
  medication_id INT UNSIGNED NOT NULL,
  quantity      INT NOT NULL,
  unit_price    DECIMAL(10, 2) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_preorder_items_line (preorder_id, medication_id),
  CONSTRAINT fk_preorder_items_preorder   FOREIGN KEY (preorder_id)   REFERENCES preorders (id)   ON DELETE CASCADE,
  CONSTRAINT fk_preorder_items_medication FOREIGN KEY (medication_id) REFERENCES medications (id),
  CONSTRAINT chk_preorder_items_quantity CHECK (quantity > 0)
) ENGINE=InnoDB;

-- Password reset tokens (GP2 addition). Only the SHA-256 hash of a token is
-- stored, so a leaked table cannot be used to reset anyone's password. A token
-- is single use (used_at) and short lived (expires_at); requesting a new one
-- marks the user's earlier unused tokens used. Deleting a user removes theirs.
CREATE TABLE IF NOT EXISTS password_resets (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  token_hash  CHAR(64) NOT NULL,
  expires_at  DATETIME NOT NULL,
  used_at     DATETIME NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_password_resets_token (token_hash),
  KEY idx_password_resets_user (user_id),
  CONSTRAINT fk_password_resets_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Historical sales used to train the forecasting model (FR 6.1).
CREATE TABLE IF NOT EXISTS sales_history (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  medication_id INT UNSIGNED NOT NULL,
  quantity_sold INT NOT NULL,
  date          DATE NOT NULL,
  PRIMARY KEY (id),
  KEY idx_sales_history_medication_date (medication_id, date),
  CONSTRAINT fk_sales_history_medication FOREIGN KEY (medication_id) REFERENCES medications (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Alerts generated by the forecasting job (FR 6.2).
CREATE TABLE IF NOT EXISTS reorder_alerts (
  id                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  medication_id        INT UNSIGNED NOT NULL,
  predicted_date       DATE NOT NULL,
  days_until_threshold INT NOT NULL,
  status               ENUM('active', 'dismissed') NOT NULL DEFAULT 'active',
  PRIMARY KEY (id),
  KEY idx_reorder_alerts_medication_status (medication_id, status),
  CONSTRAINT fk_reorder_alerts_medication FOREIGN KEY (medication_id) REFERENCES medications (id) ON DELETE CASCADE
) ENGINE=InnoDB;
