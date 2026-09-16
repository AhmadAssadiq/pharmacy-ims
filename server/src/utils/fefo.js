/**
 * First-Expired-First-Out stock allocation (FR 3, UC-1).
 *
 * Decides how much to take from each batch when dispensing: the lot closest to
 * expiry is consumed first, and expired lots are never dispensed. Pure function
 * with no database access so the allocation rules can be unit tested directly.
 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toDayString(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

/** Batches that can still be dispensed, nearest expiry first. */
function sellableBatches(batches, today = new Date()) {
  const cutoff = toDayString(today);
  return batches
    .filter((batch) => Number(batch.quantity) > 0 && toDayString(batch.expiry_date) >= cutoff)
    .sort((a, b) => toDayString(a.expiry_date).localeCompare(toDayString(b.expiry_date)));
}

/**
 * Allocates `quantity` units across `batches`.
 * Returns the per-batch draw plus any `shortfall` left unfilled.
 */
function allocate(batches, quantity, { today = new Date() } = {}) {
  let remaining = Number(quantity);
  const allocations = [];

  for (const batch of sellableBatches(batches, today)) {
    if (remaining <= 0) break;
    const take = Math.min(Number(batch.quantity), remaining);
    allocations.push({
      batch_id: batch.id,
      take,
      expiry_date: toDayString(batch.expiry_date),
      remaining_after: Number(batch.quantity) - take,
    });
    remaining -= take;
  }

  return { allocations, shortfall: Math.max(remaining, 0) };
}

/** Total units that can actually be dispensed today. */
function sellableQuantity(batches, today = new Date()) {
  return sellableBatches(batches, today).reduce((sum, batch) => sum + Number(batch.quantity), 0);
}

module.exports = { allocate, sellableBatches, sellableQuantity, MS_PER_DAY };
