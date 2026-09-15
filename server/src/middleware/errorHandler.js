/**
 * Final Express error handler: converts HttpError instances into JSON
 * responses and hides internal details of unexpected errors.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Malformed JSON body
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON' });
  }

  const status = err.status || 500;
  if (status >= 500) console.error(err);

  const body = { error: status >= 500 ? 'Internal server error' : err.message };
  if (err.details) body.details = err.details;
  return res.status(status).json(body);
}

module.exports = errorHandler;
