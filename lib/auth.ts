import crypto from "crypto";

const SESSION_COOKIE = "neuralclub_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function getSecret() {
  return process.env.AUTH_SESSION_SECRET || "dev-insecure-change-me";
}

export function getSessionCookieName() {
  return SESSION_COOKIE;
}

export function createSessionToken(email: string) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `${email}|${exp}`;
  const sig = crypto.createHmac("sha256", getSecret()).update(payload).digest("hex");
  return `${payload}|${sig}`;
}

export function verifySessionToken(token: string | undefined | null): { email: string } | null {
  if (!token) return null;
  const parts = token.split("|");
  if (parts.length !== 3) return null;
  const [email, expRaw, sig] = parts;
  const exp = Number(expRaw);
  if (!email || Number.isNaN(exp)) return null;
  if (exp < Math.floor(Date.now() / 1000)) return null;
  const payload = `${email}|${exp}`;
  const expected = crypto.createHmac("sha256", getSecret()).update(payload).digest("hex");
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return { email };
}

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const computed = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(computed));
}

export function cookieHeader(token: string) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearCookieHeader() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
