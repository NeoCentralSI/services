import { checkDatabaseConnection } from "./prisma.js";
import { checkRedisConnection } from "./redis.js";
import { ENV } from "./env.js";

export async function initConnections() {
  console.log("🔍 Checking database and Redis connections...");
  await checkDatabaseConnection();
  if (!ENV.SKIP_REDIS) {
    await checkRedisConnection();
  } else {
    console.log("⏭️ SKIP_REDIS=true, skipping Redis connection check");
  }
  console.log("🚀 All connections established successfully");
}
