/**
 * Patient-facing availability view (FR 7): exposes only whether each
 * medication is in stock. Exact quantities, prices and supplier details are
 * never included in the response.
 */
const medicationModel = require('../models/medicationModel');

async function listAvailability() {
  const medications = await medicationModel.findAll();
  return medications.map((m) => ({
    id: m.id,
    name: m.name,
    category: m.category,
    in_stock: Number(m.quantity) > 0,
  }));
}

module.exports = { listAvailability };
