const forecastService = require('../services/forecastService');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');

const get = asyncHandler(async (req, res) => {
  const id = Number(req.params.medicationId);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid medication id');
  res.json({ forecast: await forecastService.getMedicationForecast(id) });
});

module.exports = { get };
