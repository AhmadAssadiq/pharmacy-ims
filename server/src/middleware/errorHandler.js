// The last middleware in app.js: every error thrown in a route ends up here and is
// turned into a JSON answer for the React app, for example:
//   { "error": "Medication not found", "code": "MEDICATION_NOT_FOUND" }
// - error:   an English message
// - code:    a fixed code the React app uses to show the message in English or Arabic
// - params:  values for that message (e.g. how many minutes until an account unlocks)
// - details: per-field messages for forms (e.g. { "name": "Name is required" })
// Unexpected errors (bugs, database problems) are logged here and shown only as
// "Internal server error", so no internal details leak to the browser.
import { ERROR_CODES } from '../constants.js';

// Express knows this is an error handler because it takes 4 arguments.
// eslint-disable-next-line no-unused-vars
export function errorHandler(error, req, res, next) {
  // The request body was not valid JSON
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON', code: ERROR_CODES.INVALID_JSON });
  }

  // Errors made with createError(...) carry a status; anything else is an unexpected 500
  const status = error.status || 500;

  if (status >= 500) {
    console.error(error);
    const body = { error: 'Internal server error', code: ERROR_CODES.INTERNAL };
    if (error.details) body.details = error.details;
    return res.status(status).json(body);
  }

  const body = { error: error.message };
  if (error.code) body.code = error.code;
  if (error.params) body.params = error.params;
  if (error.details) body.details = error.details;
  return res.status(status).json(body);
}
