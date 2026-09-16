const medicationService = require('../services/medicationService');
const batchService = require('../services/batchService');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');

function parseId(raw, label = 'medication') {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, `Invalid ${label} id`);
  return id;
}

const list = asyncHandler(async (req, res) => {
  res.json({ medications: await medicationService.listMedications() });
});

const get = asyncHandler(async (req, res) => {
  res.json({ medication: await medicationService.getMedication(parseId(req.params.id)) });
});

const create = asyncHandler(async (req, res) => {
  const medication = await medicationService.createMedication(req.body);
  res.status(201).json({ medication });
});

const update = asyncHandler(async (req, res) => {
  const medication = await medicationService.updateMedication(parseId(req.params.id), req.body);
  res.json({ medication });
});

const remove = asyncHandler(async (req, res) => {
  await medicationService.deleteMedication(parseId(req.params.id));
  res.status(204).end();
});

const listBatches = asyncHandler(async (req, res) => {
  res.json({ batches: await batchService.listBatches(parseId(req.params.id)) });
});

const addBatch = asyncHandler(async (req, res) => {
  const batch = await batchService.addBatch(parseId(req.params.id), req.body);
  res.status(201).json({ batch });
});

const updateBatch = asyncHandler(async (req, res) => {
  const batch = await batchService.updateBatch(parseId(req.params.batchId, 'batch'), req.body);
  res.json({ batch });
});

const removeBatch = asyncHandler(async (req, res) => {
  await batchService.deleteBatch(parseId(req.params.batchId, 'batch'));
  res.status(204).end();
});

module.exports = { list, get, create, update, remove, listBatches, addBatch, updateBatch, removeBatch };
