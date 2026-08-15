import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
let warnedMissingKey = false;

function getKey(): Buffer | null {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    if (!warnedMissingKey) {
      console.warn(
        "ENCRYPTION_KEY not set; storing secrets (e.g. Anthropic API keys) in plaintext. Set a 32-byte ENCRYPTION_KEY to encrypt them at rest.",
      );
      warnedMissingKey = true;
    }
    return null;
  }
  return crypto.createHash("sha256").update(secret).digest();
}

// Values are stored as `iv:authTag:ciphertext` (all base64). If no
// ENCRYPTION_KEY is configured, values are stored as plaintext with a
// `plain:` prefix so decrypt() can tell them apart later.
export function encryptSecret(value: string): string {
  const key = getKey();
  if (!key) {
    return `plain:${value}`;
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `enc:${iv.toString("base64")}:${authTag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  if (stored.startsWith("plain:")) {
    return stored.slice("plain:".length);
  }

  if (!stored.startsWith("enc:")) {
    // Value was written before encryption support existed.
    return stored;
  }

  const key = getKey();
  if (!key) {
    throw new Error(
      "Stored secret is encrypted but ENCRYPTION_KEY is not set; cannot decrypt.",
    );
  }

  const [, ivB64, authTagB64, ciphertextB64] = stored.split(":");
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}
