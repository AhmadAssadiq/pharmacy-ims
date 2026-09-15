const medicationService = require('../services/medicationService');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');

function parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid medication id');
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

const updateQuantity = asyncHandler(async (req, res) => {
  const medication = await medicationService.updateQuantity(parseId(req.params.id), req.body);
  res.json({ medication });
});

const remove = asyncHandler(async (req, res) => {
  await medicationService.deleteMedication(parseId(req.params.id));
  res.status(204).end();
});

module.exports = { list, get, create, update, updateQuantity, remove };
