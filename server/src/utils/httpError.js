/**
 * Error type carrying an HTTP status code so services can signal "not found",
 * "validation failed", etc. without knowing about Express.
 */
class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

module.exports = HttpError;
