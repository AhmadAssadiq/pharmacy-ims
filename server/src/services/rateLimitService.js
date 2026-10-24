/**
 * Fixed-window rate limiter for the password reset endpoints (GP2 addition),
 * in the style of loginAttemptService: in memory, keyed by a string such as
 * "ip:127.0.0.1" or "email:sara@example.com", reset on server restart.
 */
function createRateLimiter({ limit, windowMs, now = () => Date.now() }) {
  const windows = new Map(); // key -> { count, resetAt }
  let hits = 0;

  // Expired windows are dropped every so often, so a stream of different
  // emails or addresses cannot grow the map without bound.
  function prune(time) {
    for (const [key, entry] of windows) if (entry.resetAt <= time) windows.delete(key);
  }

  /** Counts one attempt. Returns { allowed, retryAfterMs }. */
  function hit(key) {
    const time = now();
    hits += 1;
    if (hits % 100 === 0) prune(time);
    let entry = windows.get(key);
    if (!entry || entry.resetAt <= time) {
      entry = { count: 0, resetAt: time + windowMs };
      windows.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > limit) return { allowed: false, retryAfterMs: entry.resetAt - time };
    return { allowed: true, retryAfterMs: 0 };
  }

  function reset(key) {
    windows.delete(key);
  }

  return { hit, reset, size: () => windows.size };
}

module.exports = { createRateLimiter };
