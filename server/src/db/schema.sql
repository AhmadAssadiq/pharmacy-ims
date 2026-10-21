-- Pharmacy Inventory Management System - database schema
-- The six tables from the project specification plus `medication_batches`:
-- stock is held per dated lot so each delivery carries its own expiry date.

CREATE DATABASE IF NOT EXISTS pharmacy_ims
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE pharmacy_ims;

-- Staff and patient accounts. Passwords are stored only as bcrypt hashes.
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('staff', 'patient') NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

-- Medication catalog. Stock levels and expiry dates live in medication_batches;
-- this table holds only catalog data plus the per-medication reorder threshold.
CREATE TABLE IF NOT EXISTS medications (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name                VARCHAR(150) NOT NULL,
  category            VARCHAR(100) NOT NULL,
  unit_price          DECIMAL(10, 2) NOT NULL,
  supplier_info       VARCHAR(255) NOT NULL,
  low_stock_threshold INT NOT NULL DEFAULT 10,
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

-- Persisted chat log (FR 5.1).
CREATE TABLE IF NOT EXISTS chat_messages (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  chat_session_id INT UNSIGNED NOT NULL,
  sender_id       INT UNSIGNED NOT NULL,
  content         TEXT NOT NULL,
  timestamp       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_chat_messages_session (chat_session_id, timestamp),
  CONSTRAINT fk_chat_messages_session FOREIGN KEY (chat_session_id) REFERENCES chat_sessions (id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_messages_sender  FOREIGN KEY (sender_id)       REFERENCES users (id)         ON DELETE CASCADE
) ENGINE=InnoDB;

-- Patient requests for a medication that is out of stock (GP2 addition).
-- No stock is reserved when a request is made; marking it collected dispenses
-- it through the normal FEFO path (services/preorderService.js).
-- `pending_key` exists only while a request is pending, so its unique key
-- allows one pending request per patient and medication while keeping any
-- number of finished ones (MySQL has no partial unique index; NULLs never clash).
-- It is VIRTUAL because MySQL forbids ON DELETE CASCADE on the base columns of
-- a STORED generated column; an indexed virtual column is allowed.
-- Deleting a patient or a medication removes their requests with them.
CREATE TABLE IF NOT EXISTS preorders (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  patient_id    INT UNSIGNED NOT NULL,
  medication_id INT UNSIGNED NOT NULL,
  quantity      INT NOT NULL,
  status        ENUM('pending', 'ready', 'collected', 'cancelled') NOT NULL DEFAULT 'pending',
  note          VARCHAR(500) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  pending_key   VARCHAR(24) GENERATED ALWAYS AS
                  (IF(status = 'pending', CONCAT(patient_id, ':', medication_id), NULL)) VIRTUAL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_preorders_pending (pending_key),
  KEY idx_preorders_status_created (status, created_at),
  KEY idx_preorders_patient (patient_id),
  CONSTRAINT fk_preorders_patient    FOREIGN KEY (patient_id)    REFERENCES users (id)       ON DELETE CASCADE,
  CONSTRAINT fk_preorders_medication FOREIGN KEY (medication_id) REFERENCES medications (id) ON DELETE CASCADE,
  CONSTRAINT chk_preorders_quantity CHECK (quantity > 0)
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
