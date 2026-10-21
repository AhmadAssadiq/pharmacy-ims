/**
 * Identifies an image by its first bytes (GP2 addition). Pure, unit tested.
 *
 * Only PNG, JPEG, WebP and GIF are recognised. SVG is never recognised: it is
 * XML that can carry script, and it has no fixed signature to check, so any
 * text file - SVG included - comes back null and is refused.
 */
const SIGNATURES = [
  { mime: 'image/png', ext: 'png', test: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  {
    mime: 'image/gif',
    ext: 'gif',
    test: (b) => ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a',
  },
  // RIFF....WEBP: bytes 4-7 are the chunk size, so only 0-3 and 8-11 are fixed.
  { mime: 'image/webp', ext: 'webp', test: (b) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP' },
];

function startsWith(buffer, bytes) {
  return buffer.length >= bytes.length && bytes.every((byte, i) => buffer[i] === byte);
}

function ascii(buffer, start, end) {
  return buffer.length >= end ? buffer.subarray(start, end).toString('latin1') : '';
}

/** Returns { mime, ext } for a recognised image, or null. */
function sniffImage(buffer) {
  if (!buffer || buffer.length === 0) return null;
  const match = SIGNATURES.find((sig) => sig.test(buffer));
  return match ? { mime: match.mime, ext: match.ext } : null;
}

module.exports = { sniffImage };
