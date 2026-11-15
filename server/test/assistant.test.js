// Tests for Rafiq, the AI assistant (services/assistantService.js) - GP2 addition.
// The database and the call to DeepSeek are both replaced by fakes, so these tests need
// no MySQL, no internet and no API key (and they never spend any of the key's balance).
import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/db.js';
import { config } from '../src/config.js';
import { buildSystemPrompt, askAssistant } from '../src/services/assistantService.js';

const AMOXICILLIN = {
  id: 3,
  name: 'Amoxicillin 500mg',
  category: 'Antibiotic',
  active_ingredient: 'Amoxicillin',
  unit_price: '4.80',
  quantity: 42,
  low_stock_threshold: 15,
  requires_prescription: true,
  alternatives: [],
};
const IBUPROFEN_200 = {
  id: 13,
  name: 'Ibuprofen 200mg',
  category: 'Analgesic',
  active_ingredient: 'Ibuprofen',
  unit_price: '1.60',
  quantity: 0,
  low_stock_threshold: 10,
  requires_prescription: false,
  alternatives: [{ id: 2, name: 'Ibuprofen 400mg', reason: 'same_ingredient' }],
};
const CATALOGUE = [AMOXICILLIN, IBUPROFEN_200];

// ---- the instructions given to the model ----

test('a patient gets "in stock" or "out of stock", never the number of units', () => {
  const prompt = buildSystemPrompt('patient', CATALOGUE);
  assert.match(prompt, /Amoxicillin 500mg \| price 4\.80 \| ingredient: Amoxicillin \| Antibiotic \| prescription-only \| in stock/);
  assert.match(prompt, /Ibuprofen 200mg .* out of stock \| alternatives in stock: Ibuprofen 400mg/);
  assert.doesNotMatch(prompt, /42 in stock/);
  assert.match(prompt, /talking to a patient/);
});

test('staff also get the quantities', () => {
  const prompt = buildSystemPrompt('staff', CATALOGUE);
  assert.match(prompt, /42 in stock \(reorder at 15\)/);
  assert.match(prompt, /member of the pharmacy staff/);
});

test('the instructions tell Rafiq what to refuse and what to do in an emergency', () => {
  const prompt = buildSystemPrompt('patient', CATALOGUE);
  assert.match(prompt, /Do not diagnose/);
  assert.match(prompt, /start, stop or change the dose/);
  assert.match(prompt, /overdose/);
  assert.match(prompt, /call 911/);
  assert.match(prompt, /language of the question/);
});

// ---- asking a question ----

// Replaces the database: remembers every INSERT and answers the SELECTs the service makes.
function fakeDatabase(t, history = []) {
  const saved = [];
  t.mock.method(db, 'query', async (sql, params) => {
    if (sql.startsWith('INSERT INTO assistant_messages')) {
      saved.push({ id: saved.length + 1, role: params[1], content: params[2] });
      return [{ insertId: saved.length }];
    }
    if (sql.includes('FROM assistant_messages WHERE id = ?')) {
      return [[saved[params[0] - 1]]];
    }
    if (sql.includes('FROM assistant_messages')) {
      return [[...history].reverse()]; // the service asks for the newest first
    }
    return [[]]; // the medication catalogue: empty is fine here
  });
  return saved;
}

// Replaces the call to DeepSeek with `answer`, and remembers what was sent.
function fakeDeepSeek(t, answer) {
  const sent = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    sent.push({ url, headers: options.headers, body: JSON.parse(options.body) });
    return answer;
  });
  return sent;
}

const PATIENT = { id: 7, name: 'Sara Private', email: 'sara@example.com', phone: '+962790001122', role: 'patient' };

test('a question is sent with the instructions and the earlier messages, and both sides are saved', async (t) => {
  config.assistant.apiKey = 'test-key';
  const saved = fakeDatabase(t, [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hello, how can I help?' },
  ]);
  const sent = fakeDeepSeek(t, {
    ok: true,
    json: async () => ({ choices: [{ message: { content: ' It relieves pain and fever. ' } }] }),
  });

  const result = await askAssistant(PATIENT, '  What is paracetamol for? ');

  // What went to DeepSeek
  assert.equal(sent.length, 1);
  assert.match(sent[0].url, /\/chat\/completions$/);
  assert.equal(sent[0].headers.Authorization, 'Bearer test-key');
  const roles = sent[0].body.messages.map((message) => message.role);
  assert.deepEqual(roles, ['system', 'user', 'assistant', 'user']);
  assert.equal(sent[0].body.messages[3].content, 'What is paracetamol for?');

  // Nothing personal about the patient was sent
  const everythingSent = JSON.stringify(sent[0].body);
  for (const secret of [PATIENT.name, PATIENT.email, PATIENT.phone]) {
    assert.equal(everythingSent.includes(secret), false, `${secret} must not be sent`);
  }

  // Both sides were saved, the answer without the spaces around it
  assert.deepEqual(saved.map((message) => [message.role, message.content]), [
    ['user', 'What is paracetamol for?'],
    ['assistant', 'It relieves pain and fever.'],
  ]);
  assert.equal(result.answer.content, 'It relieves pain and fever.');
});

test('an empty or over-long question is refused before anything is sent', async (t) => {
  config.assistant.apiKey = 'test-key';
  const sent = fakeDeepSeek(t, { ok: true, json: async () => ({}) });
  await assert.rejects(askAssistant(PATIENT, '   '), { status: 400, code: 'MESSAGE_EMPTY' });
  await assert.rejects(askAssistant(PATIENT, 'x'.repeat(2001)), { status: 400, code: 'MESSAGE_TOO_LONG' });
  assert.equal(sent.length, 0);
});

test('without an API key Rafiq is unavailable, and nothing is sent', async (t) => {
  config.assistant.apiKey = '';
  const sent = fakeDeepSeek(t, { ok: true, json: async () => ({}) });
  await assert.rejects(askAssistant(PATIENT, 'Hello'), { status: 503, code: 'ASSISTANT_UNAVAILABLE' });
  assert.equal(sent.length, 0);
});

test('when DeepSeek fails, Rafiq is unavailable and nothing is saved', async (t) => {
  config.assistant.apiKey = 'test-key';
  const saved = fakeDatabase(t);
  t.mock.method(console, 'warn', () => {}); // the service logs each failure; keep the test output quiet

  // DeepSeek answers with an error (for example: the balance has run out)
  fakeDeepSeek(t, { ok: false, status: 402 });
  await assert.rejects(askAssistant(PATIENT, 'Hello'), { status: 503, code: 'ASSISTANT_UNAVAILABLE' });

  // DeepSeek cannot be reached at all (no internet, or it took too long)
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('network down');
  });
  await assert.rejects(askAssistant(PATIENT, 'Hello'), { status: 503, code: 'ASSISTANT_UNAVAILABLE' });

  assert.equal(saved.length, 0);
});
