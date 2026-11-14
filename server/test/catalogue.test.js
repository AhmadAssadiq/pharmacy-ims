// Tests for the catalogue helpers added in GP2: alternatives for an out-of-stock medication
// and the active-ingredient helpers (utils/alternatives.js, utils/ingredients.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { findAlternatives, addAlternatives } from '../src/utils/alternatives.js';
import { normaliseIngredient, sortIngredientPair } from '../src/utils/ingredients.js';

// A small catalogue: one medication per situation
const IBUPROFEN_200 = { id: 1, name: 'Ibuprofen 200mg', category: 'Analgesic', active_ingredient: 'Ibuprofen', quantity: 0 };
const IBUPROFEN_400 = { id: 2, name: 'Ibuprofen 400mg', category: 'Analgesic', active_ingredient: 'ibuprofen ', quantity: 50 };
const PARACETAMOL = { id: 3, name: 'Paracetamol 500mg', category: 'analgesic', active_ingredient: 'Paracetamol', quantity: 80 };
const CETIRIZINE = { id: 4, name: 'Cetirizine 10mg', category: 'Antihistamine', active_ingredient: 'Cetirizine', quantity: 30 };
const CATALOGUE = [IBUPROFEN_200, IBUPROFEN_400, PARACETAMOL, CETIRIZINE];

test('ingredients are compared in lower case without spaces, and a pair is stored in alphabetical order', () => {
  assert.equal(normaliseIngredient('  Paracetamol '), 'paracetamol');
  assert.deepEqual(sortIngredientPair('Warfarin', ' Aspirin'), ['aspirin', 'warfarin']);
  assert.deepEqual(sortIngredientPair('aspirin', 'WARFARIN'), ['aspirin', 'warfarin']);
});

test('alternatives list the same active ingredient first, then the same category', () => {
  assert.deepEqual(findAlternatives(IBUPROFEN_200, CATALOGUE), [
    { id: 2, name: 'Ibuprofen 400mg', reason: 'same_ingredient' },
    { id: 3, name: 'Paracetamol 500mg', reason: 'same_category' },
  ]);
});

test('a medication that is out of stock or discontinued is never suggested', () => {
  const catalogue = [
    IBUPROFEN_200,
    { ...IBUPROFEN_400, quantity: 0 },
    { ...PARACETAMOL, is_discontinued: true },
    CETIRIZINE,
  ];
  assert.deepEqual(findAlternatives(IBUPROFEN_200, catalogue), []);
});

test('at most three alternatives are suggested', () => {
  const catalogue = [IBUPROFEN_200];
  for (let id = 10; id < 16; id++) {
    catalogue.push({ id, name: `Painkiller ${id}`, category: 'Analgesic', active_ingredient: `Ingredient ${id}`, quantity: 5 });
  }
  assert.equal(findAlternatives(IBUPROFEN_200, catalogue).length, 3);
});

test('only an out-of-stock medication that is still sold gets alternatives', () => {
  const withAlternatives = addAlternatives([...CATALOGUE, { ...IBUPROFEN_200, id: 9, is_discontinued: true }]);
  assert.equal(withAlternatives[0].alternatives.length, 2); // Ibuprofen 200mg: out of stock
  assert.deepEqual(withAlternatives[1].alternatives, []); // Ibuprofen 400mg: in stock
  assert.deepEqual(withAlternatives[4].alternatives, []); // discontinued: nobody is offered it
});
