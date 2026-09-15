const forecastService = require('../services/forecastService');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');

const list = asyncHandler(async (req, res) => {
  res.json({ alerts: await forecastService.listActiveAlerts() });
});

const dismiss = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid alert id');
  res.json({ alert: await forecastService.dismissAlert(id) });
});

module.exports = { list, dismiss };
