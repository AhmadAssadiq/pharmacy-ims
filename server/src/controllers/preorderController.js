const preorderService = require('../services/preorderService');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');

function parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid preorder id');
  return id;
}

/** Patient: request an out-of-stock medication. */
const create = asyncHandler(async (req, res) => {
  res.status(201).json({ preorder: await preorderService.createPreorder(req.user, req.body) });
});

/** Patient: their own requests only. */
const listMine = asyncHandler(async (req, res) => {
  res.json({ preorders: await preorderService.listForPatient(req.user.id) });
});

/** Patient: cancel their own pending request. */
const cancel = asyncHandler(async (req, res) => {
  res.json({ preorder: await preorderService.cancelOwn(parseId(req.params.id), req.user) });
});

/** Staff: every request, newest first, optionally filtered by ?status=. */
const list = asyncHandler(async (req, res) => {
  res.json({ preorders: await preorderService.listAll(req.query) });
});

/** Staff: move a request to its next status. */
const updateStatus = asyncHandler(async (req, res) => {
  res.json({ preorder: await preorderService.updateStatus(parseId(req.params.id), req.body) });
});

module.exports = { create, listMine, cancel, list, updateStatus };
