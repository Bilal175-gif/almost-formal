import { argon2Verify } from "hash-wasm";
import { all, ApiError, first, json, run, sha256, type D1Database } from "./db";

export async function verifyPassword(password: string, stored: string) {
  const pbkdf2 = /^pbkdf2-sha256\$(\d+)\$([a-f0-9]{32})\$([a-f0-9]{64})$/.exec(stored);
  if (pbkdf2) {
    const iterations = Number(pbkdf2[1]);
    if (iterations !== 100_000) return false;
    const salt = Uint8Array.from(pbkdf2[2].match(/../g)!, (byte) => parseInt(byte, 16));
    const expected = Uint8Array.from(pbkdf2[3].match(/../g)!, (byte) => parseInt(byte, 16));
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const actual = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
    let difference = 0;
    for (let i = 0; i < expected.length; i++) difference |= actual[i] ^ expected[i];
    return difference === 0;
  }
  if (stored.length > 256) return false;
  const argon2 = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+={0,2})\$([A-Za-z0-9+/]+={0,2})$/.exec(stored);
  if (!argon2) return false;
  const [, memory, iterations, parallelism, salt, hash] = argon2;
  const memorySize = Number(memory);
  const timeCost = Number(iterations);
  const lanes = Number(parallelism);
  if (
    memorySize < 8 * lanes ||
    memorySize > 65_536 ||
    timeCost < 1 ||
    timeCost > 10 ||
    lanes < 1 ||
    lanes > 4 ||
    salt.length % 4 === 1 ||
    hash.length % 4 === 1
  ) return false;
  let saltLength: number;
  let hashLength: number;
  try {
    saltLength = atob(salt).length;
    hashLength = atob(hash).length;
  } catch {
    return false;
  }
  if (saltLength < 8 || hashLength < 16) return false;
  return argon2Verify({ password, hash: stored });
}

function cookie(request: Request, name: string) {
  const entry = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return entry?.slice(name.length + 1);
}

export async function requireAdmin(db: D1Database, request: Request, csrf = false) {
  const token = cookie(request, "af_session");
  if (!token) throw new ApiError(401, "Please sign in as an administrator.");
  const session = await first<{ adminId: string; name: string; email: string; expiresAt: string }>(db, 'SELECT s."adminId", s."expiresAt", u."name", u."email" FROM "Session" s JOIN "Admin" a ON a."id" = s."adminId" JOIN "User" u ON u."id" = a."userId" WHERE s."id" = ? AND a."role" = ?', await sha256(token), "admin");
  if (!session || new Date(session.expiresAt).getTime() < Date.now()) throw new ApiError(401, "Your session has expired.");
  if (csrf && request.headers.get("x-csrf-token") !== await sha256(`csrf:${token}`)) throw new ApiError(403, "Invalid request token.");
  return { ...session, token };
}

export async function login(db: D1Database, request: Request) {
  const input = await request.json() as { email?: string; password?: string };
  if (typeof input.password !== "string" || !input.password || input.password.length > 256) throw new ApiError(400, "Enter your password.");
  if (input.email !== undefined && (typeof input.email !== "string" || input.email.length > 200)) throw new ApiError(400, "Enter a valid email address.");
  const users = input.email
    ? await all<{ id: string; name: string; email: string; passwordHash: string; adminId: string }>(db, 'SELECT u.*, a."id" AS adminId FROM "User" u JOIN "Admin" a ON a."userId" = u."id" WHERE u."email" = ? AND a."role" = ?', input.email, "admin")
    : await all<{ id: string; name: string; email: string; passwordHash: string; adminId: string }>(db, 'SELECT u.*, a."id" AS adminId FROM "User" u JOIN "Admin" a ON a."userId" = u."id" WHERE a."role" = ? LIMIT 10', "admin");
  let user: typeof users[number] | undefined;
  for (const candidate of users) if (candidate.passwordHash && await verifyPassword(input.password, candidate.passwordHash)) { user = candidate; break; }
  if (!user) throw new ApiError(401, "Password is incorrect.");
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  await run(db, 'INSERT INTO "Session" ("id", "adminId", "expiresAt") VALUES (?, ?, ?)', await sha256(token), user.adminId, new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString());
  return json({ name: user.name, csrfToken: await sha256(`csrf:${token}`) }, 200, { "Set-Cookie": `af_session=${token}; HttpOnly; Secure; SameSite=Strict; Max-Age=28800; Path=/api` });
}

export async function me(db: D1Database, request: Request) {
  const admin = await requireAdmin(db, request);
  return json({ name: admin.name, email: admin.email, csrfToken: await sha256(`csrf:${admin.token}`) });
}

export async function logout(db: D1Database, request: Request) {
  const admin = await requireAdmin(db, request, true);
  await run(db, 'DELETE FROM "Session" WHERE "id" = ?', await sha256(admin.token));
  return json({ ok: true }, 200, { "Set-Cookie": "af_session=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/api" });
}
