import crypto from "crypto";

export function issueCompanionToken() {
  const raw = crypto.randomBytes(24).toString("base64url");
  return `ncc_${raw}`;
}

export function hashCompanionToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function companionRelayWsUrl() {
  return (
    process.env.NEXT_PUBLIC_COMPANION_RELAY_URL ||
    process.env.COMPANION_RELAY_WS_URL ||
    "ws://127.0.0.1:8787/companion"
  );
}

export function companionRelayHttpUrl() {
  const explicit =
    process.env.COMPANION_RELAY_HTTP_URL ||
    process.env.NEXT_PUBLIC_COMPANION_RELAY_HTTP_URL ||
    "";

  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }

  const wsUrl = companionRelayWsUrl();
  if (wsUrl.startsWith("wss://")) {
    return wsUrl.replace(/^wss:\/\//, "https://").replace(/\/companion$/, "");
  }
  if (wsUrl.startsWith("ws://")) {
    return wsUrl.replace(/^ws:\/\//, "http://").replace(/\/companion$/, "");
  }
  return wsUrl.replace(/\/companion$/, "");
}
