const salesService = require('../services/salesService');
const asyncHandler = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  res.json({ sales: await salesService.listRecentSales() });
});

const preview = asyncHandler(async (req, res) => {
  const preview = await salesService.previewSale({
    medication_id: req.query.medication_id,
    quantity: req.query.quantity,
  });
  res.json({ preview });
});

const create = asyncHandler(async (req, res) => {
  res.status(201).json({ sale: await salesService.recordSale(req.body) });
});

module.exports = { list, preview, create };
