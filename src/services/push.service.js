import redisClient from "../config/redis.js";
import { getFcmMessaging } from "../config/fcm.js";

const KEY_PREFIX = "fcm:tokens:"; // per-user set of tokens

export async function registerFcmToken(userId, token) {
  if (!userId || !token) return { registered: 0 };
  if (!redisClient.isOpen) await redisClient.connect();
  const res = await redisClient.sAdd(KEY_PREFIX + userId, token);
  return { registered: res };
}

export async function unregisterFcmToken(userId, token) {
  if (!userId || !token) return { removed: 0 };
  if (!redisClient.isOpen) await redisClient.connect();
  const removed = await redisClient.sRem(KEY_PREFIX + userId, token);
  return { removed };
}

export async function getUserFcmTokens(userId) {
  if (!userId) return [];
  if (!redisClient.isOpen) await redisClient.connect();
  const tokens = await redisClient.sMembers(KEY_PREFIX + userId);
  return tokens || [];
}

export async function sendFcmToUsers(userIds = [], { title, body, data, dataOnly } = {}) {
  const messaging = getFcmMessaging();
  if (!messaging) return { success: false, reason: "fcm-not-configured" };
  const uniqueTokens = new Set();
  for (const uid of userIds) {
    const tokens = await getUserFcmTokens(uid);
    tokens.forEach((t) => uniqueTokens.add(t));
  }
  const tokens = Array.from(uniqueTokens);
  if (!tokens.length) {
    console.warn(`[FCM] No tokens for users: ${userIds.join(",")}`);
    return { success: true, sent: 0 };
  }

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
  const resp = await messaging.sendEachForMulticast(message);
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
    if (!redisClient.isOpen) await redisClient.connect();
    for (const uid of userIds) {
      await redisClient.sRem(KEY_PREFIX + uid, invalidTokens);
    }
  }
  return { success: true, sent: resp.successCount, failed: resp.failureCount };
}
