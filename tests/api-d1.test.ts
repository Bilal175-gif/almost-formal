// Port of tests/api.test.ts to the Hono Worker + D1 stack.
// Runs the Hono app in-process via app.request() against a local
// miniflare D1 (getPlatformProxy, persist: false) — no HTTP server,
// no supertest, no SQLite file. The original Express/SQLite suite is
// kept at tests/api.test.ts for reference; it does not run against
// this stack.
// Run: node --import tsx --test tests/api-d1.test.ts
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { getPlatformProxy } from "wrangler";
import app, { resetRateLimits } from "../apps/api/src/app.ts";
import { createDb } from "../apps/api/src/db-d1.ts";
import { hashPassword } from "../apps/api/src/auth.ts";
import { createOrder, updateOrderStatus } from "../apps/api/src/orders.ts";

const MIGRATIONS = [
  "apps/api/prisma/migrations/20261014214532_init/migration.sql",
  "apps/api/prisma/migrations/20261109150000_update_announcement/migration.sql",
];

/* eslint-disable @typescript-eslint/no-explicit-any */
// Test-only loose typing: the miniflare D1 binding and untyped JSON
// bodies are `any` by nature here; production code stays strict.
async function applyMigrationSql(d1: any, sql: string) {
  const statements = sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  await d1.batch(statements.map((s: string) => d1.prepare(s)));
}

let proxy: Awaited<ReturnType<typeof getPlatformProxy>>;
let env: any;
let db: ReturnType<typeof createDb>;
let ctx: { db: typeof db; d1: any };

const address = {
  name: "Test Customer",
  email: "customer@example.test",
  phone: "03001234567",
  line1: "123 Test Street",
  city: "Karachi",
  state: "Sindh",
  postalCode: "75500",
};
const password = randomUUID() + "-long-test-password";
let adminId = "";

// Minimal cookie jar around app.request().
let jar = "";
async function req(
  path: string,
  opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
) {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (jar) headers["cookie"] = jar;
  let body: string | undefined;
  if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers["content-type"] = "application/json";
  }
  const res = await app.request(`http://localhost${path}`, {
    method: opts.method ?? (body ? "POST" : "GET"),
    headers,
    body,
  }, env);
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) jar = setCookie.split(";")[0];
  let parsed: any = null;
  const text = await res.text();
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed, headers: res.headers };
}

before(async () => {
  proxy = await getPlatformProxy({ configPath: "apps/api/wrangler.toml", persist: false });
  env = proxy.env;
  for (const file of MIGRATIONS) {
    await applyMigrationSql(env.DB, await readFile(file, "utf8"));
  }
  db = createDb(env.DB);
  ctx = { db, d1: env.DB };
  await db.storeSettings.create({ data: { id: "store" } });
  await db.category.create({ data: { name: "Regular Ties", slug: "regular-ties" } });
  const user = await db.user.create({
    data: {
      email: "admin@example.test",
      name: "Test Admin",
      passwordHash: await hashPassword(password),
      admin: { create: {} },
    },
    include: { admin: true },
  });
  adminId = user.admin!.id;
});

after(async () => {
  await proxy.dispose();
});

async function product(stock = 1) {
  const slug = `test-${randomUUID()}`;
  return db.product.create({
    data: {
      slug,
      sku: slug,
      title: "Forest Test Tie",
      description: "A striped vintage test product.",
      price: 129000,
      stock,
      pattern: "Striped",
      color: "Green",
      condition: "Good",
      conditionNote: "Light wear.",
      flaws: "None",
      length: 147,
      width: 9,
      images: { create: { url: "/images/tie-1.webp", alt: "Test tie" } },
    },
  });
}

const payload = (id: string, key = randomUUID()) => ({
  address,
  items: [{ productId: id, quantity: 1 }],
  idempotencyKey: key,
  paymentMethod: "cod",
});

test("product retrieval, search and filters use database records", async () => {
  const p = await product();
  const r = await req("/api/products?search=Forest&pattern=Striped&color=Green&maxPrice=130000");
  assert.equal(r.status, 200);
  assert.ok(r.body.products.some((x: { id: string }) => x.id === p.id));
  const miss = await req("/api/products?pattern=Paisley");
  assert.equal(miss.body.total, 0);
  const detail = await req(`/api/products/${p.slug}`);
  assert.equal(detail.body.sku, p.sku);
});

test("checkout rejects empty items, invalid address and duplicate product rows", async () => {
  const invalid = await req("/api/orders", { body: { address: {}, items: [] } });
  assert.equal(invalid.status, 400);
  const p = await product();
  const data = payload(p.id);
  const duplicate = await req("/api/orders", {
    body: { ...data, items: [data.items[0], data.items[0]] },
  });
  assert.equal(duplicate.status, 400);
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock, 1);
});

test("order is saved with snapshots, server prices, stock deduction and scoped access", async () => {
  const p = await product();
  const r = await req("/api/orders", { body: { ...payload(p.id), total: 1 } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.total, 154000);
  assert.equal(r.body.items[0].sku, p.sku);
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock, 0);
  assert.equal((await req(`/api/orders/${r.body.id}`)).status, 400);
  assert.equal(
    (await req(`/api/orders/${r.body.id}`, { headers: { "x-order-token": "a".repeat(64) } })).status,
    404,
  );
  const lookup = await req(`/api/orders/${r.body.number}`, {
    headers: { "x-order-token": r.body.accessToken },
  });
  assert.equal(lookup.status, 200);
  assert.equal(lookup.body.id, r.body.id);
});

test("idempotency prevents double deduction and rejects changed request bodies", async () => {
  const p = await product(2);
  const input = payload(p.id);
  const first = await createOrder(ctx, input);
  const second = await createOrder(ctx, input);
  assert.equal(first.order.id, second.order.id);
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock, 1);
  await assert.rejects(() => createOrder(ctx, { ...input, note: "Changed order" }), /changed/);
});

test("competing buyers cannot purchase the same single-stock item", async () => {
  const p = await product();
  const results = await Promise.allSettled([
    createOrder(ctx, payload(p.id)),
    createOrder(ctx, payload(p.id)),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock, 0);
  assert.equal(await db.orderItem.count({ where: { productId: p.id } }), 1);
});

test("failed mixed-stock order rolls back earlier inventory deduction", async () => {
  const available = await product();
  const sold = await product(0);
  const input = {
    ...payload(available.id),
    items: [
      { productId: available.id, quantity: 1 },
      { productId: sold.id, quantity: 1 },
    ],
  };
  await assert.rejects(() => createOrder(ctx, input));
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: available.id } })).stock, 1);
});

test("cancellation restores inventory exactly once and blocks invalid transitions", async () => {
  const p = await product();
  const { order } = await createOrder(ctx, payload(p.id));
  await updateOrderStatus(ctx, order.id, "cancelled", adminId);
  await updateOrderStatus(ctx, order.id, "cancelled", adminId);
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock, 1);
  assert.equal(
    await db.inventoryMovement.count({ where: { orderId: order.id, reason: "Order cancelled" } }),
    1,
  );
  await assert.rejects(() => updateOrderStatus(ctx, order.id, "shipped", adminId), /Cannot change/);
});

test("admin authentication, authorization, CSRF and product management", async () => {
  resetRateLimits();
  jar = "";
  assert.equal((await req("/api/admin/dashboard")).status, 401);
  assert.equal((await req("/api/admin/products", { body: {} })).status, 401);
  assert.equal(
    (await req("/api/auth/login", { body: { email: "admin@example.test", password: "wrong" } })).status,
    401,
  );
  const login = await req("/api/auth/login", {
    body: { email: "admin@example.test", password },
    headers: { Origin: "http://localhost:3000" },
  });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  const passwordOnlyLogin = await req("/api/auth/login", {
    body: { password },
    headers: { Origin: "http://localhost:3000" },
  });
  assert.equal(passwordOnlyLogin.status, 200);
  assert.match(String(login.headers.get("set-cookie")), /HttpOnly/);
  assert.match(String(login.headers.get("set-cookie")), /SameSite=Strict/);
  const me = await req("/api/auth/me");
  assert.equal(me.status, 200);
  const csrf = me.body.csrfToken;
  assert.equal((await req("/api/admin/settings", { method: "PATCH", body: { shipping: 1 } })).status, 403);
  assert.equal(
    (
      await req("/api/admin/settings", {
        method: "PATCH",
        body: { shipping: 1 },
        headers: { "x-csrf-token": csrf, Origin: "https://evil.example" },
      })
    ).status,
    403,
  );
  const slug = `managed-${randomUUID()}`;
  const data = {
    title: "Managed Tie",
    slug,
    sku: slug,
    description: "A managed vintage tie for testing.",
    price: 100000,
    stock: 1,
    category: "Regular Ties",
    pattern: "Striped",
    color: "Green",
    condition: "Good",
    conditionNote: "Minor wear",
    flaws: "None",
    length: 147,
    width: 9,
    material: null,
    era: null,
    featured: false,
    imageUrls: ["/images/tie-1.webp"],
  };
  const created = await req("/api/admin/products", {
    body: data,
    headers: { "x-csrf-token": csrf },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const changed = await req(`/api/admin/products/${created.body.id}`, {
    method: "PATCH",
    body: { stock: 0, archived: true },
    headers: { "x-csrf-token": csrf },
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.stock, 0);
  assert.equal((await req(`/api/products/${slug}`)).status, 404);
  assert.equal(
    (await req(`/api/admin/products/${created.body.id}`, { method: "DELETE", headers: { "x-csrf-token": csrf } })).status,
    200,
  );
  assert.equal((await req("/api/auth/logout", { method: "POST", headers: { "x-csrf-token": csrf } })).status, 200);
  assert.equal((await req("/api/admin/dashboard")).status, 401);
});

test("shipping requires tracking and delivered orders cannot be cancelled", async () => {
  const p = await product();
  const { order } = await createOrder(ctx, payload(p.id));
  await updateOrderStatus(ctx, order.id, "confirmed", adminId);
  await updateOrderStatus(ctx, order.id, "packed", adminId);
  await assert.rejects(() => updateOrderStatus(ctx, order.id, "shipped", adminId), /tracking/);
  await updateOrderStatus(ctx, order.id, "shipped", adminId, "TRACK-001", "Test courier");
  await updateOrderStatus(ctx, order.id, "delivered", adminId);
  await assert.rejects(() => updateOrderStatus(ctx, order.id, "cancelled", adminId));
  assert.equal((await db.payment.findUniqueOrThrow({ where: { orderId: order.id } })).status, "collected");
});

test("uploads fail cleanly without storage and cross-origin API access works for the web origin", async () => {
  resetRateLimits();
  jar = "";
  // No Cloudinary secrets in this deployment (wrangler.toml): uploads
  // must fail with a plain 503, never crash, and legacy /uploads/*
  // must answer 410 Gone.
  const login = await req("/api/auth/login", {
    body: { email: "admin@example.test", password },
    headers: { Origin: "http://localhost:3000" },
  });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  const csrf = (await req("/api/auth/me")).body.csrfToken;
  const form = new FormData();
  form.append(
    "image",
    new Blob(["fake-png"], { type: "image/png" }),
    "test.png",
  );
  const upload = await app.request("http://localhost/api/admin/uploads", {
    method: "POST",
    headers: {
      cookie: jar,
      "x-csrf-token": csrf,
      Origin: "http://localhost:3000",
    },
    body: form,
  }, env);
  assert.equal(upload.status, 503, await upload.text());
  assert.equal((await req("/uploads/anything.webp")).status, 410);
  // CORS preflight from the web origin is answered for APP_ORIGIN only.
  const preflight = await app.request("http://localhost/api/products", {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:3000",
      "Access-Control-Request-Method": "POST",
    },
  }, env);
  assert.equal(preflight.status, 204);
  assert.equal(
    preflight.headers.get("access-control-allow-origin"),
    "http://localhost:3000",
  );
  assert.equal(
    preflight.headers.get("access-control-allow-credentials"),
    "true",
  );
  // A cross-site fetch from the web origin itself is allowed …
  const crossSiteLogin = await req("/api/auth/login", {
    body: { email: "admin@example.test", password },
    headers: {
      Origin: "http://localhost:3000",
      "sec-fetch-site": "cross-site",
    },
  });
  assert.equal(crossSiteLogin.status, 200, JSON.stringify(crossSiteLogin.body));
  // … but a cross-site fetch from any other origin is still blocked.
  const evilLogin = await req("/api/auth/login", {
    body: { email: "admin@example.test", password },
    headers: {
      Origin: "https://evil.example",
      "sec-fetch-site": "cross-site",
    },
  });
  assert.equal(evilLogin.status, 403);
});

test("health reports the service name, filters endpoint works, and Cloudinary image URLs are accepted", async () => {
  resetRateLimits();
  const health = await req("/api/health");
  assert.equal(health.status, 200);
  assert.equal(health.body.service, "almost-formal-api");
  assert.equal(health.body.ok, true);
  const stocked = await product(1);
  const soldOut = await product(0);
  const filters = await req("/api/product-filters");
  assert.equal(filters.status, 200);
  assert.ok(filters.body.categories.includes("Regular Ties"));
  assert.ok(filters.body.maxPrice >= 129000);
  const inStock = await req("/api/products?inStock=true&limit=100");
  assert.equal(inStock.status, 200);
  assert.ok(inStock.body.products.some((x: { id: string }) => x.id === stocked.id));
  assert.ok(!inStock.body.products.some((x: { id: string }) => x.id === soldOut.id));
  // Admin can create a product with a Cloudinary image URL (the
  // live upload URL shape) — the old Hono port rejected these.
  jar = "";
  const login = await req("/api/auth/login", {
    body: { email: "admin@example.test", password },
    headers: { Origin: "http://localhost:3000" },
  });
  assert.equal(login.status, 200);
  const csrf = (await req("/api/auth/me")).body.csrfToken;
  const slug = `cloudinary-${randomUUID()}`;
  const created = await req("/api/admin/products", {
    body: {
      title: "Cloudinary Tie",
      slug,
      sku: slug,
      description: "A product whose image lives on Cloudinary.",
      price: 120000,
      stock: 1,
      category: "Regular Ties",
      pattern: "Solid",
      color: "Blue",
      condition: "Good",
      conditionNote: "Minor wear",
      flaws: "None",
      length: 147,
      width: 9,
      material: null,
      era: null,
      featured: false,
      imageUrls: [
        "https://res.cloudinary.com/dmwgexmef/image/upload/v1/almost-formal/products/test.webp",
      ],
    },
    headers: { "x-csrf-token": csrf },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  // A Cloudinary URL for a different cloud must be rejected.
  const wrongCloud = await req("/api/admin/products", {
    body: {
      title: "Wrong Cloud Tie",
      slug: `wrong-${randomUUID()}`,
      sku: `wrong-${randomUUID()}`,
      description: "A product with an image from another cloud.",
      price: 120000,
      stock: 1,
      category: "Regular Ties",
      pattern: "Solid",
      color: "Blue",
      condition: "Good",
      conditionNote: "Minor wear",
      flaws: "None",
      length: 147,
      width: 9,
      material: null,
      era: null,
      featured: false,
      imageUrls: [
        "https://res.cloudinary.com/othercloud/image/upload/v1/almost-formal/products/test.webp",
      ],
    },
    headers: { "x-csrf-token": csrf },
  });
  assert.equal(wrongCloud.status, 400);
});
