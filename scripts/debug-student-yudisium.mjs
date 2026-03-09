import { getStudentYudisiumOverview } from "../src/services/yudisium/studentYudisium.service.js";

const userId = process.argv[2] || "8f73376f-c43e-4c06-bbb0-c66f541cf567";

try {
  const data = await getStudentYudisiumOverview(userId);
  console.log("SUCCESS");
  console.log(JSON.stringify(data, null, 2));
  process.exit(0);
} catch (error) {
  console.error("ERROR_NAME:", error?.name);
  console.error("ERROR_MESSAGE:", error?.message);
  console.error("ERROR_STACK:", error?.stack);
  process.exit(1);
}
