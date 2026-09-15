const availabilityService = require('../services/availabilityService');
const asyncHandler = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  res.json({ medications: await availabilityService.listAvailability() });
});

module.exports = { list };
