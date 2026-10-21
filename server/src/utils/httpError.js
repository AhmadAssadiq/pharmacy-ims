/**
 * Error type carrying an HTTP status code so services can signal "not found",
 * "validation failed", etc. without knowing about Express.
 *
 * `code` (one of ERROR_CODES in shared/constants.json) and `params` let the
 * client show the message in the user's language; `message` stays as the
 * English fallback. Only errors a user can actually see carry a code.
 */
class HttpError extends Error {
  constructor(status, message, details, { code, params } = {}) {
    super(message);
    this.status = status;
    this.details = details;
    this.code = code;
    this.params = params;
  }
}

module.exports = HttpError;
