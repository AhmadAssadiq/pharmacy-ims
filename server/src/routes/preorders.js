// Routes under /api/preorders: patients order medications ahead of time, staff fulfil the
// orders (GP2 addition). See services/preorderService.js for the whole flow.
import express from 'express';
import multer from 'multer';
import createError from 'http-errors';
import { ROLES, PREORDER_STATUS, ERROR_CODES, CHAT_IMAGE_MAX_BYTES } from '../constants.js';
import { requireLogin, requireRole } from '../middleware/auth.js';
import { validate } from '../validation/validate.js';
import {
  validateOrder,
  preorderStatusSchema,
  prescriptionDecisionSchema,
  validateStatusFilter,
} from '../validation/saleSchemas.js';
import { parseId } from '../utils/parseId.js';
import * as preorderService from '../services/preorderService.js';
import { markOrdersSeen } from '../services/notificationService.js';
import { requestForecastSoon } from '../jobs/forecastJob.js';
import { notifyRoom } from '../socket/chatSocket.js';

const router = express.Router();
router.use(requireLogin);

// After staff change an order: tell the patient's bell (their order is ready, or was
// cancelled) and the staff bell (one order fewer is waiting) to refresh.
function notifyOrderChanged(order) {
  notifyRoom(`user:${order.patient_id}`);
  notifyRoom('staff');
}

// An order is sent as a form, so that a photo of the prescription can come with it.
// multer reads the form: the text fields end up in req.body and the photo (the
// "prescription" field, at most one 5 MB file) in req.file, kept in memory so its bytes
// can be checked before anything is written to disk.
const uploadOrderForm = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CHAT_IMAGE_MAX_BYTES, files: 1, fields: 5, fieldSize: 16 * 1024, parts: 6 },
  defParamCharset: 'utf8', // read file names as UTF-8, so Arabic names are kept correctly
}).single('prescription');

// Middleware: runs multer and turns its errors into the app's error format.
function receiveOrderForm(req, res, next) {
  uploadOrderForm(req, res, (error) => {
    if (!error) {
      return next();
    }
    if (error.code === 'LIMIT_FILE_SIZE') {
      return next(
        createError(413, 'Image is too large', {
          code: ERROR_CODES.ATTACHMENT_TOO_LARGE,
          params: { count: CHAT_IMAGE_MAX_BYTES / (1024 * 1024) },
        })
      );
    }
    return next(createError(400, 'The order form could not be read', { code: ERROR_CODES.VALIDATION_FAILED }));
  });
}

// POST /api/preorders - a patient places an order.
// Form fields: items (JSON text: [{ medication_id, quantity }]), note, payment_method
// ("cash" or "card"), and the file "prescription" when the order needs one.
router.post('/', requireRole(ROLES.PATIENT), receiveOrderForm, async (req, res) => {
  const input = validateOrder(req.body);
  const preorder = await preorderService.createPreorder(req.user, input, req.file);
  notifyRoom('staff'); // the staff bell: a new order is waiting
  res.status(201).json({ preorder });
});

// GET /api/preorders/mine - the patient's own orders (open and past), newest first
router.get('/mine', requireRole(ROLES.PATIENT), async (req, res) => {
  const preorders = await preorderService.getPreordersOfPatient(req.user.id);
  res.json({ preorders });
});

// POST /api/preorders/mine/seen - "I am looking at My orders now": the bell stops
// mentioning orders whose prescription was rejected before this moment
router.post('/mine/seen', requireRole(ROLES.PATIENT), async (req, res) => {
  await markOrdersSeen(req.user.id);
  notifyRoom(`user:${req.user.id}`);
  res.status(204).end();
});

// POST /api/preorders/7/cancel - the patient cancels their own pending order
router.post('/:id/cancel', requireRole(ROLES.PATIENT), async (req, res) => {
  const preorder = await preorderService.cancelOwnPreorder(parseId(req.params.id, 'preorder'), req.user);
  notifyRoom('staff'); // one order fewer is waiting
  res.json({ preorder });
});

// GET /api/preorders?status=pending - staff: every order, newest first (status filter optional)
router.get('/', requireRole(ROLES.STAFF), async (req, res) => {
  const status = validateStatusFilter(req.query.status);
  const preorders = await preorderService.getAllPreorders(status);
  res.json({ preorders });
});

// PATCH /api/preorders/7 - staff move an order on { status }
router.patch('/:id', requireRole(ROLES.STAFF), async (req, res) => {
  const id = parseId(req.params.id, 'preorder');
  const { status } = validate(preorderStatusSchema, req.body);
  const preorder = await preorderService.changePreorderStatus(id, status);

  // A collected order is a sale: update the reorder alerts soon (see jobs/forecastJob.js)
  if (status === PREORDER_STATUS.COLLECTED) {
    requestForecastSoon();
  }

  notifyOrderChanged(preorder);
  res.json({ preorder });
});

// POST /api/preorders/7/prescription - staff approve or reject the prescription
// { decision: 'approve' } or { decision: 'reject', reason }
router.post('/:id/prescription', requireRole(ROLES.STAFF), async (req, res) => {
  const id = parseId(req.params.id, 'preorder');
  const input = validate(prescriptionDecisionSchema, req.body);
  const preorder = await preorderService.decidePrescription(id, input);
  notifyOrderChanged(preorder);
  res.json({ preorder });
});

// GET /api/preorders/7/prescription - the prescription photo. Staff may see every order's
// photo, a patient only their own (checked every time). The headers make sure the browser
// only ever treats it as an image, and never stores it in a shared cache.
router.get('/:id/prescription', async (req, res, next) => {
  const image = await preorderService.getPrescriptionForDownload(parseId(req.params.id, 'preorder'), req.user);
  res.set({
    'Content-Type': image.mime,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cache-Control': 'private, no-store',
  });
  // If the file is missing from the disk, answer a plain 404 (never the file's full path)
  res.sendFile(image.filePath, { cacheControl: false, dotfiles: 'deny' }, (error) => {
    if (error && !res.headersSent) {
      next(createError(404, 'Prescription not found', { code: ERROR_CODES.ATTACHMENT_NOT_FOUND }));
    }
  });
});

export default router;
