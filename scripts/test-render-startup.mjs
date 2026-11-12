import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { getAvailablePort } from "./resolve-web-port.mjs";

if (!process.env.TEST_DATABASE_URL?.match(/^postgres(ql)?:/))
  throw new Error(
    "TEST_DATABASE_URL must point to a disposable PostgreSQL database.",
  );
const schema = `af_start_${randomUUID().replaceAll("-", "")}`;
const url = new URL(process.env.TEST_DATABASE_URL);
url.searchParams.set("schema", schema);
const db = new PrismaClient({ datasourceUrl: url.toString() });
const port = await getAvailablePort(55440);
const env = {
  ...process.env,
  DATABASE_URL: url.toString(),
  NODE_ENV: "production",
  RENDER: "true",
  APP_ORIGIN: "https://shop.example.test",
  PORT: String(port),
  CLOUDINARY_CLOUD_NAME: "test-cloud",
  CLOUDINARY_API_KEY: "test-key",
  CLOUDINARY_API_SECRET: "test-secret",
  ADMIN_EMAIL: "bootstrap@example.test",
  ADMIN_PASSWORD: randomUUID(),
  PUBLIC_CACHE_TTL_SECONDS: "30",
  TRUST_PROXY_HOPS: "1",
  RESEND_API_KEY: "",
  SMTP_PASSWORD: "",
};
let child;
async function stop() {
  if (!child) return;
  const current = child;
  child = undefined;
  if (current.exitCode !== null || current.signalCode !== null) return;
  await new Promise((resolve) => {
    current.once("exit", resolve);
    current.kill("SIGTERM");
  });
}
async function start() {
  child = spawn(
    process.execPath,
    ["apps/api/dist/apps/api/src/start-render.js"],
    { env, stdio: ["ignore", "pipe", "pipe"] },
  );
  await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(
      () => reject(new Error(`Startup timeout: ${output}`)),
      20000,
    );
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Startup exited ${code}: ${output}`));
    });
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.includes("Almost Formal API:")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
  });
  const response = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal((await response.json()).service, "almost-formal-api");
}
try {
  assert.equal(
    spawnSync("npm", ["run", "db:migrate:production"], {
      env,
      stdio: "inherit",
    }).status,
    0,
  );
  await start();
  assert.equal(await db.admin.count(), 1);
  assert.equal(await db.product.count(), 0);
  assert.equal(await db.category.count(), 5);
  const before = await db.user.findUniqueOrThrow({
    where: { email: env.ADMIN_EMAIL },
  });
  const response = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: env.APP_ORIGIN },
    body: JSON.stringify({ password: env.ADMIN_PASSWORD }),
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /Secure/);
  await stop();
  env.ADMIN_PASSWORD = "";
  await start();
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { email: env.ADMIN_EMAIL } }))
      .passwordHash,
    before.passwordHash,
  );
  assert.equal(await db.admin.count(), 1);
  console.log(
    "PASS: compiled Render startup, first admin, secure login, zero demo products, persistent restart without ADMIN_PASSWORD",
  );
} finally {
  await stop();
  await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await db.$disconnect();
}
