/**
 * Client-side, zero-knowledge crypto (Web Crypto API only — no dependencies).
 *
 *  master password ──PBKDF2(email salt)──▶ auth password   → sent to Supabase Auth
 *  master password ──PBKDF2(kdf_salt)───▶ key-encryption key (KEK) ─┐
 *  recovery key    ──PBKDF2(kdf_salt)───▶ recovery KEK ─────────────┤ wrap
 *                                                                   ▼
 *                                     random 256-bit vault key → AES-256-GCM per field
 *
 * The master password, recovery key and vault key never leave the browser.
 * Ciphertext format matches the `public.ciphertext` domain: v1.<iv>.<ciphertext>
 */

export const KDF_NAME = "pbkdf2-sha256" as const;
export const KDF_ITERATIONS = 600_000; // OWASP 2023+ minimum for PBKDF2-SHA256

const CIPHER_VERSION = "v1";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

// --- encoding helpers --------------------------------------------------------

export function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

/** Unbiased random index in [0, max) using rejection sampling. */
export function randomIndex(max: number): number {
  const limit = 256 - (256 % max);
  const buf = new Uint8Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % max;
  }
}

// --- key derivation ----------------------------------------------------------

async function pbkdf2Bits(
  secret: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number
): Promise<ArrayBuffer> {
  const base = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    base,
    256
  );
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Password sent to Supabase Auth. Derived with a different salt than the KEK,
 * so the server (which only sees this value) learns nothing about the vault key.
 * The fixed prefix satisfies any upper/lower/digit/symbol password policy.
 */
export async function deriveAuthPassword(
  email: string,
  masterPassword: string
): Promise<string> {
  const salt = encoder.encode(`conserve-auth-v1:${normalizeEmail(email)}`);
  const bits = await pbkdf2Bits(masterPassword, salt, KDF_ITERATIONS);
  return `Cv1!${toBase64(new Uint8Array(bits))}`;
}

/** Key-encryption key used only to wrap/unwrap the vault key. */
export async function deriveKek(
  secret: string,
  saltB64: string,
  iterations: number
): Promise<CryptoKey> {
  const bits = await pbkdf2Bits(secret, fromBase64(saltB64), iterations);
  return crypto.subtle.importKey("raw", bits, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

// --- AES-GCM ----------------------------------------------------------------

async function encryptBytes(
  key: CryptoKey,
  data: Uint8Array<ArrayBuffer>
): Promise<string> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  return `${CIPHER_VERSION}.${toBase64(iv)}.${toBase64(new Uint8Array(ct))}`;
}

async function decryptBytes(key: CryptoKey, payload: string): Promise<ArrayBuffer> {
  const [version, ivB64, ctB64] = payload.split(".");
  if (version !== CIPHER_VERSION || !ivB64 || !ctB64) {
    throw new Error("Unsupported ciphertext format");
  }
  return crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivB64) },
    key,
    fromBase64(ctB64)
  );
}

export function encryptString(key: CryptoKey, plaintext: string): Promise<string> {
  return encryptBytes(key, encoder.encode(plaintext));
}

export async function decryptString(key: CryptoKey, payload: string): Promise<string> {
  return decoder.decode(await decryptBytes(key, payload));
}

// --- vault key ---------------------------------------------------------------

export function generateVaultKey(): Promise<CryptoKey> {
  // Extractable only so it can be re-wrapped (recovery-key rotation,
  // master-password change). It is held in memory only, never persisted.
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function wrapVaultKey(vaultKey: CryptoKey, kek: CryptoKey): Promise<string> {
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", vaultKey));
  try {
    return await encryptBytes(kek, raw);
  } finally {
    raw.fill(0);
  }
}

/** Throws if the KEK is wrong (AES-GCM authentication fails). */
export async function unwrapVaultKey(wrapped: string, kek: CryptoKey): Promise<CryptoKey> {
  const raw = await decryptBytes(kek, wrapped);
  return crypto.subtle.importKey("raw", raw, "AES-GCM", true, ["encrypt", "decrypt"]);
}

// --- recovery key ------------------------------------------------------------

const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 symbols → 5 bits each

/** CNSV-XXXX-XXXX-XXXX-XXXX-XXXX — 20 random symbols = 100 bits of entropy. */
export function generateRecoveryKey(): string {
  const block = () =>
    Array.from({ length: 4 }, () => RECOVERY_ALPHABET[randomIndex(RECOVERY_ALPHABET.length)]).join("");
  return `CNSV-${block()}-${block()}-${block()}-${block()}-${block()}`;
}

export function normalizeRecoveryKey(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
