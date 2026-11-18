interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const stores = new Map<string, Map<string, RateLimitEntry>>();

/**
 * Clean, lightweight in-memory sliding rate limiter.
 * @param bucket Name of the rate-limit bucket (e.g. 'auth-ip', 'lookup-user')
 * @param key Unique key (e.g. IP address, User ID)
 * @param maxRequests Maximum requests allowed within windowMs
 * @param windowMs Time window in milliseconds
 * @returns true if allowed, false if rate limit exceeded
 */
export function checkRateLimit(
  bucket: string,
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetInMs: number } {
  let store = stores.get(bucket);
  if (!store) {
    store = new Map<string, RateLimitEntry>();
    stores.set(bucket, store);
  }

  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetInMs: windowMs };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetInMs: entry.resetAt - now };
  }

  entry.count += 1;
  return { allowed: true, remaining: maxRequests - entry.count, resetInMs: entry.resetAt - now };
}

// Periodically clean up expired entries every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const store of stores.values()) {
    for (const [key, entry] of store.entries()) {
      if (entry.resetAt <= now) {
        store.delete(key);
      }
    }
  }
}, 5 * 60 * 1000).unref();
