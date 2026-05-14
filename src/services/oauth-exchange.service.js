// One-shot OAuth callback exchange storage.
//
// Tujuan: hilangkan token dari URL query string saat OAuth callback. Server
// menyimpan token di Redis dengan TTL pendek dan memberi exchange code random
// ke frontend; frontend menukar code itu sekali lewat POST /auth/microsoft/exchange.
//
// Kalau Redis tidak terhubung, jatuh ke in-memory Map per-process. Aman untuk
// dev/local; di produksi multi-instance Redis WAJIB hidup agar code yang
// dibuat di replica A bisa di-consume oleh replica B.

import crypto from "node:crypto";
import { redisClient } from "../config/redis.js";

const TTL_SECONDS = 60;
const REDIS_PREFIX = "oauth:exchange:";

const memoryStore = new Map();

function generateCode() {
  return crypto.randomBytes(32).toString("hex");
}

function memorySet(code, payload, ttlSeconds) {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  memoryStore.set(code, { payload, expiresAt });
  setTimeout(() => {
    const entry = memoryStore.get(code);
    if (entry && entry.expiresAt <= Date.now()) memoryStore.delete(code);
  }, ttlSeconds * 1000).unref?.();
}

function memoryConsume(code) {
  const entry = memoryStore.get(code);
  if (!entry) return null;
  memoryStore.delete(code);
  if (entry.expiresAt <= Date.now()) return null;
  return entry.payload;
}

async function tryRedis(action) {
  try {
    if (!redisClient.isOpen) await redisClient.connect();
    return await action();
  } catch (err) {
    console.warn("[oauth-exchange] Redis unavailable, falling back to memory:", err.message);
    return null;
  }
}

/**
 * Store the OAuth callback payload and return a one-shot exchange code.
 * @param {object} payload - { accessToken, refreshToken, user, hasCalendarAccess }
 * @returns {Promise<string>} the exchange code
 */
export async function storeExchangePayload(payload) {
  const code = generateCode();
  const value = JSON.stringify(payload);
  const stored = await tryRedis(async () => {
    await redisClient.set(`${REDIS_PREFIX}${code}`, value, { EX: TTL_SECONDS });
    return true;
  });
  if (!stored) {
    memorySet(code, payload, TTL_SECONDS);
  }
  return code;
}

/**
 * Consume (read+delete) the payload for a given code. Returns null if missing
 * or expired. Single-use: any subsequent consume returns null.
 */
export async function consumeExchangePayload(code) {
  if (!code || typeof code !== "string") return null;
  const fromRedis = await tryRedis(async () => {
    const key = `${REDIS_PREFIX}${code}`;
    if (typeof redisClient.getDel === "function") {
      return await redisClient.getDel(key);
    }
    const value = await redisClient.get(key);
    if (value) await redisClient.del(key);
    return value;
  });
  if (fromRedis) {
    try {
      return JSON.parse(fromRedis);
    } catch {
      return null;
    }
  }
  return memoryConsume(code);
}
