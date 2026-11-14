// Checks a basket of medications for negative interactions (GP2 addition).
//
// Two kinds of problem are reported:
//   'interaction'     - a known interaction between two active ingredients, read from the
//                       medication_interactions table (filled by db/demoInteractions.js)
//   'same_ingredient' - two medications with the SAME active ingredient (for example
//                       Paracetamol 500mg and Paracetamol 1000mg): risk of a double dose
//
// The check only WARNS. It never blocks a sale or an order: the pharmacist decides.
// "No interactions" means "none in our list", which is why the screen says so.
import { db } from '../db.js';
import { normaliseIngredient, sortIngredientPair } from '../utils/ingredients.js';

// Worst first, for sorting the results
const SEVERITY_ORDER = { major: 0, moderate: 1, minor: 2 };

// Finds the problems between `medications`: [{ id, name, active_ingredient }].
// `knownInteractions` are the rows of medication_interactions:
//   [{ ingredient_a, ingredient_b, severity, description_en, description_ar }]
// Every pair of medications is looked at once. Returns a list, worst first, of
//   { type, severity, medication_ids, medication_names, ingredient, description_en, description_ar }
// (`ingredient` is only set for 'same_ingredient'; the descriptions only for 'interaction').
export function findInteractions(medications, knownInteractions) {
  // Put the known interactions in a lookup: 'aspirin|warfarin' -> the row
  const knownByPair = {};
  for (const row of knownInteractions) {
    knownByPair[`${row.ingredient_a}|${row.ingredient_b}`] = row;
  }

  const found = [];
  // Compare every medication with every medication after it (each pair once)
  for (let first = 0; first < medications.length; first++) {
    for (let second = first + 1; second < medications.length; second++) {
      const medicationA = medications[first];
      const medicationB = medications[second];
      const pair = {
        medication_ids: [medicationA.id, medicationB.id],
        medication_names: [medicationA.name, medicationB.name],
      };

      // The same active ingredient twice
      const ingredientA = normaliseIngredient(medicationA.active_ingredient);
      const ingredientB = normaliseIngredient(medicationB.active_ingredient);
      if (ingredientA && ingredientA === ingredientB) {
        found.push({ ...pair, type: 'same_ingredient', severity: 'major', ingredient: medicationA.active_ingredient });
        continue;
      }

      // A known interaction between the two ingredients (stored in alphabetical order)
      const [lower, higher] = sortIngredientPair(ingredientA, ingredientB);
      const known = knownByPair[`${lower}|${higher}`];
      if (known) {
        found.push({
          ...pair,
          type: 'interaction',
          severity: known.severity,
          description_en: known.description_en,
          description_ar: known.description_ar,
        });
      }
    }
  }

  found.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return found;
}

// Checks the medications with these ids against each other.
// `medicationIds` is already validated (interactionCheckSchema): a list of ids.
// Returns { checked, interactions } where `checked` is how many medications were compared.
export async function checkInteractions(medicationIds) {
  const [medications] = await db.query(
    'SELECT id, name, active_ingredient FROM medications WHERE id IN (?) ORDER BY name',
    [medicationIds]
  );
  const [knownInteractions] = await db.query(
    'SELECT ingredient_a, ingredient_b, severity, description_en, description_ar FROM medication_interactions'
  );
  return {
    checked: medications.length,
    interactions: findInteractions(medications, knownInteractions),
  };
}
