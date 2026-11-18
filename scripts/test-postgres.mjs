import "dotenv/config";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Explicit opt-in: use a disposable PostgreSQL database, never the live store.
if (!process.env.TEST_DATABASE_URL?.match(/^postgres(ql)?:/))
  throw new Error("Set TEST_DATABASE_URL to a disposable PostgreSQL database.");
const schema = `af_test_${randomBytes(8).toString("hex")}`;
const url = new URL(process.env.TEST_DATABASE_URL);
url.searchParams.set("schema", schema);
const directory = await mkdtemp(join(tmpdir(), "almost-formal-pg-test-"));
const env = {
  ...process.env,
  NODE_ENV: "test",
  DATABASE_URL: url.toString(),
  UPLOAD_DIR: directory,
  CLOUDINARY_CLOUD_NAME: "",
  CLOUDINARY_API_KEY: "",
  CLOUDINARY_API_SECRET: "",
  STORAGE_MODE: "local",
  PUBLIC_CACHE_TTL_SECONDS: "0",
  TRUST_PROXY_HOPS: "0",
};
function run(args) {
  const result = spawnSync("npm", args, { env, stdio: "inherit" });
  if (result.status !== 0)
    throw new Error(`PostgreSQL check failed: npm ${args.join(" ")}`);
}
let db;
try {
  run(["run", "db:generate:production"]);
  run(["run", "build", "-w", "@almost-formal/api"]);
  // Use the just-generated PostgreSQL client, in a separate process below.
  run(["run", "db:migrate:production"]);
  const result = spawnSync(
    "node",
    ["--import", "tsx", "--test", "tests/api.test.ts"],
    { env, stdio: "inherit" },
  );
  process.exitCode = result.status ?? 1;
  if (process.exitCode === 0) {
    const startup = spawnSync("node", ["scripts/test-render-startup.mjs"], {
      env,
      stdio: "inherit",
    });
    process.exitCode = startup.status ?? 1;
  }
} finally {
  try {
    const { PrismaClient } = await import("@prisma/client");
    db = new PrismaClient({ datasourceUrl: url.toString() });
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await db?.$disconnect();
    await rm(directory, { recursive: true, force: true });
    run(["run", "db:generate"]);
  }
}
