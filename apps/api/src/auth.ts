// Authentication helpers for the Worker runtime.
//
// Password hashing is WebCrypto PBKDF2-SHA256 (600k iterations, OWASP
// guidance). The previous implementation used argon2, which is a native
// C++ binding and cannot run in Workers, so argon2 hashes stored in the
// database cannot be verified here. Stored format carries a version
// marker so login can tell the two apart:
//
//   $pbkdf2$sha256$<iterations>$<base64url salt>$<base64url hash>
//
// An admin whose passwordHash is still an argon2 hash must have the
// password reset at cutover (see scripts/admin-reset-d1.mjs); login
// returns false for those hashes instead of failing silently.

const ITERATIONS = 600_000;
const KEY_BYTES = 32;
const SALT_BYTES = 16;

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlDecode(input: string): Uint8Array {
  const base64 = input.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt.buffer as ArrayBuffer,
      iterations,
      hash: "SHA-256",
    },
    key,
    KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(salt);
  const hash = await deriveKey(password, salt, ITERATIONS);
  return `$pbkdf2$sha256$${ITERATIONS}$${base64UrlEncode(salt)}$${base64UrlEncode(hash)}`;
}

export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
): Promise<boolean> {
  if (!stored || !stored.startsWith("$pbkdf2$")) return false;
  const parts = stored.split("$");
  // ["", "pbkdf2", "sha256", iterations, salt, hash]
  if (parts.length !== 6 || parts[2] !== "sha256") return false;
  const iterations = Number(parts[3]);
  if (!Number.isInteger(iterations) || iterations < 1) return false;
  const salt = base64UrlDecode(parts[4]);
  const expected = base64UrlDecode(parts[5]);
  const actual = await deriveKey(password, salt, iterations);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Hex token (e.g. session tokens, CSRF input). Uses WebCrypto, which is
// available in Workers and in Node.
export function randomTokenHex(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return [...arr].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Unique ids for rows inserted with raw D1 SQL (Prisma's cuid() default
// only applies to Prisma creates). UUIDs are unique strings, same as
// the cuid ids already in the database.
export function newId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
