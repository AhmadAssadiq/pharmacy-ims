/**
 * Preorders (GP2 addition): a patient asks for a medication that is out of
 * stock, staff mark it ready when it arrives, and the patient collects it.
 *
 * No stock is reserved when a request is made or marked ready. Marking it
 * collected dispenses it through the same FEFO line the Dispense page uses
 * (salesService.dispenseLine), inside one transaction with the status change,
 * so medication_batches and sales_history stay correct and the forecast sees
 * the sale on the day the stock actually left the shelf. If too little stock
 * is left by then, nothing moves and the status stays as it was (409).
 */
const pool = require('../config/db');
const preorderModel = require('../models/preorderModel');
const medicationModel = require('../models/medicationModel');
const salesService = require('./salesService');
const {
  validateCreatePreorder,
  validateStatusUpdate,
  validateStatusFilter,
  canTransition,
} = require('../validation/preorderValidation');
const HttpError = require('../utils/httpError');
const { ERROR_CODES, PREORDER_STATUS } = require('../../../shared/constants.json');

const notFound = () => new HttpError(404, 'Preorder not found', undefined, { code: ERROR_CODES.PREORDER_NOT_FOUND });

async function createPreorder(patient, body) {
  const { valid, errors, value } = validateCreatePreorder(body);
  if (!valid) throw new HttpError(400, 'Validation failed', errors, { code: ERROR_CODES.VALIDATION_FAILED });

  const medication = await medicationModel.findById(value.medication_id);
  if (!medication) {
    throw new HttpError(404, 'Medication not found', undefined, { code: ERROR_CODES.MEDICATION_NOT_FOUND });
  }

  try {
    return await preorderModel.create({
      patientId: patient.id,
      medicationId: medication.id,
      quantity: value.quantity,
      note: value.note,
    });
  } catch (err) {
    // The unique key on pending_key settles two identical requests racing each other too.
    if (err.code === 'ER_DUP_ENTRY') {
      throw new HttpError(409, `You already have a pending request for ${medication.name}`, undefined, {
        code: ERROR_CODES.PREORDER_DUPLICATE,
        params: { name: medication.name },
      });
    }
    throw err;
  }
}

function listForPatient(patientId) {
  return preorderModel.findByPatientId(patientId);
}

async function listAll(query = {}) {
  const { valid, errors, value } = validateStatusFilter(query.status);
  if (!valid) throw new HttpError(400, 'Validation failed', errors, { code: ERROR_CODES.VALIDATION_FAILED });
  return preorderModel.findAll({ status: value.status });
}

/** Staff: move a request along. Collecting it dispenses the stock in the same transaction. */
async function updateStatus(id, body) {
  const { valid, errors, value } = validateStatusUpdate(body);
  if (!valid) throw new HttpError(400, 'Validation failed', errors, { code: ERROR_CODES.VALIDATION_FAILED });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const preorder = await preorderModel.findByIdForUpdate(id, conn);
    if (!preorder) throw notFound();

    if (!canTransition(preorder.status, value.status)) {
      throw new HttpError(400, `A ${preorder.status} preorder cannot become ${value.status}`, undefined, {
        code: ERROR_CODES.PREORDER_INVALID_TRANSITION,
        params: { from: preorder.status, to: value.status },
      });
    }

    if (value.status === PREORDER_STATUS.COLLECTED) {
      try {
        await salesService.dispenseLine(
          { medication_id: preorder.medication_id, quantity: preorder.quantity },
          salesService.today(),
          conn
        );
      } catch (err) {
        // A shortfall here is a conflict with the current stock, not a bad request.
        if (err.code === ERROR_CODES.STOCK_INSUFFICIENT) {
          throw new HttpError(409, err.message, undefined, { code: err.code, params: err.params });
        }
        throw err;
      }
    }

    await preorderModel.updateStatus(id, value.status, conn);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return preorderModel.findById(id);
}

/**
 * Patient: cancel their own pending request, and nothing else. Someone else's
 * request answers 404, exactly like one that does not exist.
 */
async function cancelOwn(id, patient) {
  if (await preorderModel.cancelPendingForPatient(id, patient.id)) return preorderModel.findById(id);

  const existing = await preorderModel.findById(id);
  if (!existing || existing.patient_id !== patient.id) throw notFound();
  throw new HttpError(409, 'Only a pending preorder can be cancelled', undefined, {
    code: ERROR_CODES.PREORDER_NOT_CANCELLABLE,
  });
}

module.exports = { createPreorder, listForPatient, listAll, updateStatus, cancelOwn };
