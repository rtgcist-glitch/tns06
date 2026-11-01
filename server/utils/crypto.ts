import crypto from "crypto";

const ITERATIONS = 10000;
const KEY_LENGTH = 64;
const DIGEST = "sha512";

/**
 * Hash a password using PBKDF2 with a random salt.
 * Formats output as: pbkdf2:salt:hash
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString("hex");
  return `pbkdf2:${salt}:${hash}`;
}

/**
 * Verify a password against a stored hash.
 * If the stored hash does not start with "pbkdf2:", it falls back to a plain-text comparison
 * (this supports backward-compatibility and auto-migration).
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash) return false;

  // Backward compatibility: If stored value is not hashed via PBKDF2, compare directly
  if (!storedHash.startsWith("pbkdf2:")) {
    return password === storedHash;
  }

  const parts = storedHash.split(":");
  if (parts.length !== 3) return false;

  const [, salt, hash] = parts;
  const computedHash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString("hex");
  
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(computedHash, "hex"));
}
