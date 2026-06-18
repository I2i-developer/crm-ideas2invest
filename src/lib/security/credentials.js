import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey() {
  const rawKey = process.env.CREDENTIAL_ENCRYPTION_KEY;

  if (!rawKey) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY is required for company credentials.");
  }

  const base64Key = Buffer.from(rawKey, "base64");
  const key = base64Key.length === 32 ? base64Key : Buffer.from(rawKey, "utf8");

  if (key.length !== 32) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }

  return key;
}

export function encryptSecret(secret) {
  if (!secret) return null;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    algorithm: ALGORITHM,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptSecret(payload) {
  if (!payload?.ciphertext || !payload?.iv || !payload?.tag) return "";

  const decipher = crypto.createDecipheriv(
    payload.algorithm || ALGORITHM,
    getKey(),
    Buffer.from(payload.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
