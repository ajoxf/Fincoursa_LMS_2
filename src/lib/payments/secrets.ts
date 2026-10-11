import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encryption for payment provider secrets stored in the database (AES-256-GCM).
 * The key comes from PAYMENT_SECRETS_KEY (recommended: any long random string set in Vercel);
 * without it we derive one from SUPABASE_SERVICE_ROLE_KEY so the feature works out of the box.
 * Decryption tries both, so adding PAYMENT_SECRETS_KEY later only means re-saving the keys once.
 */
function keys(): Buffer[] {
  const raw = [process.env.PAYMENT_SECRETS_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY].filter(Boolean) as string[];
  if (!raw.length) throw new Error("Set PAYMENT_SECRETS_KEY to store payment keys");
  return raw.map((r) => createHash("sha256").update(`fincoursa-payment-secrets:${r}`).digest());
}

export function encryptSecrets(values: Record<string, string>): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keys()[0], iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(values), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(".");
}

/** Returns null when the stored value can't be read (e.g. the encryption key changed). */
export function decryptSecrets(blob: string | null | undefined): Record<string, string> | null {
  if (!blob) return {};
  const [v, iv, tag, data] = blob.split(".");
  if (v !== "v1" || !iv || !tag || !data) return null;
  for (const key of keys()) {
    try {
      const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
      d.setAuthTag(Buffer.from(tag, "base64"));
      return JSON.parse(Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8"));
    } catch { /* try the next key */ }
  }
  return null;
}

/** "••••4f2a" style hint so admins can tell which key is saved without seeing it. */
export const hint = (v: string) => (v.length > 8 ? `••••${v.slice(-4)}` : "••••");
