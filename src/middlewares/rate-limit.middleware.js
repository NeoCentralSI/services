/**
 * In-memory rate limit per client IP (fixed one-minute window), without a dependency. Kept per
 * process: enough for a public endpoint of one server, not shared across instances.
 * `req.ip` is the client address: app.js trusts the one proxy in front of the server.
 */
export const RATE_LIMIT_MESSAGE = "Terlalu banyak permintaan. Coba lagi sebentar.";

export function createRateLimit({ limit = 20, windowMs = 60 * 1000, now = () => Date.now() } = {}) {
  const hits = new Map();
  const middleware = (req, res, next) => {
    const key = req.ip || req.socket?.remoteAddress || "unknown";
    const time = now();
    const entry = hits.get(key);
    if (!entry || time >= entry.resetAt) {
      hits.set(key, { count: 1, resetAt: time + windowMs });
    } else {
      entry.count += 1;
      if (entry.count > limit) {
        res.set("Retry-After", String(Math.max(1, Math.ceil((entry.resetAt - time) / 1000))));
        return res.status(429).json({ success: false, message: RATE_LIMIT_MESSAGE });
      }
    }
    // Drop expired windows now and then, so the map stays small.
    if (hits.size > 1000) {
      for (const [ip, value] of hits) if (time >= value.resetAt) hits.delete(ip);
    }
    next();
  };
  middleware.reset = () => hits.clear();
  return middleware;
}
