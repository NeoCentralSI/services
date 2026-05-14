import { createClient } from "redis";

export const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
  socket: {
    reconnectStrategy: process.env.NODE_ENV === "test" || process.env.SKIP_REDIS === "true"
      ? false
      : (retries) => Math.min(retries * 100, 3000),
  },
});

redisClient.on("error", (err) => {
  if (process.env.NODE_ENV === "test" || process.env.SKIP_REDIS === "true") return;
  console.error("❌ Redis Client Error:", err.message);
});

export async function checkRedisConnection() {
  try {
    if (!redisClient.isOpen) await redisClient.connect();
    await redisClient.ping();
    console.log("✅ Redis connected successfully");
  } catch (err) {
    console.error("❌ Redis connection failed:", err.message);
    throw err;
  }
}

export default redisClient;
