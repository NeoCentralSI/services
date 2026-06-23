import redisClient from "../config/redis.js";
import { getFcmMessaging } from "../config/fcm.js";
import { ENV } from "../config/env.js";

const KEY_PREFIX = "fcm:tokens:"; // per-user set of tokens
const REVERSE_KEY_PREFIX = "fcm:token-owner:"; // reverse index: token → userId

function parseStoredToken(raw) {
  if (!raw) return null;
  if (!raw.startsWith("{")) return { token: raw, platform: "web", raw };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.token) return null;
    return {
      token: parsed.token,
      platform: parsed.platform || "unknown",
      raw,
    };
  } catch {
    return { token: raw, platform: "web", raw };
  }
}

async function removeTokenFromUser(userId, token) {
  if (!userId || !token) return 0;
  const existingTokens = await redisClient.sMembers(KEY_PREFIX + userId);
  let removedCount = 0;
  for (const raw of existingTokens) {
    const parsed = parseStoredToken(raw);
    if (parsed?.token === token) {
      removedCount += await redisClient.sRem(KEY_PREFIX + userId, raw);
    }
  }
  return removedCount;
}

async function ensureRedisAvailable() {
  if (ENV.SKIP_REDIS) return false;
  if (redisClient.isOpen) return true;

  try {
    await redisClient.connect();
    return true;
  } catch (error) {
    if (ENV.NODE_ENV !== "test") {
      console.warn("[FCM] Redis unavailable; skipping push token operation:", error.message);
    }
    return false;
  }
}

export async function registerFcmToken(userId, token, platform = "unknown") {
  if (!userId || !token) return { registered: 0 };
  if (!(await ensureRedisAvailable())) return { registered: 0, skipped: "redis-unavailable" };

  // ── Dedup: ensure a device token belongs to only ONE user ──
  const previousOwner = await redisClient.get(REVERSE_KEY_PREFIX + token);
  if (previousOwner && previousOwner !== String(userId)) {
    await removeTokenFromUser(previousOwner, token);
    console.log(`[FCM] Token migrated from user ${previousOwner} → ${userId}`);
  }

  // Store metadata while keeping backwards compatibility with legacy raw tokens.
  const tokenData = JSON.stringify({ token, platform });
  await removeTokenFromUser(userId, token);

  const registered = await redisClient.sAdd(KEY_PREFIX + userId, tokenData);
  await redisClient.set(REVERSE_KEY_PREFIX + token, String(userId));
  return { registered: registered > 0 ? 1 : 0 };
}

export async function unregisterFcmToken(userId, token) {
  if (!userId || !token) return { removed: 0 };
  if (!(await ensureRedisAvailable())) return { removed: 0, skipped: "redis-unavailable" };

  const removedCount = await removeTokenFromUser(userId, token);

  // Clean up reverse index
  if (removedCount > 0) {
    await redisClient.del(REVERSE_KEY_PREFIX + token);
  }
  return { removed: removedCount > 0 ? 1 : 0 };
}

export async function getUserFcmTokens(userId, targetPlatform = null) {
  if (!userId) return [];
  if (!(await ensureRedisAvailable())) return [];
  const rawTokens = await redisClient.sMembers(KEY_PREFIX + userId);
  if (!rawTokens) return [];

  const validTokens = [];
  for (const raw of rawTokens) {
    const parsed = parseStoredToken(raw);
    if (!parsed) continue;
    if (!targetPlatform || parsed.platform === targetPlatform) {
      validTokens.push(parsed.token);
    }
  }
  return validTokens;
}

export async function sendFcmToUsers(userIds = [], { title, body, data, dataOnly, targetPlatform } = {}) {
  const messaging = getFcmMessaging();
  if (!messaging) return { success: false, reason: "fcm-not-configured" };
  const uniqueTokens = new Set();
  for (const uid of userIds) {
    const tokens = await getUserFcmTokens(uid, targetPlatform);
    tokens.forEach((t) => uniqueTokens.add(t));
  }
  const tokens = Array.from(uniqueTokens);
  if (!tokens.length) {
    console.log(`[FCM] No tokens for users: ${userIds.join(",")}`);
    return { success: true, sent: 0 };
  }

  console.log(`[FCM] Preparing to send to ${tokens.length} token(s), users=${userIds.join(",")}, targetPlatform=${targetPlatform}, dataOnly=${Boolean(dataOnly)}`);
  // For web, to ensure foreground onMessage fires, it's safer to send data-only payloads.
  const payloadData = Object.fromEntries(
    Object.entries({ ...(data || {}), ...(dataOnly ? { title, body } : {}) })
      .filter(([_, v]) => v !== undefined && v !== null)
      .map(([k, v]) => [k, String(v)])
  );
  const message = dataOnly
    ? { data: payloadData, tokens }
    : {
      notification: title || body ? { title: title || undefined, body: body || undefined } : undefined,
      data: payloadData,
      tokens,
    };
  let resp;
  try {
    resp = await messaging.sendEachForMulticast(message);
  } catch (error) {
    console.error("[FCM] Multicast send failed:", error?.message || error);
    return { success: false, reason: "fcm-send-failed", error: error?.message || String(error) };
  }
  console.log(`[FCM] Sent multicast: success=${resp.successCount}, failed=${resp.failureCount}`);
  // Remove invalid tokens
  const invalidTokens = [];
  resp.responses.forEach((r, idx) => {
    if (!r.success) {
      const code = r.error?.code || "";
      const errorMsg = r.error?.message || "unknown error";
      console.error(`[FCM] Failed to send to token ${idx}: ${code} - ${errorMsg}`);
      if (code.includes("registration-token-not-registered") || code.includes("invalid-argument")) {
        invalidTokens.push(tokens[idx]);
      }
    }
  });
  if (invalidTokens.length) {
    if (!(await ensureRedisAvailable())) return { success: true, sent: resp.successCount, failed: resp.failureCount };
    for (const uid of userIds) {
      for (const token of invalidTokens) {
        await removeTokenFromUser(uid, token);
      }
    }
  }
  return { success: true, sent: resp.successCount, failed: resp.failureCount };
}
