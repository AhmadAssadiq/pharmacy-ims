/**
 * Wraps an async Express handler so rejected promises reach the error
 * handler middleware instead of crashing the process.
 */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
