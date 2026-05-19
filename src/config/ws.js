
import { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import { ENV } from "./env.js";

// userId -> Set<WebSocket>
const userClients = new Map();
let wss = null;

function addClient(userId, ws) {
  if (!userClients.has(userId)) userClients.set(userId, new Set());
  userClients.get(userId).add(ws);
}

function removeClient(userId, ws) {
  const set = userClients.get(userId);
  if (set) {
    set.delete(ws);
    if (set.size === 0) userClients.delete(userId);
  }
}

export function initWebSocket(server) {
  if (wss) return wss;
  wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (ws, req) => {
    let userId = null;
    try {
      const url = new URL(req.url, ENV.BASE_URL || "http://localhost:" + (ENV.PORT || 3000));
      const token = url.searchParams.get("token");
      if (!token) throw new Error("Missing token");
      const payload = jwt.verify(token, ENV.JWT_SECRET);
      userId = payload?.sub || payload?.id || null;
      if (!userId) throw new Error("Invalid token payload");
    } catch (err) {
      try { ws.close(1008, "unauthorized"); } catch {}
      return;
    }

    addClient(userId, ws);
    ws.on("close", () => removeClient(userId, ws));
    ws.on("error", () => removeClient(userId, ws));

    // greet the client
    try {
      ws.send(JSON.stringify({ type: "ws:connected", data: { userId } }));
    } catch {}
  });

  console.log("🔌 WebSocket server mounted at /ws");
  return wss;
}

export function wsSendToUser(userId, type, data = {}) {
  if (!userId) return 0;
  const set = userClients.get(userId);
  if (!set || set.size === 0) return 0;
  const msg = JSON.stringify({ type, data });
  let sent = 0;
  for (const ws of set) {
    if (ws.readyState === ws.OPEN) {
      try { ws.send(msg); sent++; } catch {}
    }
  }
  return sent;
}

export function wsBroadcast(type, data = {}) {
  if (!wss) return 0;
  const msg = JSON.stringify({ type, data });
  let sent = 0;
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) {
      try { client.send(msg); sent++; } catch {}
    }
  }
  return sent;
}

export function getWsServer() {
  return wss;
}
