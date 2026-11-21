import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const sourceUrl = process.env.NEON_SOURCE_URL;
const password = process.env.STAGING_ADMIN_PASSWORD;
if (!sourceUrl || !/^postgres(ql)?:/.test(sourceUrl))
  throw new Error("Set NEON_SOURCE_URL to the Neon PostgreSQL connection string.");
if (!password || password.length < 12 || password.length > 256)
  throw new Error("Set STAGING_ADMIN_PASSWORD to a unique 12–256 character password.");

const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const db = new PrismaClient({ datasourceUrl: sourceUrl });
try {
  const admins = await db.admin.findMany({ include: { user: true } });
  if (admins.length !== 1) throw new Error("Expected exactly one source administrator.");
  const { id, role, user } = admins[0];
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, 100_000, 32, "sha256");
  const passwordHash = `pbkdf2-sha256$100000$${salt.toString("hex")}$${hash.toString("hex")}`;
  const sql = [
    "-- Staging administrator only. No production password hash or sessions.",
    `INSERT INTO "User" ("id", "email", "name", "passwordHash", "createdAt") VALUES (${quote(user.id)}, ${quote(user.email)}, ${quote(user.name)}, ${quote(passwordHash)}, ${quote(user.createdAt.toISOString())}) ON CONFLICT("id") DO UPDATE SET "email" = excluded."email", "name" = excluded."name", "passwordHash" = excluded."passwordHash";`,
    `INSERT INTO "Admin" ("id", "userId", "role") VALUES (${quote(id)}, ${quote(user.id)}, ${quote(role)}) ON CONFLICT("id") DO UPDATE SET "userId" = excluded."userId", "role" = excluded."role";`,
  ];
  const destination = "/tmp/almost-formal-staging-admin.sql";
  await writeFile(destination, `${sql.join("\n")}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ destination, admins: 1 }));
} finally {
  await db.$disconnect();
}
