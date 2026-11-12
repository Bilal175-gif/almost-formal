import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { publicCache } from "../apps/api/src/public-cache.js";
import { databaseUrl } from "../apps/api/src/runtime.js";
import { resendTransport } from "../apps/api/src/email-delivery.js";

test("Neon connection defaults are bounded and preserve user overrides", () => {
  const result = new URL(
    databaseUrl(
      "postgresql://user:password@example.test/store?sslmode=require",
    ),
  );
  assert.equal(result.searchParams.get("connection_limit"), "3");
  assert.equal(result.searchParams.get("connect_timeout"), "20");
  assert.equal(result.searchParams.get("sslmode"), "require");
  assert.equal(
    new URL(
      databaseUrl("postgresql://u:p@example.test/db?connection_limit=1"),
    ).searchParams.get("connection_limit"),
    "1",
  );
  assert.equal(databaseUrl("file:./dev.db"), "file:./dev.db");
});

test("public cache reduces reads, invalidates on checkout, and excludes private/health routes", async () => {
  const app = express();
  app.use(publicCache(30));
  let reads = 0;
  let privateReads = 0;
  app.get("/api/products", (_req, res) => res.json({ reads: ++reads }));
  app.get("/api/admin/orders", (_req, res) =>
    res.json({ reads: ++privateReads }),
  );
  app.get("/api/health", (_req, res) => res.json({ reads: ++privateReads }));
  app.post("/api/orders", (_req, res) => res.sendStatus(201));
  assert.equal((await request(app).get("/api/products")).body.reads, 1);
  assert.equal((await request(app).get("/api/products")).body.reads, 1);
  await request(app).post("/api/orders");
  assert.equal((await request(app).get("/api/products")).body.reads, 2);
  await request(app).get("/api/admin/orders");
  await request(app).get("/api/admin/orders");
  await request(app).get("/api/health");
  await request(app).get("/api/health");
  assert.equal(privateReads, 4);
});

test("HTTPS email serializes contact reply-to and reports delivery failures", async () => {
  const original = globalThis.fetch;
  const calls: RequestInit[] = [];
  globalThis.fetch = async (input, init) => {
    assert.equal(input, "https://api.resend.com/emails");
    calls.push(init!);
    return new Response("{}", { status: calls.length === 1 ? 200 : 429 });
  };
  try {
    const mail = resendTransport("test-key");
    const message = {
      from: "store@example.test",
      to: "owner@example.test",
      subject: "Contact",
      text: "Hello",
      replyTo: "customer@example.test",
    };
    await mail.sendMail(message);
    assert.deepEqual(JSON.parse(calls[0].body as string).to, [message.to]);
    assert.equal(JSON.parse(calls[0].body as string).reply_to, message.replyTo);
    await assert.rejects(() => mail.sendMail(message), /429/);
  } finally {
    globalThis.fetch = original;
  }
});
