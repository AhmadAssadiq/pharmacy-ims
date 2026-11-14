// Tests for chat image and voice message checks and password reset emails (GP2 additions).
import test from 'node:test';
import assert from 'node:assert/strict';
import { sendImageMessage, makeDisplayName, detectVoiceType } from '../src/services/chatService.js';
import { buildResetEmail, resetPassword } from '../src/services/passwordResetService.js';

// The first bytes of real image files (enough for the file-type library to recognise them)
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
const SESSION = { id: 1, patient_id: 7, staff_id: null };
const PATIENT = { id: 7, role: 'patient' };

// Sends an image and returns the error it was refused with
async function refusalOf(file, caption) {
  try {
    await sendImageMessage(SESSION, PATIENT, file, caption);
  } catch (error) {
    return error;
  }
  assert.fail('expected the image to be refused');
}

test('an image message needs a file (GP2 addition)', async () => {
  const error = await refusalOf(undefined, '');
  assert.equal(error.status, 400);
  assert.equal(error.code, 'ATTACHMENT_MISSING');
});

test('SVG and text files are refused even when named .png (only the bytes count)', async () => {
  const svg = await refusalOf({ buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), originalname: 'x.png' });
  assert.equal(svg.status, 415);
  assert.equal(svg.code, 'ATTACHMENT_TYPE');
  const text = await refusalOf({ buffer: Buffer.from('hello'), originalname: 'photo.png' });
  assert.equal(text.code, 'ATTACHMENT_TYPE');
});

test('an image over 5 MB is refused with 413', async () => {
  const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
  const error = await refusalOf({ buffer: big, originalname: 'big.png' });
  assert.equal(error.status, 413);
  assert.equal(error.code, 'ATTACHMENT_TOO_LARGE');
});

test('a caption is optional but has the 2000-character message limit', async () => {
  const error = await refusalOf({ buffer: PNG, originalname: 'a.png' }, 'x'.repeat(2001));
  assert.equal(error.code, 'MESSAGE_TOO_LONG');
});

test('the download name has no folders or risky characters, and the real extension', () => {
  assert.equal(makeDisplayName('C:\\Users\\me\\photo.svg', 'png'), 'photo.png');
  assert.equal(makeDisplayName('../../etc/"evil";.jpg', 'jpg'), 'evil.jpg');
  assert.equal(makeDisplayName('صورة الدواء.png', 'png'), 'صورة الدواء.png');
  assert.equal(makeDisplayName('', 'gif'), 'image.gif');
});

test('the reset email has the link and how long it lasts, in English or Arabic', () => {
  const english = buildResetEmail('en', { name: 'Sara', link: 'http://x/reset?token=abc', minutes: 15 });
  assert.match(english.subject, /Reset your DawaDesk password/);
  assert.match(english.text, /Hello Sara/);
  assert.match(english.text, /http:\/\/x\/reset\?token=abc/);
  assert.match(english.text, /expires in 15 minutes/);

  const arabic = buildResetEmail('ar', { name: 'سارة', link: 'http://x/reset?token=abc', minutes: 15 });
  assert.match(arabic.text, /مرحبًا سارة/);
  assert.match(arabic.text, /http:\/\/x\/reset\?token=abc/);
});

test('a badly formed reset token is reported as an invalid link', async () => {
  await assert.rejects(resetPassword({ token: 'abc', password: 'newpassword' }), {
    status: 400,
    code: 'RESET_TOKEN_INVALID',
  });
  await assert.rejects(resetPassword(undefined), { code: 'RESET_TOKEN_INVALID' });
});

// ---- voice messages (GP2 addition) ----

test('a voice recording is recognised by its bytes, whichever browser made it', async () => {
  // Chrome and Edge: a WebM file (it starts with an EBML header naming the "webm" type)
  const webm = Buffer.from([
    0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81, 0x04, 0x42, 0xf3,
    0x81, 0x08, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d, 0x42, 0x87, 0x81, 0x04, 0x42, 0x85, 0x81, 0x02, 0x18, 0x53,
    0x80, 0x67,
  ]);
  assert.deepEqual(await detectVoiceType(webm), { extension: 'webm', mime: 'audio/webm' });

  // Firefox: an Ogg file holding Opus audio
  const ogg = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(24), Buffer.from('OpusHead'), Buffer.alloc(20)]);
  assert.deepEqual(await detectVoiceType(ogg), { extension: 'ogg', mime: 'audio/ogg' });

  // Safari: MP4 audio
  const m4a = Buffer.concat([Buffer.from([0, 0, 0, 0x1c]), Buffer.from('ftypM4A '), Buffer.alloc(16)]);
  assert.deepEqual(await detectVoiceType(m4a), { extension: 'm4a', mime: 'audio/mp4' });
});

test('anything that is not a recording is refused as a voice message', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  assert.equal(await detectVoiceType(png), null);
  assert.equal(await detectVoiceType(Buffer.from('just some text')), null);
});
