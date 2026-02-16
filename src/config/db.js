import { checkDatabaseConnection } from "./prisma.js";
import { checkRedisConnection } from "./redis.js";
import { checkGotenbergConnection } from "./gotenberg.js";

export async function initConnections() {
  console.log("🔍 Checking database and Redis connections...");
  await checkDatabaseConnection();
  await checkRedisConnection();
  await checkGotenbergConnection();
  console.log("🚀 All connections established successfully");
}
