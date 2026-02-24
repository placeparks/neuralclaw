import { pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";

export function hashPassword(password: string, salt?: string) {
  const actualSalt = salt || randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, actualSalt, 120000, 32, "sha256").toString("hex");
  return { hash, salt: actualSalt };
}

export function verifyPassword(password: string, hashHex: string, salt: string) {
  const candidate = pbkdf2Sync(password, salt, 120000, 32, "sha256");
  const expected = Buffer.from(hashHex, "hex");
  if (candidate.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(candidate, expected);
}
