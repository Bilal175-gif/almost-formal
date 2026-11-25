import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test, beforeEach, afterEach } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { hash } from "argon2";
import worker from "../src/index.ts";
import { verifyPassword } from "../src/auth.ts";
import { sendContactNotification, sendOrderCreated, sendOrderStatus } from "../src/email.ts";
import { uploadImage } from "../src/media.ts";

const password = "test-admin-password-2026";
const passwordHash = await hash(password, { type: 2 });
const migrations = await Promise.all([
  readFile(new URL("../migrations/0001_init.sql", import.meta.url), "utf8"),
  readFile(new URL("../migrations/0002_worker_hardening.sql", import.meta.url), "utf8"),
  readFile(new URL("../migrations/0004_product_discount.sql", import.meta.url), "utf8"),
]);
const originalFetch = globalThis.fetch;
const originalConsoleError = console.error;
let sqlite;
let env;
let waitUntilTasks;
let emailRequests;
let emailFailure;

function makeD1(database) {
  let batchLock = Promise.resolve();

  return {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() {
              return database.prepare(sql).get(...values) ?? null;
            },
            async all() {
              return { results: database.prepare(sql).all(...values) };
            },
            async run() {
              const result = database.prepare(sql).run(...values);
              return { meta: { changes: Number(result.changes) } };
            },
          };
        },
      };
    },
    async batch(statements) {
      const previous = batchLock;
      let release;
      batchLock = new Promise((resolve) => {
        release = resolve;
      });
      await previous;
      let transactionStarted = false;
      try {
        database.exec("BEGIN");
        transactionStarted = true;
        const results = await Promise.all(statements.map((statement) => statement.run()));
        database.exec("COMMIT");
        transactionStarted = false;
        return results;
      } catch (error) {
        if (transactionStarted) database.exec("ROLLBACK");
        throw error;
      } finally {
        release();
      }
    },
  };
}

function request(path, { method = "GET", body, cookie, csrfToken, headers = {} } = {}) {
  const requestHeaders = new Headers({
    Origin: "https://store.example.test",
    ...headers,
  });
  if (body !== undefined) requestHeaders.set("Content-Type", "application/json");
  if (cookie) requestHeaders.set("Cookie", cookie);
  if (csrfToken) requestHeaders.set("X-CSRF-Token", csrfToken);
  return worker.fetch(
    new Request(`https://api.example.test${path}`, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
    { waitUntil: (promise) => waitUntilTasks.push(promise) },
  );
}

async function login() {
  const response = await request("/api/auth/login", {
    method: "POST",
    body: { email: "admin@example.test", password },
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie").split(";")[0];
  return { cookie, csrfToken: (await response.json()).csrfToken };
}

async function drainWaitUntil() {
  const tasks = waitUntilTasks;
  waitUntilTasks = [];
  await Promise.all(tasks);
}

async function createOrder(idempotencyKey = crypto.randomUUID()) {
  return request("/api/orders", {
    method: "POST",
    body: {
      address: {
        name: "Test Customer",
        email: "customer@example.test",
        phone: "03001234567",
        line1: "123 Test Street",
        city: "Karachi",
        state: "Sindh",
        postalCode: "75500",
      },
      items: [{ productId: "product-1", quantity: 1 }],
      idempotencyKey,
      paymentMethod: "cod",
    },
  });
}

beforeEach(async () => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const migration of migrations) sqlite.exec(migration);
  sqlite.prepare(
    'INSERT INTO "User" ("id", "email", "name", "passwordHash", "createdAt") VALUES (?, ?, ?, ?, ?)',
  ).run("user-admin", "admin@example.test", "Test Admin", passwordHash, new Date().toISOString());
  sqlite.prepare('INSERT INTO "Admin" ("id", "userId") VALUES (?, ?)').run("admin-1", "user-admin");
  sqlite.prepare('INSERT INTO "Category" ("id", "name", "slug") VALUES (?, ?, ?)').run("category-1", "Regular Ties", "regular-ties");
  sqlite.prepare(
    'INSERT INTO "Product" ("id", "slug", "sku", "title", "description", "price", "stock", "pattern", "color", "condition", "conditionNote", "flaws", "length", "width", "category", "featured", "archived", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run("product-1", "test-tie", "TEST-1", "Test Tie", "A test product for the Cloudflare Worker.", 129000, 2, "Striped", "Green", "Good", "Light wear.", "None", 147, 9, "Regular Ties", 0, 0, new Date().toISOString(), new Date().toISOString());
  sqlite.prepare(
    'INSERT INTO "ProductImage" ("id", "productId", "url", "alt", "position") VALUES (?, ?, ?, ?, ?)',
  ).run("image-1", "product-1", "/images/tie.webp", "Test Tie", 0);
  sqlite.prepare('INSERT INTO "ProductCategory" ("productId", "categoryId") VALUES (?, ?)').run("product-1", "category-1");
  env = {
    DB: makeD1(sqlite),
    APP_ORIGIN: "https://store.example.test",
    ALLOWED_ORIGINS: "https://store.example.test",
    CLOUDINARY_CLOUD_NAME: "test-cloud",
    CLOUDINARY_API_KEY: "test-api-key",
    CLOUDINARY_API_SECRET: "test-api-secret",
    RESEND_API_KEY: "test-resend-key",
    EMAIL_FROM: "Almost Formal <orders@example.test>",
    STORE_NOTIFICATION_EMAIL: "owner@example.test",
  };
  waitUntilTasks = [];
  emailRequests = [];
  emailFailure = false;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url === "https://api.resend.com/emails") {
      emailRequests.push(JSON.parse(init.body));
      return new Response("{}", { status: emailFailure ? 503 : 200 });
    }
    if (url.endsWith("/image/upload")) {
      return Response.json({
        secure_url: "https://res.cloudinary.com/test-cloud/image/upload/v123/almost-formal/products/test.webp",
      });
    }
    if (url.endsWith("/image/destroy")) return Response.json({ result: "ok" });
    throw new Error(`Unexpected outbound request: ${url}`);
  };
});

afterEach(async () => {
  await drainWaitUntil();
  sqlite.close();
  globalThis.fetch = originalFetch;
  console.error = originalConsoleError;
});

test("existing Express Argon2id hashes verify without password-hash downgrade", async () => {
  assert.equal(await verifyPassword(password, passwordHash), true);
  assert.equal(await verifyPassword("wrong-password", passwordHash), false);
  assert.equal(await verifyPassword(password, "pbkdf2-sha256$600000$deadbeef$deadbeef"), false);
  assert.equal(await verifyPassword(password, "$argon2id$v=19$m=999999,t=3,p=4$salt$hash"), false);
});

test("admin login, permissions, CSRF, secure cookies, and logout", async () => {
  const denied = await request("/api/admin/dashboard");
  assert.equal(denied.status, 401);
  const session = await login();
  assert.match(session.cookie, /^af_session=.*;?$/);
  const dashboard = await request("/api/admin/dashboard", { cookie: session.cookie });
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.headers.get("x-frame-options"), "DENY");
  assert.equal(dashboard.headers.get("x-content-type-options"), "nosniff");
  assert.equal(
    (await request("/api/admin/categories", {
      method: "POST",
      body: { name: "Bow Ties", slug: "bow-ties" },
      cookie: session.cookie,
    })).status,
    403,
  );
  assert.equal(
    (await request("/api/admin/categories", {
      method: "POST",
      body: { name: "Bow Ties", slug: "bow-ties" },
      cookie: session.cookie,
      csrfToken: session.csrfToken,
    })).status,
    201,
  );
  assert.equal(
    (await request("/api/auth/logout", {
      method: "POST",
      cookie: session.cookie,
      csrfToken: session.csrfToken,
    })).status,
    200,
  );
  assert.equal((await request("/api/admin/dashboard", { cookie: session.cookie })).status, 401);
});

test("checkout preserves idempotency, reserves stock once, and sends notifications", async () => {
  const key = crypto.randomUUID();
  const first = await createOrder(key);
  assert.equal(first.status, 201);
  const order = await first.json();
  assert.equal(order.total, 154000);
  assert.equal(sqlite.prepare('SELECT "stock" FROM "Product" WHERE "id" = ?').get("product-1").stock, 1);
  const replay = await createOrder(key);
  assert.equal(replay.status, 201);
  assert.equal((await replay.json()).id, order.id);
  await drainWaitUntil();
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM "Order"').get().count, 1);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM "InventoryMovement" WHERE "reason" = ?').get("Order placed").count, 1);
  assert.equal(emailRequests.length, 2);
  assert.match(emailRequests[0].text, /Private tracking code/);
  assert.equal(emailRequests[1].to[0], "owner@example.test");
});

test("sale prices are charged and externally sold pieces cannot be ordered", async () => {
  const session = await login();
  const headers = { method: "PATCH", cookie: session.cookie, csrfToken: session.csrfToken };
  const discounted = await request("/api/admin/products/product-1", { ...headers, body: { discountPercent: 20 } });
  assert.equal(discounted.status, 200);
  assert.equal((await (await request("/api/products/test-tie")).json()).discountPercent, 20);
  const ordered = await createOrder();
  assert.equal(ordered.status, 201);
  const order = await ordered.json();
  assert.equal(order.items[0].price, 103200);
  assert.equal(order.subtotal, 103200);
  const sold = await request("/api/admin/products/product-1", { ...headers, body: { stock: 0 } });
  assert.equal(sold.status, 200);
  assert.equal((await createOrder()).status, 409);
});

test("catalog, newsletter, customer, inventory, settings, and product admin endpoints", async () => {
  const search = await request("/api/products?search=Test&category=Regular%20Ties&pattern=Striped&maxPrice=200000&featured=false&inStock=true&sort=name&page=1&limit=1");
  assert.equal(search.status, 200);
  const searchResult = await search.json();
  assert.equal(searchResult.total, 1);
  assert.equal(searchResult.products[0].images.length, 1);
  assert.equal((await (await request("/api/products/test-tie")).json()).id, "product-1");
  assert.deepEqual(await (await request("/api/product-filters")).json(), {
    categories: ["Regular Ties"],
    patterns: ["Striped"],
    colors: ["Green"],
    conditions: ["Good"],
    maxPrice: 129000,
  });
  assert.equal((await (await request("/api/categories")).json())[0]._count.products, 1);

  for (let index = 0; index < 2; index++) {
    assert.equal((await request("/api/newsletter", {
      method: "POST",
      body: { email: "subscriber@example.test" },
    })).status, 200);
  }
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM "Subscriber"').get().count, 1);

  const createdOrder = await createOrder();
  const order = await createdOrder.json();
  const tracked = await request(`/api/orders/${order.number}`, {
    headers: { "X-Order-Token": order.accessToken },
  });
  assert.equal(tracked.status, 200);
  assert.equal((await tracked.json()).id, order.id);

  const session = await login();
  const category = await request("/api/admin/categories", {
    method: "POST",
    body: { name: "Bow Ties", slug: "bow-ties" },
    cookie: session.cookie,
    csrfToken: session.csrfToken,
  });
  assert.equal(category.status, 201);
  const product = await request("/api/admin/products", {
    method: "POST",
    body: {
      title: "Created Test Tie",
      slug: "created-test-tie",
      sku: "TEST-2",
      description: "A second test tie for administrative CRUD coverage.",
      price: 25000,
      stock: 3,
      category: "Bow Ties",
      pattern: "Solid",
      color: "Blue",
      condition: "Excellent",
      conditionNote: "Excellent condition.",
      flaws: "None",
      length: 140,
      width: 8,
      material: null,
      era: null,
      featured: false,
      imageUrls: ["https://res.cloudinary.com/test-cloud/image/upload/v123/almost-formal/products/test.webp"],
    },
    cookie: session.cookie,
    csrfToken: session.csrfToken,
  });
  assert.equal(product.status, 201);
  const createdProduct = await product.json();
  const updated = await request(`/api/admin/products/${createdProduct.id}`, {
    method: "PATCH",
    body: { stock: 5 },
    cookie: session.cookie,
    csrfToken: session.csrfToken,
  });
  assert.equal((await updated.json()).stock, 5);
  assert.ok(sqlite.prepare('SELECT COUNT(*) AS count FROM "InventoryMovement" WHERE "productId" = ?').get(createdProduct.id).count >= 2);

  const customers = await request("/api/admin/customers", { cookie: session.cookie });
  assert.equal((await customers.json())[0].orders[0].id, order.id);
  assert.equal((await request("/api/admin/orders", { cookie: session.cookie })).status, 200);
  assert.equal((await request("/api/admin/inventory", { cookie: session.cookie })).status, 200);
  const settings = await request("/api/admin/settings", {
    method: "PATCH",
    body: { shipping: 30000, announcement: "Fresh finds." },
    cookie: session.cookie,
    csrfToken: session.csrfToken,
  });
  assert.equal((await settings.json()).shipping, 30000);

  const deleted = await request(`/api/admin/products/${createdProduct.id}`, {
    method: "DELETE",
    cookie: session.cookie,
    csrfToken: session.csrfToken,
  });
  assert.equal(deleted.status, 200);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM "Product" WHERE "id" = ?').get(createdProduct.id).count, 0);
  await drainWaitUntil();
});

test("checkout failures and email provider failures do not remove saved orders", async () => {
  emailFailure = true;
  const response = await createOrder();
  assert.equal(response.status, 201);
  await drainWaitUntil();
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM "Order"').get().count, 1);
  assert.equal(sqlite.prepare('SELECT "stock" FROM "Product" WHERE "id" = ?').get("product-1").stock, 1);
  const bad = await request("/api/orders", {
    method: "POST",
    body: {
      address: { name: "Customer", email: "bad", phone: "", line1: "", city: "", state: "", postalCode: "" },
      items: [{ productId: "product-1", quantity: 2 }],
      idempotencyKey: crypto.randomUUID(),
      paymentMethod: "cod",
    },
  });
  assert.equal(bad.status, 400);
});

test("cancellation restores inventory once and stale status updates have no effects", async () => {
  const session = await login();
  const created = await createOrder();
  const order = await created.json();
  const cancelled = await request(`/api/admin/orders/${order.id}/status`, {
    method: "PATCH",
    body: { status: "cancelled" },
    cookie: session.cookie,
    csrfToken: session.csrfToken,
  });
  assert.equal(cancelled.status, 200, await cancelled.clone().text());
  assert.equal(sqlite.prepare('SELECT "stock" FROM "Product" WHERE "id" = ?').get("product-1").stock, 2);
  const stale = await request(`/api/admin/orders/${order.id}/status`, {
    method: "PATCH",
    body: { status: "shipped", trackingNumber: "STALE-1" },
    cookie: session.cookie,
    csrfToken: session.csrfToken,
  });
  assert.equal(stale.status, 409);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM "AuditLog" WHERE "target" = ?').get(order.id).count, 1);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM "InventoryMovement" WHERE "orderId" = ? AND "reason" = ?').get(order.id, "Order cancelled").count, 1);
});

test("concurrent status transitions gate audit, shipment, payment, and inventory side effects", async () => {
  const session = await login();
  const created = await createOrder();
  const order = await created.json();
  const updates = await Promise.all([
    request(`/api/admin/orders/${order.id}/status`, {
      method: "PATCH",
      body: { status: "cancelled" },
      cookie: session.cookie,
      csrfToken: session.csrfToken,
    }),
    request(`/api/admin/orders/${order.id}/status`, {
      method: "PATCH",
      body: { status: "cancelled" },
      cookie: session.cookie,
      csrfToken: session.csrfToken,
    }),
  ]);
  assert.ok(updates.every((response) => response.status === 200 || response.status === 409));
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM "AuditLog" WHERE "target" = ?').get(order.id).count, 1);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM "InventoryMovement" WHERE "orderId" = ? AND "reason" = ?').get(order.id, "Order cancelled").count, 1);
  assert.equal(sqlite.prepare('SELECT "stock" FROM "Product" WHERE "id" = ?').get("product-1").stock, 2);
});

test("contact and shipped/delivered/cancelled events send Resend mail without blocking saved records", async () => {
  const session = await login();
  emailFailure = true;
  const contact = await request("/api/contact", {
    method: "POST",
    body: { name: "Customer", email: "customer@example.test", message: "Please tell me about this vintage tie." },
  });
  assert.equal(contact.status, 201);
  await drainWaitUntil();
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM "ContactMessage"').get().count, 1);
  assert.equal(emailRequests[0].reply_to, "customer@example.test");

  emailFailure = false;
  const first = await createOrder();
  const shippedOrder = await first.json();
  for (const status of ["confirmed", "packed", "shipped", "delivered"]) {
    const response = await request(`/api/admin/orders/${shippedOrder.id}/status`, {
      method: "PATCH",
      body: { status, ...(status === "shipped" ? { trackingNumber: "TRACK-123", carrier: "Courier" } : {}) },
      cookie: session.cookie,
      csrfToken: session.csrfToken,
    });
    assert.equal(response.status, 200, `${status}: ${await response.clone().text()}`);
  }
  const second = await createOrder();
  const cancelledOrder = await second.json();
  const cancelled = await request(`/api/admin/orders/${cancelledOrder.id}/status`, {
    method: "PATCH",
    body: { status: "cancelled" },
    cookie: session.cookie,
    csrfToken: session.csrfToken,
  });
  assert.equal(cancelled.status, 200, await cancelled.clone().text());
  await drainWaitUntil();
  const subjects = emailRequests.map((message) => message.subject);
  assert.ok(subjects.some((subject) => subject.includes(": shipped")));
  assert.ok(subjects.some((subject) => subject.includes(": delivered")));
  assert.ok(subjects.some((subject) => subject.includes(": cancelled")));
});

test("image upload decodes supported formats, enforces size/dimensions, and rejects spoofed or corrupt files", async () => {
  const formats = [
    ["jpeg", "image/jpeg", Buffer.from("/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAADAAQDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAABf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJYB8K//2Q==", "base64")],
    ["png", "image/png", Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVR4nGMIqFgARww4OQBFhhDhfnSObwAAAABJRU5ErkJggg==", "base64")],
    ["webp", "image/webp", Buffer.from("UklGRjQAAABXRUJQVlA4ICgAAACQAQCdASoEAAMAAUAmJZACdLoAA5gA/ueL/9wZn1djh+6Ni62icAAA", "base64")],
  ];
  for (const [extension, type, bytes] of formats) {
    const form = new FormData();
    form.set("image", new File([bytes], `tie.${extension}`, { type }));
    const url = await uploadImage(env, new Request("https://api.example.test/upload", { method: "POST", body: form }));
    assert.match(url, /^https:\/\/res\.cloudinary\.com\/test-cloud\//);
  }
  const spoofed = new FormData();
  spoofed.set("image", new File([formats[1][2]], "tie.jpg", { type: "image/jpeg" }));
  await assert.rejects(
    () => uploadImage(env, new Request("https://api.example.test/upload", { method: "POST", body: spoofed })),
    /valid JPEG, PNG or WebP/,
  );
  const corrupt = new FormData();
  corrupt.set("image", new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])], "bad.png", { type: "image/png" }));
  await assert.rejects(
    () => uploadImage(env, new Request("https://api.example.test/upload", { method: "POST", body: corrupt })),
    /valid JPEG, PNG or WebP/,
  );
  const tooLarge = new FormData();
  tooLarge.set("image", new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }));
  await assert.rejects(
    () => uploadImage(env, new Request("https://api.example.test/upload", { method: "POST", body: tooLarge })),
    /under 5 MB/,
  );
});

test("rate limits expire records and API responses include security headers", async () => {
  sqlite.prepare('INSERT INTO "RateLimit" ("key", "count", "expiresAt") VALUES (?, ?, ?)').run("expired", 1, Date.now() - 1);
  const response = await request("/api/settings");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM "RateLimit" WHERE "key" = ?').get("expired").count, 0);
  let last;
  for (let index = 0; index < 11; index++) last = await request("/api/auth/login", { method: "POST", body: {} });
  assert.equal(last.status, 429);
});

test("email helper calls Resend over HTTPS and provider errors are reported", async () => {
  emailRequests = [];
  await sendOrderCreated(env, {
    number: "AF-TEST",
    status: "pending",
    accessToken: "a".repeat(64),
    total: 10000,
    address: { name: "Customer", email: "customer@example.test", phone: "03000000000" },
    items: [{ title: "Test Tie", quantity: 1, price: 10000 }],
    shipment: null,
  });
  await sendContactNotification(env, {
    name: "Customer",
    email: "customer@example.test",
    message: "Hello store",
  });
  await sendOrderStatus(env, {
    number: "AF-TEST",
    status: "shipped",
    accessToken: "a".repeat(64),
    total: 10000,
    address: { name: "Customer", email: "customer@example.test", phone: "03000000000" },
    items: [],
    shipment: { carrier: "Courier", trackingNumber: "TRACK-1" },
  });
  assert.equal(emailRequests.length, 4);
  assert.equal(emailRequests[2].reply_to, "customer@example.test");
  assert.match(emailRequests[3].text, /TRACK-1/);
  assert.equal(await sendOrderStatus(env, {
    number: "AF-TEST",
    status: "packed",
    accessToken: "a".repeat(64),
    total: 10000,
    address: { name: "Customer", email: "customer@example.test", phone: "03000000000" },
    items: [],
    shipment: null,
  }), undefined);
});
