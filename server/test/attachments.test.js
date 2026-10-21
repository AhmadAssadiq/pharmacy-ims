const test = require('node:test');
const assert = require('node:assert/strict');
const { sniffImage } = require('../src/utils/imageSniff');
const { validateImageUpload, validateCaption, sanitizeDisplayName } = require('../src/validation/chatValidation');
const { CHAT_IMAGE_MAX_BYTES } = require('../../shared/constants.json');

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46]);
const GIF = Buffer.from('GIF89a\x01\x00\x01\x00', 'latin1');
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
const SVG = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

test('recognises PNG, JPEG, GIF and WebP by their bytes (GP2 addition)', () => {
  assert.deepEqual(sniffImage(PNG), { mime: 'image/png', ext: 'png' });
  assert.deepEqual(sniffImage(JPEG), { mime: 'image/jpeg', ext: 'jpg' });
  assert.deepEqual(sniffImage(GIF), { mime: 'image/gif', ext: 'gif' });
  assert.deepEqual(sniffImage(WEBP), { mime: 'image/webp', ext: 'webp' });
});

test('refuses SVG, other files, truncated headers and nothing at all', () => {
  assert.equal(sniffImage(SVG), null);
  assert.equal(sniffImage(Buffer.from('%PDF-1.7')), null);
  assert.equal(sniffImage(Buffer.from('RIFF\x00\x00\x00\x00WAVE', 'latin1')), null, 'a RIFF that is not WebP');
  assert.equal(sniffImage(PNG.subarray(0, 4)), null);
  assert.equal(sniffImage(Buffer.alloc(0)), null);
  assert.equal(sniffImage(null), null);
});

test('an upload must be present, within the size limit and a sniffed image', () => {
  assert.equal(validateImageUpload({ file: null }).code, 'ATTACHMENT_MISSING');
  assert.equal(validateImageUpload({ file: { buffer: Buffer.alloc(0) } }).code, 'ATTACHMENT_MISSING');
  const big = { buffer: Buffer.alloc(CHAT_IMAGE_MAX_BYTES + 1) };
  assert.equal(validateImageUpload({ file: big, sniffed: { mime: 'image/png' } }).code, 'ATTACHMENT_TOO_LARGE');
  assert.equal(validateImageUpload({ file: { buffer: SVG }, sniffed: sniffImage(SVG) }).code, 'ATTACHMENT_TYPE');
  assert.equal(validateImageUpload({ file: { buffer: PNG }, sniffed: sniffImage(PNG) }).valid, true);
});

test('a caption is optional but shares the message length cap', () => {
  assert.deepEqual(validateCaption(undefined), { valid: true, value: '' });
  assert.equal(validateCaption('  see attached  ').value, 'see attached');
  assert.equal(validateCaption('x'.repeat(2001)).valid, false);
});

test('the display name keeps no path, no header-breaking characters, and the sniffed extension', () => {
  assert.equal(sanitizeDisplayName('C:\\Users\\me\\prescription.svg', 'png'), 'prescription.png');
  assert.equal(sanitizeDisplayName('../../etc/passwd', 'jpg'), 'passwd.jpg');
  assert.equal(sanitizeDisplayName('a"b;c\r\nd.gif', 'gif'), 'abcd.gif');
  assert.equal(sanitizeDisplayName('', 'webp'), 'image.webp');
  assert.equal(sanitizeDisplayName('وصفة طبية.jpeg', 'jpg'), 'وصفة طبية.jpg');
  assert.equal(sanitizeDisplayName('x'.repeat(300), 'png').length, 104);
});

test('Content-Disposition keeps the full name in filename* and a header-safe ASCII copy', () => {
  const { contentDisposition } = require('../src/utils/contentDisposition');
  assert.equal(contentDisposition('scan.png'), `inline; filename="scan.png"; filename*=UTF-8''scan.png`);
  const arabic = contentDisposition('وصفة.jpg');
  assert.match(arabic, /^inline; filename="_+\.jpg"; filename\*=UTF-8''%D9%88/);
  assert.equal(contentDisposition('a"b\\c.gif'), `inline; filename="abc.gif"; filename*=UTF-8''a%22b%5Cc.gif`);
});
