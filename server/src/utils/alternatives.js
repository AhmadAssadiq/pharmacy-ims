// Suggests what to offer instead of a medication that is out of stock (GP2 addition).
//
// Two kinds of alternative, best first:
//   'same_ingredient' - the same active ingredient in another strength or brand
//                       (Ibuprofen 200mg is out -> Ibuprofen 400mg)
//   'same_category'   - a different ingredient used for the same thing
//                       (Cetirizine is out -> Loratadine, both antihistamines).
//                       The screen tells the patient to ask the pharmacist before switching.
// Only medications that are in stock and still sold are suggested.
//
// Worked example - Ibuprofen 200mg (Analgesic) is out of stock and these are in stock:
//   Ibuprofen 400mg (ingredient Ibuprofen, Analgesic), Paracetamol 500mg (Analgesic),
//   Cetirizine 10mg (Antihistamine)
// Result: Ibuprofen 400mg as 'same_ingredient', then Paracetamol 500mg as 'same_category'.
import { normaliseIngredient } from './ingredients.js';

// The most alternatives shown for one medication
const MAX_ALTERNATIVES = 3;

// Returns the alternatives for `medication` out of `allMedications`:
// a list of { id, name, reason }, at most three, same ingredient first.
export function findAlternatives(medication, allMedications) {
  const ingredient = normaliseIngredient(medication.active_ingredient);
  const category = String(medication.category ?? '').trim().toLowerCase();

  const sameIngredient = [];
  const sameCategory = [];
  for (const other of allMedications) {
    // Skip the medication itself, and anything that cannot be sold right now
    const canBeSold = !other.is_discontinued && Number(other.quantity) > 0;
    if (other.id === medication.id || !canBeSold) {
      continue;
    }

    if (ingredient && normaliseIngredient(other.active_ingredient) === ingredient) {
      sameIngredient.push({ id: other.id, name: other.name, reason: 'same_ingredient' });
    } else if (category && String(other.category ?? '').trim().toLowerCase() === category) {
      sameCategory.push({ id: other.id, name: other.name, reason: 'same_category' });
    }
  }

  return [...sameIngredient, ...sameCategory].slice(0, MAX_ALTERNATIVES);
}

// Returns the medications with an `alternatives` list added to each one.
// Only a medication that is out of stock (and still sold) gets suggestions; the others get [].
export function addAlternatives(medications) {
  return medications.map((medication) => {
    const needsAlternatives = !medication.is_discontinued && Number(medication.quantity) <= 0;
    return {
      ...medication,
      alternatives: needsAlternatives ? findAlternatives(medication, medications) : [],
    };
  });
}
