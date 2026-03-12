import redisClient from "../config/redis.js";
import { getFcmMessaging } from "../config/fcm.js";

const KEY_PREFIX = "fcm:tokens:"; // per-user set of tokens
const REVERSE_KEY_PREFIX = "fcm:token-owner:"; // reverse index: token → userId

export async function registerFcmToken(userId, token, platform = "unknown") {
  if (!userId || !token) return { registered: 0 };
  if (!redisClient.isOpen) await redisClient.connect();
  const res = await redisClient.sAdd(KEY_PREFIX + userId, token);
  return { registered: res };

  // ── Dedup: ensure a device token belongs to only ONE user ──
  const previousOwner = await redisClient.get(REVERSE_KEY_PREFIX + token);
  if (previousOwner && previousOwner !== String(userId)) {
    // Remove the token from the old user's set
    await redisClient.sRem(KEY_PREFIX + previousOwner, token);
    console.log(`[FCM] Token migrated from user ${previousOwner} → ${userId}`);
  }

  // We store the token in a Redis Hash so we can store metadata like `platform`
  // But to keep backwards compatibility with sMembers, we can store a JSON string
  const tokenData = JSON.stringify({ token, platform });

  // Clean up any old tokens that don't have JSON format to prevent duplicates
  const existingTokens = await redisClient.sMembers(KEY_PREFIX + userId);
  for (const t of existingTokens) {
    if (t === token || (t.startsWith('{') && JSON.parse(t).token === token)) {
      await redisClient.sRem(KEY_PREFIX + userId, t);
    }
  }

  await redisClient.sAdd(KEY_PREFIX + userId, tokenData);
  await redisClient.set(REVERSE_KEY_PREFIX + token, String(userId));
  return { registered: 1 };
}

export async function unregisterFcmToken(userId, token) {
  if (!userId || !token) return { removed: 0 };
  if (!redisClient.isOpen) await redisClient.connect();

  const existingTokens = await redisClient.sMembers(KEY_PREFIX + userId);
  let removedCount = 0;
  for (const t of existingTokens) {
    if (t === token || (t.startsWith('{') && JSON.parse(t).token === token)) {
      removedCount += await redisClient.sRem(KEY_PREFIX + userId, t);
    }
  }

  // Clean up reverse index
  if (removedCount > 0) {
    await redisClient.del(REVERSE_KEY_PREFIX + token);
  }
  return { removed: removedCount > 0 ? 1 : 0 };
}

export async function getUserFcmTokens(userId, targetPlatform = null) {
  if (!userId) return [];
  if (!redisClient.isOpen) await redisClient.connect();
  const rawTokens = await redisClient.sMembers(KEY_PREFIX + userId);
  if (!rawTokens) return [];

  const validTokens = [];
  for (const raw of rawTokens) {
    try {
      if (raw.startsWith('{')) {
        const data = JSON.parse(raw);
        if (!targetPlatform || data.platform === targetPlatform) {
          validTokens.push(data.token);
        }
      } else {
        // Legacy raw token - assume web if not specified otherwise
        if (!targetPlatform || targetPlatform === "web") {
          validTokens.push(raw);
        }
      }
    } catch (e) {
      if (!targetPlatform || targetPlatform === "web") validTokens.push(raw);
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
    console.warn(`[FCM] No tokens for users: ${userIds.join(",")}`);
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
