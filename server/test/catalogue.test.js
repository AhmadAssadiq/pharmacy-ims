// Tests for the catalogue helpers added in GP2: alternatives for an out-of-stock medication
// and the active-ingredient helpers (utils/alternatives.js, utils/ingredients.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { findAlternatives, addAlternatives } from '../src/utils/alternatives.js';
import { normaliseIngredient, sortIngredientPair } from '../src/utils/ingredients.js';
import { findInteractions } from '../src/services/interactionService.js';
import { buildNotificationItems } from '../src/services/notificationService.js';

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

// ---- the interaction check (services/interactionService.js) ----

const KNOWN_INTERACTIONS = [
  { ingredient_a: 'aspirin', ingredient_b: 'warfarin', severity: 'major', description_en: 'Bleeding risk', description_ar: 'خطر النزيف' },
  { ingredient_a: 'ibuprofen', ingredient_b: 'metformin', severity: 'minor', description_en: 'Kidneys', description_ar: 'الكلى' },
];
const WARFARIN = { id: 1, name: 'Warfarin 5mg', active_ingredient: 'Warfarin' };
const ASPIRIN = { id: 2, name: 'Aspirin 100mg', active_ingredient: 'Aspirin' };
const METFORMIN = { id: 3, name: 'Metformin 850mg', active_ingredient: 'Metformin' };
const IBUPROFEN = { id: 4, name: 'Ibuprofen 400mg', active_ingredient: 'Ibuprofen' };

test('a known interaction is found whichever way round the two medications are given', () => {
  for (const basket of [[WARFARIN, ASPIRIN], [ASPIRIN, WARFARIN]]) {
    const found = findInteractions(basket, KNOWN_INTERACTIONS);
    assert.equal(found.length, 1);
    assert.equal(found[0].type, 'interaction');
    assert.equal(found[0].severity, 'major');
    assert.equal(found[0].description_en, 'Bleeding risk');
  }
});

test('medications with no listed interaction give an empty list', () => {
  assert.deepEqual(findInteractions([WARFARIN, METFORMIN], KNOWN_INTERACTIONS), []);
  assert.deepEqual(findInteractions([WARFARIN], KNOWN_INTERACTIONS), []);
});

test('the same active ingredient twice is reported as a double-dose risk', () => {
  const stronger = { id: 9, name: 'Ibuprofen 200mg', active_ingredient: ' ibuprofen' };
  const found = findInteractions([IBUPROFEN, stronger], KNOWN_INTERACTIONS);
  assert.equal(found.length, 1);
  assert.equal(found[0].type, 'same_ingredient');
  assert.deepEqual(found[0].medication_names, ['Ibuprofen 400mg', 'Ibuprofen 200mg']);
});

test('every pair in a basket is checked, and the worst problem comes first', () => {
  const found = findInteractions([IBUPROFEN, METFORMIN, WARFARIN, ASPIRIN], KNOWN_INTERACTIONS);
  assert.deepEqual(found.map((item) => item.severity), ['major', 'minor']);
  assert.deepEqual(found[0].medication_ids, [1, 2]);
});

// ---- the notification bell (services/notificationService.js) ----

test('the bell lists only the kinds of notification that have something to show', () => {
  const links = { reorder_alerts: '/staff/inventory', unread_chats: '/staff/chat', orders_pending: '/staff/preorders' };
  const items = buildNotificationItems({ reorder_alerts: 3, unread_chats: 0, orders_pending: 1 }, links);
  assert.deepEqual(items, [
    { type: 'reorder_alerts', count: 3, link: '/staff/inventory' },
    { type: 'orders_pending', count: 1, link: '/staff/preorders' },
  ]);
  assert.deepEqual(buildNotificationItems({ reorder_alerts: 0, unread_chats: 0, orders_pending: 0 }, links), []);
});

test('a notification can carry extra details, such as the names of medications back in stock', () => {
  const items = buildNotificationItems(
    { back_in_stock: 2 },
    { back_in_stock: '/patient/availability' },
    { back_in_stock: { names: ['Ibuprofen 200mg', 'Multivitamin Tablets'] } }
  );
  assert.deepEqual(items, [
    { type: 'back_in_stock', count: 2, link: '/patient/availability', names: ['Ibuprofen 200mg', 'Multivitamin Tablets'] },
  ]);
});
