import redisClient from "../config/redis.js";
import { getFcmMessaging } from "../config/fcm.js";
import { randomUUID } from "node:crypto";

const KEY_PREFIX = "fcm:tokens:"; // per-user set of tokens
const REVERSE_KEY_PREFIX = "fcm:token-owner:"; // reverse index: token → userId

function maskToken(token) {
  if (!token) return "";
  return token.length > 16 ? `${token.slice(0, 8)}...${token.slice(-8)}` : token;
}

function getStoredToken(raw) {
  if (!raw?.startsWith?.("{")) return raw;
  try {
    return JSON.parse(raw).token || raw;
  } catch {
    return raw;
  }
}

async function removeUserToken(userId, token) {
  const existingTokens = await redisClient.sMembers(KEY_PREFIX + userId);
  let removedCount = 0;
  for (const raw of existingTokens) {
    if (getStoredToken(raw) === token) {
      removedCount += await redisClient.sRem(KEY_PREFIX + userId, raw);
    }
  }
  if (removedCount > 0) {
    await redisClient.del(REVERSE_KEY_PREFIX + token);
  }
  console.log(`[FCM] Removed invalid token user=${userId} token=${maskToken(token)} removed=${removedCount}`);
  return removedCount;
}

export async function registerFcmToken(userId, token, platform = "web") {
  if (!userId || !token) return { registered: 0 };
  try {
    if (!redisClient.isOpen) await redisClient.connect();
  } catch (err) {
    console.error("[FCM] Redis connection failed while registering token:", err.message);
    const error = new Error("Gagal menyimpan token notifikasi: Redis tidak terhubung");
    error.statusCode = 503;
    throw error;
  }

  // ── Dedup: ensure a device token belongs to only ONE user ──
  try {
    const previousOwner = await redisClient.get(REVERSE_KEY_PREFIX + token);
    if (previousOwner && previousOwner !== String(userId)) {
      await removeUserToken(previousOwner, token);
      console.log(`[FCM] Token migrated from user ${previousOwner} → ${userId}`);
    }

    // We store token metadata as JSON while keeping backwards compatibility with raw tokens.
    const tokenData = JSON.stringify({ token, platform });

    // Clean up any old tokens that don't have JSON format to prevent duplicates
    const existingTokens = await redisClient.sMembers(KEY_PREFIX + userId);
    for (const t of existingTokens) {
      if (getStoredToken(t) === token) {
        await redisClient.sRem(KEY_PREFIX + userId, t);
      }
    }

    await redisClient.sAdd(KEY_PREFIX + userId, tokenData);
    await redisClient.set(REVERSE_KEY_PREFIX + token, String(userId));
    return { registered: 1 };
  } catch (err) {
    console.error("[FCM] Failed to register token:", err.message);
    const error = new Error("Gagal menyimpan token notifikasi");
    error.statusCode = 500;
    throw error;
  }
}

export async function unregisterFcmToken(userId, token) {
  if (!userId || !token) return { removed: 0 };
  if (!redisClient.isOpen) await redisClient.connect();

  const existingTokens = await redisClient.sMembers(KEY_PREFIX + userId);
  let removedCount = 0;
  for (const t of existingTokens) {
    if (getStoredToken(t) === token) {
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
        // Legacy raw tokens do not carry platform metadata. Only use them for
        // unfiltered sends; platform-filtered sends should use registered JSON tokens.
        if (!targetPlatform) {
          validTokens.push(raw);
        }
      }
    } catch (e) {
      if (!targetPlatform) validTokens.push(raw);
    }
  }
  return validTokens;
}

export async function sendFcmToUsers(userIds = [], { title, body, data, dataOnly, targetPlatform = null } = {}) {
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

  console.log(`[FCM] Preparing to send to ${tokens.length} token(s), users=${userIds.join(",")}, targetPlatform=${targetPlatform || "all"}, dataOnly=${Boolean(dataOnly)}`);
  // Always include title/body in data so all clients (web/mobile foreground/background)
  // can render a local notification consistently.
  const payloadData = Object.fromEntries(
    Object.entries({ notificationId: randomUUID(), ...(data || {}), title, body })
      .filter(([_, v]) => v !== undefined && v !== null)
      .map(([k, v]) => [k, String(v)])
  );
  const hasNotification = Boolean(title || body);
  const baseNotification = hasNotification
    ? { title: title || undefined, body: body || undefined }
    : undefined;
  // dataOnly events are kept as data-first, but we still attach notification
  // payload for reliable tray delivery when app/browser is backgrounded.
  const message = dataOnly
    ? {
      notification: baseNotification,
      data: payloadData,
      tokens,
      android: {
        priority: "high",
        notification: {
          channelId: "neocentral_guidance",
        },
      },
      apns: {
        headers: { "apns-priority": "10" },
        payload: {
          aps: {
            "content-available": 1,
            sound: "default",
          },
        },
      },
      webpush: {
        headers: { Urgency: "high" },
        notification: hasNotification
          ? {
            title: title || undefined,
            body: body || undefined,
            icon: "/vite.svg",
            badge: "/vite.svg",
          }
          : undefined,
        fcmOptions: { link: "/notifikasi" },
      },
    }
    : {
      notification: baseNotification,
      data: payloadData,
      tokens,
      android: {
        priority: "high",
        notification: {
          channelId: "neocentral_guidance",
        },
      },
      apns: {
        headers: { "apns-priority": "10" },
      },
      webpush: {
        headers: { Urgency: "high" },
        notification: hasNotification
          ? {
            title: title || undefined,
            body: body || undefined,
            icon: "/vite.svg",
            badge: "/vite.svg",
          }
          : undefined,
        fcmOptions: { link: "/notifikasi" },
      },
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
      if (
        code.includes("registration-token-not-registered") ||
        code.includes("invalid-argument") ||
        code.includes("third-party-auth-error")
      ) {
        invalidTokens.push(tokens[idx]);
      }
    }
  });
  if (invalidTokens.length) {
    if (!redisClient.isOpen) await redisClient.connect();
    for (const uid of userIds) {
      for (const token of invalidTokens) {
        await removeUserToken(uid, token);
      }
    }
  }
  return { success: true, sent: resp.successCount, failed: resp.failureCount };
}
