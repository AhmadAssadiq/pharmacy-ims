/**
 * Final Express error handler: converts HttpError instances into JSON
 * responses and hides internal details of unexpected errors. `code` and
 * `params` travel with the English `error` so the client can translate it.
 */
const { ERROR_CODES } = require('../../../shared/constants.json');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Malformed JSON body
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON', code: ERROR_CODES.INVALID_JSON });
  }

  const status = err.status || 500;
  if (status >= 500) console.error(err);

  const internal = status >= 500;
  const body = { error: internal ? 'Internal server error' : err.message };
  const code = internal ? ERROR_CODES.INTERNAL : err.code;
  if (code) body.code = code;
  if (!internal && err.params) body.params = err.params;
  if (err.details) body.details = err.details;
  return res.status(status).json(body);
}

module.exports = errorHandler;
