/**
 * Validation for chat messages.
 */
const MAX_MESSAGE_LENGTH = 2000;

function validateMessageContent(raw) {
  const content = String(raw ?? '').trim();
  if (!content) return { valid: false, error: 'Message cannot be empty' };
  if (content.length > MAX_MESSAGE_LENGTH) {
    return { valid: false, error: `Message must be at most ${MAX_MESSAGE_LENGTH} characters` };
  }
  return { valid: true, value: content };
}

module.exports = { validateMessageContent, MAX_MESSAGE_LENGTH };
