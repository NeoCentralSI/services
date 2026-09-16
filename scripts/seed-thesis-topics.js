/**
 * Backward-compatible entry point for master DSI.
 *
 * The old implementation only created unlinked topics. Keep this command for
 * existing runbooks, but delegate to the idempotent NIP/KBK/topic synchronizer
 * so BR-16 and the four official KBK names cannot drift again.
 */
import { syncDsiMaster } from "./sync-dsi-master.js";

syncDsiMaster()
  .then((result) => {
    console.log("DSI master sync selesai.");
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error("DSI master sync gagal:", error);
    process.exitCode = 1;
  });
