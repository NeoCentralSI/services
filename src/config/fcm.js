import { initializeApp, applicationDefault, cert, getApps } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

function parsePrivateKey(key) {
  if (!key) return undefined;
  // Support escaped newlines in env
  return key.replace(/\\n/g, "\n");
}

export function initFcm() {
  if (getApps().length) return;

  let saJson = null;
  const rawJson = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (rawJson) {
    try {
      saJson = JSON.parse(rawJson);
    } catch (e) {
      console.error("❌ FCM_SERVICE_ACCOUNT_JSON is not valid JSON:", e.message);
      console.error("   Value starts with:", rawJson.substring(0, 80) + "...");
    }
  }

  const projectId = process.env.FCM_PROJECT_ID;
  const clientEmail = process.env.FCM_CLIENT_EMAIL;
  const privateKey = parsePrivateKey(process.env.FCM_PRIVATE_KEY);

  if (saJson) {
    initializeApp({ credential: cert(saJson) });
    console.log("✅ FCM initialized with service account JSON");
  } else if (projectId && clientEmail && privateKey) {
    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });
    console.log("✅ FCM initialized with separate credentials");
  } else {
    // Try default credentials (GCE/Cloud Run) if available
    try {
      initializeApp({ credential: applicationDefault() });
    } catch (e) {
      console.warn("⚠️  FCM not initialized: missing credentials.",
        "Set FCM_SERVICE_ACCOUNT_JSON or FCM_PROJECT_ID + FCM_CLIENT_EMAIL + FCM_PRIVATE_KEY");
    }
  }
}

export function getFcmMessaging() {
  initFcm();
  try {
    return getMessaging();
  } catch (e) {
    return null;
  }
}
