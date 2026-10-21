/**
 * Validation for chat messages and image attachments (FR 5.1, GP2 addition).
 *
 * A message is text, an image, or an image with a caption. The "not empty"
 * rule is: text, or an attachment. An image-only message stores '' as its
 * content, so the column stays NOT NULL. Captions share the 2000-char cap.
 */
const {
  ERROR_CODES,
  CHAT_MESSAGE_MAX_LENGTH: MAX_MESSAGE_LENGTH,
  CHAT_IMAGE_MAX_BYTES,
  CHAT_IMAGE_TYPES,
} = require('../../../shared/constants.json');

const DISPLAY_NAME_MAX_LENGTH = 100;

function tooLong() {
  return {
    valid: false,
    error: `Message must be at most ${MAX_MESSAGE_LENGTH} characters`,
    code: ERROR_CODES.MESSAGE_TOO_LONG,
    params: { count: MAX_MESSAGE_LENGTH },
  };
}

function validateMessageContent(raw) {
  const content = String(raw ?? '').trim();
  if (!content) return { valid: false, error: 'Message cannot be empty', code: ERROR_CODES.MESSAGE_EMPTY };
  if (content.length > MAX_MESSAGE_LENGTH) return tooLong();
  return { valid: true, value: content };
}

/** An image's caption: optional, so an empty one is fine. */
function validateCaption(raw) {
  const caption = String(raw ?? '').trim();
  if (caption.length > MAX_MESSAGE_LENGTH) return tooLong();
  return { valid: true, value: caption };
}

/**
 * The upload itself. `sniffed` is what the bytes say the file is (see
 * utils/imageSniff.js); the client's Content-Type, filename and extension are
 * never consulted. Returns { valid, error, code, params }.
 */
function validateImageUpload({ file, sniffed }) {
  if (!file || !file.buffer || file.buffer.length === 0) {
    return { valid: false, error: 'Choose an image to send', code: ERROR_CODES.ATTACHMENT_MISSING };
  }
  if (file.buffer.length > CHAT_IMAGE_MAX_BYTES) {
    return {
      valid: false,
      error: 'Image is too large',
      code: ERROR_CODES.ATTACHMENT_TOO_LARGE,
      params: { count: CHAT_IMAGE_MAX_BYTES / (1024 * 1024) },
    };
  }
  if (!sniffed || !CHAT_IMAGE_TYPES.includes(sniffed.mime)) {
    return { valid: false, error: 'Only image files can be sent', code: ERROR_CODES.ATTACHMENT_TYPE };
  }
  return { valid: true };
}

/**
 * A safe display name for the Content-Disposition header: the original name
 * without any path, control or quote characters, and with the extension the
 * bytes justify (so "photo.svg" sniffed as PNG becomes "photo.png"). It is
 * shown to nobody but the download dialog and is never part of a file path.
 */
function sanitizeDisplayName(raw, ext) {
  const base = String(raw ?? '')
    .split(/[\\/]/)
    .pop()
    .normalize('NFC')
    .replace(/\.[^.]*$/, '')
    .replace(/[\u0000-\u001f\u007f"<>:|?*%;]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, DISPLAY_NAME_MAX_LENGTH);
  return `${base || 'image'}.${ext}`;
}

module.exports = {
  validateMessageContent,
  validateCaption,
  validateImageUpload,
  sanitizeDisplayName,
  MAX_MESSAGE_LENGTH,
};
