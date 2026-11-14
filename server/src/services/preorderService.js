// Patient orders (GP2 addition): a patient orders one or more medications ahead of time -
// in stock or not - staff mark the order "ready" when everything is on the shelf, and the
// patient comes to collect it.
//
// Status flow:   pending -> ready -> collected      (or cancelled before it is collected)
//
// - An order is a header row in `preorders` plus one row per medication in `preorder_items`.
// - Payment: "cash" is paid when the order is collected. "card" is a DEMO payment taken when
//   the order is placed (services/paymentService.js); a cancelled paid order becomes "refunded".
// - Prescriptions: an order with a prescription-only medication must come with a photo of
//   the prescription. Staff approve or reject it; the order cannot be marked ready before it
//   is approved, and a rejection cancels the order.
// - Nothing is reserved: until it is collected, those units are on the shelf like any others.
//   So "ready" checks that every line is in stock, and "collected" checks again while selling.
// - Marking it collected sells every line exactly like the Dispense page does
//   (salesService.dispenseLine), so stock and sales_history stay correct.
import createError from 'http-errors';
import { db, runInTransaction } from '../db.js';
import {
  ERROR_CODES,
  PREORDER_STATUS,
  PREORDER_MAX_OPEN,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  PRESCRIPTION_STATUS,
  ROLES,
} from '../constants.js';
import { canChangeStatus } from '../validation/saleSchemas.js';
import { todayAsText } from '../utils/dates.js';
import { countSellableUnits } from '../utils/fefo.js';
import { findMedicationById, findBatchesOfMedication } from './medicationService.js';
import { dispenseLine } from './salesService.js';
import { storeUploadedImage, storedImagePath, deleteStoredImage } from './chatService.js';
import { takeDemoPayment } from './paymentService.js';

// Rounds money to 2 decimals (4.8 * 3 = 14.399999 -> 14.4)
function roundMoney(amount) {
  return Math.round(amount * 100) / 100;
}

// The error for an order that does not exist (or belongs to someone else)
function preorderNotFound() {
  return createError(404, 'Order not found', { code: ERROR_CODES.PREORDER_NOT_FOUND });
}

// ----------------------------------------------------------------------------
// Reading orders
// ----------------------------------------------------------------------------

// The SELECT used for every order read, with the patient's name and phone.
// The prescription photo's file name is never sent, only whether there is one.
const SELECT_ORDERS = `
  SELECT p.id, p.patient_id, u.name AS patient_name, u.phone AS patient_phone,
         p.status, p.note, p.total_price, p.payment_method, p.payment_status,
         p.prescription_status, p.prescription_reason,
         (p.prescription_path IS NOT NULL) AS has_prescription,
         p.created_at, p.updated_at
  FROM preorders p
  JOIN users u ON u.id = p.patient_id`;

const NEWEST_FIRST = 'ORDER BY p.created_at DESC, p.id DESC';

// Runs SELECT_ORDERS with the given WHERE / ORDER BY and adds each order's medications:
//   order.items = [{ medication_id, medication_name, quantity, unit_price,
//                    requires_prescription, is_discontinued, in_stock, available }]
// `available` is how many sellable units are on the shelf right now, and `in_stock` whether
// that covers the line.
async function loadOrders(whereAndOrder, params = []) {
  const [orders] = await db.query(`${SELECT_ORDERS} ${whereAndOrder}`, params);
  if (orders.length === 0) {
    return [];
  }

  // One query for the lines of all these orders
  const orderIds = orders.map((order) => order.id);
  const [items] = await db.query(
    `SELECT i.preorder_id, i.medication_id, m.name AS medication_name, i.quantity, i.unit_price,
            m.requires_prescription, m.is_discontinued,
            CAST(COALESCE((SELECT SUM(b.quantity) FROM medication_batches b
                           WHERE b.medication_id = m.id AND b.expiry_date >= CURDATE()), 0) AS SIGNED) AS available
     FROM preorder_items i
     JOIN medications m ON m.id = i.medication_id
     WHERE i.preorder_id IN (?)
     ORDER BY m.name ASC`,
    [orderIds]
  );

  // Put each line with its order
  const itemsByOrder = {};
  for (const item of items) {
    if (!itemsByOrder[item.preorder_id]) {
      itemsByOrder[item.preorder_id] = [];
    }
    itemsByOrder[item.preorder_id].push({
      medication_id: item.medication_id,
      medication_name: item.medication_name,
      quantity: item.quantity,
      unit_price: Number(item.unit_price),
      requires_prescription: Boolean(item.requires_prescription),
      is_discontinued: Boolean(item.is_discontinued),
      available: Number(item.available),
      in_stock: Number(item.available) >= item.quantity,
    });
  }

  return orders.map((order) => ({
    ...order,
    total_price: Number(order.total_price),
    has_prescription: Boolean(order.has_prescription),
    items: itemsByOrder[order.id] || [],
  }));
}

// Finds one order with its lines, or returns null.
async function findOrderById(id) {
  const orders = await loadOrders('WHERE p.id = ?', [id]);
  return orders[0] || null;
}

// What a patient sees of an order: everything except how many units are on the shelf
// (patients never see stock quantities - FR 7).
function hideStockLevels(order) {
  return {
    ...order,
    items: order.items.map((item) => {
      const { available, ...rest } = item;
      return rest;
    }),
  };
}

// A patient's own orders, newest first.
export async function getPreordersOfPatient(patientId) {
  const orders = await loadOrders(`WHERE p.patient_id = ? ${NEWEST_FIRST}`, [patientId]);
  return orders.map(hideStockLevels);
}

// Every order for staff, newest first. `status` filters the list (null = all statuses).
export async function getAllPreorders(status) {
  if (status) {
    return loadOrders(`WHERE p.status = ? ${NEWEST_FIRST}`, [status]);
  }
  return loadOrders(NEWEST_FIRST);
}

// ----------------------------------------------------------------------------
// Placing an order (patient)
// ----------------------------------------------------------------------------

// A patient places an order.
// `input` is already validated (validateOrder): { lines, note, payment_method }.
// `prescriptionFile` is the uploaded photo from multer ({ buffer, originalname }), or
// undefined when none was sent.
export async function createPreorder(patient, input, prescriptionFile) {
  // 1. Staff phone the patient when it is ready, so an order needs a phone number
  if (!patient.phone) {
    throw createError(409, 'Add a phone number to your account first', { code: ERROR_CODES.PHONE_REQUIRED });
  }

  // 2. At most 5 open (pending or ready) orders per patient
  const [openOrders] = await db.query(
    `SELECT COUNT(*) AS total FROM preorders WHERE patient_id = ? AND status IN ('pending', 'ready')`,
    [patient.id]
  );
  if (openOrders[0].total >= PREORDER_MAX_OPEN) {
    throw createError(409, `You already have ${PREORDER_MAX_OPEN} open orders`, {
      code: ERROR_CODES.PREORDER_TOO_MANY_OPEN,
      params: { count: PREORDER_MAX_OPEN },
    });
  }

  // 3. Every medication must exist and still be sold. Work out the total at today's prices.
  const orderLines = [];
  let total = 0;
  let needsPrescription = false;
  for (const line of input.lines) {
    const medication = await findMedicationById(line.medication_id);
    if (!medication) {
      throw createError(404, 'Medication not found', { code: ERROR_CODES.MEDICATION_NOT_FOUND });
    }
    if (medication.is_discontinued) {
      throw createError(400, `${medication.name} is discontinued and cannot be ordered`, {
        code: ERROR_CODES.MEDICATION_DISCONTINUED,
        params: { name: medication.name },
      });
    }
    const unitPrice = Number(medication.unit_price);
    orderLines.push({ medication_id: medication.id, quantity: line.quantity, unit_price: unitPrice });
    total += unitPrice * line.quantity;
    if (medication.requires_prescription) {
      needsPrescription = true;
    }
  }
  total = roundMoney(total);

  // 4. A prescription-only medication needs a photo of the prescription.
  //    (A photo sent with an order that does not need one is simply not kept.)
  let prescription = null;
  if (needsPrescription) {
    if (!prescriptionFile) {
      throw createError(400, 'This order needs a photo of the prescription', {
        code: ERROR_CODES.PRESCRIPTION_REQUIRED,
      });
    }
    prescription = await storeUploadedImage(prescriptionFile);
  }

  try {
    // 5. Card: take the (demo) payment now. Cash: paid when the order is collected.
    let paymentStatus = PAYMENT_STATUS.UNPAID;
    if (input.payment_method === PAYMENT_METHOD.CARD) {
      takeDemoPayment(total);
      paymentStatus = PAYMENT_STATUS.PAID;
    }

    // 6. Save the order and its lines together (both or neither)
    const orderId = await runInTransaction(async (connection) => {
      const [result] = await connection.query(
        `INSERT INTO preorders
           (patient_id, note, total_price, payment_method, payment_status,
            prescription_status, prescription_path, prescription_mime)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          patient.id,
          input.note,
          total,
          input.payment_method,
          paymentStatus,
          needsPrescription ? PRESCRIPTION_STATUS.WAITING : PRESCRIPTION_STATUS.NOT_NEEDED,
          prescription ? prescription.path : null,
          prescription ? prescription.mime : null,
        ]
      );
      for (const line of orderLines) {
        await connection.query(
          'INSERT INTO preorder_items (preorder_id, medication_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
          [result.insertId, line.medication_id, line.quantity, line.unit_price]
        );
      }
      return result.insertId;
    });

    return hideStockLevels(await findOrderById(orderId));
  } catch (error) {
    // The order was not saved: remove the photo again so no orphan file is left behind
    if (prescription) {
      await deleteStoredImage(prescription.path).catch(() => {});
    }
    throw error;
  }
}

// A patient cancels their own order; only possible while it is still pending.
// Someone else's order answers 404, exactly like one that does not exist.
export async function cancelOwnPreorder(id, patient) {
  // One UPDATE that only matches the patient's own pending order. Doing it in one
  // statement means it cannot slip past a staff member marking it ready at the same moment.
  // A card payment that was already taken becomes "refunded".
  const [result] = await db.query(
    `UPDATE preorders
     SET status = 'cancelled',
         payment_status = IF(payment_status = 'paid', 'refunded', payment_status)
     WHERE id = ? AND patient_id = ? AND status = 'pending'`,
    [id, patient.id]
  );
  if (result.affectedRows > 0) {
    return hideStockLevels(await findOrderById(id));
  }

  // Nothing changed: work out why
  const existing = await findOrderById(id);
  if (!existing || existing.patient_id !== patient.id) {
    throw preorderNotFound();
  }
  throw createError(409, 'Only a pending order can be cancelled', { code: ERROR_CODES.PREORDER_NOT_CANCELLABLE });
}

// ----------------------------------------------------------------------------
// Moving an order on (staff)
// ----------------------------------------------------------------------------

// Reads one order's header inside a transaction and locks it (FOR UPDATE), so two staff
// members cannot change the same order at the same moment. Throws 404 if it does not exist.
async function lockOrder(connection, id) {
  const [rows] = await connection.query(
    `SELECT id, patient_id, status, payment_method, payment_status, prescription_status
     FROM preorders WHERE id = ? FOR UPDATE`,
    [id]
  );
  if (!rows[0]) {
    throw preorderNotFound();
  }
  return rows[0];
}

// The lines of one order, lowest medication id first (the same order every sale uses to
// lock stock rows, so a collection and a sale can never block each other).
async function getOrderLines(connection, orderId) {
  const [rows] = await connection.query(
    `SELECT i.medication_id, i.quantity, m.name AS medication_name
     FROM preorder_items i JOIN medications m ON m.id = i.medication_id
     WHERE i.preorder_id = ? ORDER BY i.medication_id ASC`,
    [orderId]
  );
  return rows;
}

// Staff move an order to its next status. `newStatus` is already validated.
// Returns the updated order.
export async function changePreorderStatus(id, newStatus) {
  await runInTransaction(async (connection) => {
    // 1. Read the order and lock it
    const order = await lockOrder(connection, id);

    // 2. Only allowed moves (e.g. pending -> collected is not allowed)
    if (!canChangeStatus(order.status, newStatus)) {
      throw createError(400, `A ${order.status} order cannot become ${newStatus}`, {
        code: ERROR_CODES.PREORDER_INVALID_TRANSITION,
        params: { from: order.status, to: newStatus },
      });
    }

    const lines = await getOrderLines(connection, id);
    let newPaymentStatus = order.payment_status;

    // 3. Marking it ready: the prescription (if any) must be approved, and every line
    //    must be on the shelf right now
    if (newStatus === PREORDER_STATUS.READY) {
      if (order.prescription_status === PRESCRIPTION_STATUS.WAITING) {
        throw createError(409, 'Check the prescription before marking this order ready', {
          code: ERROR_CODES.PRESCRIPTION_NOT_APPROVED,
        });
      }
      for (const line of lines) {
        const batches = await findBatchesOfMedication(line.medication_id, connection);
        const available = countSellableUnits(batches);
        if (available < line.quantity) {
          throw createError(409, `Not enough stock of ${line.medication_name} for this order`, {
            code: ERROR_CODES.PREORDER_STOCK_SHORT,
            params: { name: line.medication_name, count: available, needed: line.quantity },
          });
        }
      }
    }

    // 4. Marking it collected: sell every line, exactly like the Dispense page does.
    //    One line that cannot be filled undoes the whole collection.
    if (newStatus === PREORDER_STATUS.COLLECTED) {
      for (const line of lines) {
        try {
          // true = a medication discontinued after the order was placed can still be collected
          await dispenseLine(connection, line, todayAsText(), true);
        } catch (error) {
          // Not enough stock now is a conflict with the current stock (409), not a bad request
          if (error.code === ERROR_CODES.STOCK_INSUFFICIENT) {
            throw createError(409, error.message, { code: error.code, params: error.params });
          }
          throw error;
        }
      }
      // A cash order is paid at the counter when it is collected
      newPaymentStatus = PAYMENT_STATUS.PAID;
    }

    // 5. Cancelling: a card payment that was already taken is refunded (demo)
    if (newStatus === PREORDER_STATUS.CANCELLED && order.payment_status === PAYMENT_STATUS.PAID) {
      newPaymentStatus = PAYMENT_STATUS.REFUNDED;
    }

    // 6. Save the new status
    await connection.query('UPDATE preorders SET status = ?, payment_status = ? WHERE id = ?', [
      newStatus,
      newPaymentStatus,
      id,
    ]);
  });

  return findOrderById(id);
}

// ----------------------------------------------------------------------------
// Prescriptions
// ----------------------------------------------------------------------------

// Staff approve or reject the prescription of a pending order.
// `input` is already validated (prescriptionDecisionSchema): { decision, reason }.
// A rejection cancels the order (refunding a card payment) and keeps the reason for the patient.
// Returns the updated order.
export async function decidePrescription(id, input) {
  await runInTransaction(async (connection) => {
    const order = await lockOrder(connection, id);

    // Only a pending order whose prescription is still waiting can be decided
    const isWaiting =
      order.status === PREORDER_STATUS.PENDING && order.prescription_status === PRESCRIPTION_STATUS.WAITING;
    if (!isWaiting) {
      throw createError(409, 'This order has no prescription waiting to be checked', {
        code: ERROR_CODES.PRESCRIPTION_NOT_WAITING,
      });
    }

    if (input.decision === 'approve') {
      await connection.query('UPDATE preorders SET prescription_status = ? WHERE id = ?', [
        PRESCRIPTION_STATUS.APPROVED,
        id,
      ]);
      return;
    }

    // Rejected: the order is cancelled, and a payment already taken is refunded
    const paymentStatus =
      order.payment_status === PAYMENT_STATUS.PAID ? PAYMENT_STATUS.REFUNDED : order.payment_status;
    await connection.query(
      `UPDATE preorders
       SET prescription_status = ?, prescription_reason = ?, status = ?, payment_status = ?
       WHERE id = ?`,
      [PRESCRIPTION_STATUS.REJECTED, input.reason, PREORDER_STATUS.CANCELLED, paymentStatus, id]
    );
  });

  return findOrderById(id);
}

// Finds an order's prescription photo for download.
// Only staff and the patient who placed the order may see it; anyone else gets the same
// 404 as for an order that does not exist. Returns { filePath, mime }.
export async function getPrescriptionForDownload(id, user) {
  const [rows] = await db.query(
    'SELECT patient_id, prescription_path, prescription_mime FROM preorders WHERE id = ?',
    [id]
  );
  const order = rows[0];
  const mayView = order && (user.role === ROLES.STAFF || order.patient_id === user.id);
  if (!mayView || !order.prescription_path) {
    throw preorderNotFound();
  }

  // storedImagePath refuses any name we did not create ourselves
  const filePath = storedImagePath(order.prescription_path);
  if (!filePath) {
    throw preorderNotFound();
  }
  return { filePath, mime: order.prescription_mime };
}
