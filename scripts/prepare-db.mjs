import "dotenv/config";
import { mkdir, open } from "node:fs/promises";
import { resolve, dirname } from "node:path";
const url = process.env.DATABASE_URL || "file:./dev.db";
if (!url.startsWith("file:"))
  throw new Error("DATABASE_URL must be a SQLite file URL.");
const database = resolve("apps/api/prisma", url.slice(5));
await mkdir(dirname(database), { recursive: true });
const file = await open(database, "a");
await file.close();
