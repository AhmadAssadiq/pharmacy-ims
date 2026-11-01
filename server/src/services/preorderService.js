// Preorders (GP2 addition): a patient asks for a medication that is out of stock,
// staff mark the request "ready" when it arrives, and the patient comes to collect it.
//
// Status flow:   pending -> ready -> collected      (or cancelled before it is collected)
//
// - Marking it ready usually records the delivery that came in for it: staff enter the lot
//   (quantity, expiry, lot number) and it is added to stock in the same transaction.
//   If the stock already arrived another way ("Add stock" page), staff mark it ready
//   without a delivery so it is not counted twice.
// - Nothing is reserved: until it is collected, those units are on the shelf like any others.
// - Marking it collected sells it exactly like the Dispense page does (salesService.dispenseLine),
//   so stock and sales_history stay correct. If too little stock is left by then, nothing
//   changes and the answer is 409.
import createError from 'http-errors';
import { db, runInTransaction } from '../db.js';
import { ERROR_CODES, PREORDER_STATUS } from '../constants.js';
import { canChangeStatus, validateDelivery } from '../validation/saleSchemas.js';
import { todayAsText } from '../utils/dates.js';
import { findMedicationById, insertBatch } from './medicationService.js';
import { dispenseLine } from './salesService.js';

// The SELECT used for every preorder read, with the patient's and the medication's names.
// Nothing here shows stock levels, prices or suppliers, so patients see only what FR 7 allows.
const SELECT_PREORDERS = `
  SELECT p.id, p.patient_id, u.name AS patient_name, u.phone AS patient_phone,
         p.medication_id, m.name AS medication_name,
         p.quantity, p.status, p.note, p.created_at, p.updated_at
  FROM preorders p
  JOIN users u ON u.id = p.patient_id
  JOIN medications m ON m.id = p.medication_id`;

const NEWEST_FIRST = 'ORDER BY p.created_at DESC, p.id DESC';

// The error for a preorder that does not exist (or belongs to someone else)
function preorderNotFound() {
  return createError(404, 'Preorder not found', { code: ERROR_CODES.PREORDER_NOT_FOUND });
}

// Finds one preorder with names, or returns null.
async function findPreorderById(id) {
  const [rows] = await db.query(`${SELECT_PREORDERS} WHERE p.id = ?`, [id]);
  return rows[0] || null;
}

// A patient asks for a medication. `input` is already validated (newPreorderSchema).
export async function createPreorder(patient, input) {
  // Staff phone the patient when it arrives, so a request needs a phone number
  if (!patient.phone) {
    throw createError(409, 'Add a phone number to your account first', { code: ERROR_CODES.PHONE_REQUIRED });
  }

  const medication = await findMedicationById(input.medication_id);
  if (!medication) {
    throw createError(404, 'Medication not found', { code: ERROR_CODES.MEDICATION_NOT_FOUND });
  }

  try {
    const [result] = await db.query(
      'INSERT INTO preorders (patient_id, medication_id, quantity, note) VALUES (?, ?, ?, ?)',
      [patient.id, medication.id, input.quantity, input.note]
    );
    return findPreorderById(result.insertId);
  } catch (error) {
    // The database allows only one PENDING request per patient and medication
    // (the unique key on pending_key in schema.sql), so a second one fails here.
    if (error.code === 'ER_DUP_ENTRY') {
      throw createError(409, `You already have a pending request for ${medication.name}`, {
        code: ERROR_CODES.PREORDER_DUPLICATE,
        params: { name: medication.name },
      });
    }
    throw error;
  }
}

// A patient's own requests, newest first.
export async function getPreordersOfPatient(patientId) {
  const [rows] = await db.query(`${SELECT_PREORDERS} WHERE p.patient_id = ? ${NEWEST_FIRST}`, [patientId]);
  return rows;
}

// Every request for staff, newest first. `status` filters the list (null = all statuses).
export async function getAllPreorders(status) {
  if (status) {
    const [rows] = await db.query(`${SELECT_PREORDERS} WHERE p.status = ? ${NEWEST_FIRST}`, [status]);
    return rows;
  }
  const [rows] = await db.query(`${SELECT_PREORDERS} ${NEWEST_FIRST}`);
  return rows;
}

// Staff move a request to its next status. `newStatus` is already validated.
// `delivery` is the lot that arrived for it (only used when marking it ready; may be missing).
// Returns { preorder, delivered } where delivered is the new lot, or null.
export async function changePreorderStatus(id, newStatus, delivery) {
  const delivered = await runInTransaction(async (connection) => {
    // 1. Read the request and lock it, so two staff members cannot change it at the same time
    const [rows] = await connection.query(
      'SELECT id, patient_id, medication_id, quantity, status FROM preorders WHERE id = ? FOR UPDATE',
      [id]
    );
    const preorder = rows[0];
    if (!preorder) {
      throw preorderNotFound();
    }

    // 2. Only allowed moves (e.g. pending -> collected is not allowed)
    if (!canChangeStatus(preorder.status, newStatus)) {
      throw createError(400, `A ${preorder.status} preorder cannot become ${newStatus}`, {
        code: ERROR_CODES.PREORDER_INVALID_TRANSITION,
        params: { from: preorder.status, to: newStatus },
      });
    }

    // 3. Marking it ready with a delivery: add the delivered lot to stock
    let newBatch = null;
    if (newStatus === PREORDER_STATUS.READY && delivery) {
      const lot = validateDelivery(delivery, preorder.quantity, todayAsText());
      newBatch = await insertBatch(connection, { medication_id: preorder.medication_id, ...lot });
    }

    // 4. Marking it collected: sell it, exactly like the Dispense page does
    if (newStatus === PREORDER_STATUS.COLLECTED) {
      try {
        await dispenseLine(
          connection,
          { medication_id: preorder.medication_id, quantity: preorder.quantity },
          todayAsText()
        );
      } catch (error) {
        // Not enough stock now is a conflict with the current stock (409), not a bad request
        if (error.code === ERROR_CODES.STOCK_INSUFFICIENT) {
          throw createError(409, error.message, { code: error.code, params: error.params });
        }
        throw error;
      }
    }

    // 5. Save the new status
    await connection.query('UPDATE preorders SET status = ? WHERE id = ?', [newStatus, id]);
    return newBatch;
  });

  return { preorder: await findPreorderById(id), delivered };
}

// A patient cancels their own request; only possible while it is still pending.
// Someone else's request answers 404, exactly like one that does not exist.
export async function cancelOwnPreorder(id, patient) {
  // One UPDATE that only matches the patient's own pending request. Doing it in one
  // statement means it cannot slip past a staff member marking it ready at the same moment.
  const [result] = await db.query(
    "UPDATE preorders SET status = 'cancelled' WHERE id = ? AND patient_id = ? AND status = 'pending'",
    [id, patient.id]
  );
  if (result.affectedRows > 0) {
    return findPreorderById(id);
  }

  // Nothing changed: work out why
  const existing = await findPreorderById(id);
  if (!existing || existing.patient_id !== patient.id) {
    throw preorderNotFound();
  }
  throw createError(409, 'Only a pending preorder can be cancelled', { code: ERROR_CODES.PREORDER_NOT_CANCELLABLE });
}
