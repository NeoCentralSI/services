// Deprecated: WebSocket transport is currently inactive while notification work
// moves through in-app notifications and FCM. Keep these no-op exports so older
// imports do not fail during the transition.

export function initWebSocket() {
  return null;
}

export function wsSendToUser() {
  return 0;
}

export function wsBroadcast() {
  return 0;
}

export function getWsServer() {
  return null;
}
