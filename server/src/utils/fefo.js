// FEFO = "First Expired, First Out" (FR 3, UC-1).
// When we sell a medication we take units from the stock lot that expires soonest,
// so short-dated stock leaves the shelf before it goes bad. Expired lots are never sold.
//
// Worked example - selling 30 units when these lots are on the shelf:
//   lot A: 20 units, expires 2026-10-11
//   lot B: 25 units, expires 2027-04-14
//   lot C: 12 units, expired 2026-09-06   (expired, so skipped)
// Result: take 20 from lot A (it expires first), then 10 from lot B. Nothing is missing.
import { todayAsText } from './dates.js';

// The lots that can still be sold today (units left and not expired), soonest expiry first.
export function findSellableBatches(batches, todayText = todayAsText()) {
  const sellable = [];
  for (const batch of batches) {
    const expiryDate = String(batch.expiry_date).slice(0, 10);
    const hasUnits = Number(batch.quantity) > 0;
    const isNotExpired = expiryDate >= todayText; // a lot expiring today can still be sold
    if (hasUnits && isNotExpired) {
      sellable.push(batch);
    }
  }

  // Sort so the lot with the earliest expiry date comes first
  sellable.sort((first, second) => String(first.expiry_date).localeCompare(String(second.expiry_date)));
  return sellable;
}

// Total number of units that can be sold today.
export function countSellableUnits(batches, todayText = todayAsText()) {
  let total = 0;
  for (const batch of findSellableBatches(batches, todayText)) {
    total += Number(batch.quantity);
  }
  return total;
}

// Decides how many units to take from each lot to sell `quantity` units.
// Returns:
//   allocations - one entry per lot used: { batch_id, take, expiry_date, remaining_after }
//   shortfall   - how many units could NOT be found (0 when there is enough stock)
export function allocateUnits(batches, quantity, todayText = todayAsText()) {
  let unitsStillNeeded = Number(quantity);
  const allocations = [];

  for (const batch of findSellableBatches(batches, todayText)) {
    // Stop once we have found every unit we need
    if (unitsStillNeeded <= 0) {
      break;
    }

    // Take as much as this lot has, but no more than we still need
    const unitsInBatch = Number(batch.quantity);
    const take = Math.min(unitsInBatch, unitsStillNeeded);

    allocations.push({
      batch_id: batch.id,
      take: take,
      expiry_date: String(batch.expiry_date).slice(0, 10),
      remaining_after: unitsInBatch - take,
    });
    unitsStillNeeded -= take;
  }

  return { allocations, shortfall: Math.max(unitsStillNeeded, 0) };
}
