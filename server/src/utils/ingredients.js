// Small helpers for active ingredients (GP2 addition).
// Alternatives and the interaction check both compare medications by their active
// ingredient, so "Paracetamol", " paracetamol " and "PARACETAMOL" must count as the same.

// The ingredient in lower case without spaces around it: ' Paracetamol ' -> 'paracetamol'.
export function normaliseIngredient(ingredient) {
  return String(ingredient ?? '').trim().toLowerCase();
}

// Two ingredients in alphabetical order, both normalised.
// The medication_interactions table stores every pair this way round, so a pair is found
// with one lookup: sortIngredientPair('Warfarin', 'Aspirin') -> ['aspirin', 'warfarin'].
export function sortIngredientPair(first, second) {
  const pair = [normaliseIngredient(first), normaliseIngredient(second)];
  pair.sort();
  return pair;
}
