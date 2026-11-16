import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM envelope for sensitive holding identifiers (account numbers,
// customer IDs, net-banking user IDs, folio/PRAN…). The ciphertext is bound to
// its owner and ledger account through additional authenticated data, so a
// copied value cannot be decrypted under another row.
const VERSION = "v1";

export class VaultUnavailable extends Error {
  constructor() {
    super("vault_unavailable");
  }
}

function key(env: Record<string, string | undefined> = process.env) {
  const raw = env.LEDGERONE_VAULT_KEY?.trim();
  if (!raw) return null;
  const bytes = Buffer.from(raw, "base64");
  return bytes.length === 32 ? bytes : null;
}

export function vaultConfigured(env?: Record<string, string | undefined>) {
  return key(env) !== null;
}

const aad = (ownerId: string, accountId: string) =>
  Buffer.from(`ledgerone:holding:${ownerId}:${accountId}`, "utf8");

export function sealSecrets(
  secrets: Record<string, string>,
  ownerId: string,
  accountId: string,
  env?: Record<string, string | undefined>,
) {
  if (!Object.keys(secrets).length) return null;
  const k = key(env);
  if (!k) throw new VaultUnavailable();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  cipher.setAAD(aad(ownerId, accountId));
  const body = Buffer.concat([
    cipher.update(JSON.stringify(secrets), "utf8"),
    cipher.final(),
  ]);
  return [
    VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    body.toString("base64url"),
  ].join(".");
}

export function openSecrets(
  sealed: string | null,
  ownerId: string,
  accountId: string,
  env?: Record<string, string | undefined>,
): Record<string, string> {
  if (!sealed) return {};
  const k = key(env);
  if (!k) throw new VaultUnavailable();
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || !body) throw new VaultUnavailable();
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      k,
      Buffer.from(iv, "base64url"),
    );
    decipher.setAAD(aad(ownerId, accountId));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(body, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    const parsed: unknown = JSON.parse(plain);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new VaultUnavailable();
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (e): e is [string, string] => typeof e[1] === "string",
      ),
    );
  } catch {
    throw new VaultUnavailable();
  }
}
