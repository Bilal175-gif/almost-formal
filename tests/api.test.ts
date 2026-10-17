import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { hash } from "argon2";
import { randomUUID } from "node:crypto";
import { app } from "../apps/api/src/app.js";
import { db } from "../apps/api/src/db.js";
import { createOrder, updateOrderStatus } from "../apps/api/src/orders.js";
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
before(async () => {
  await db.storeSettings.create({ data: { id: "store" } });
  await db.category.create({
    data: { name: "Regular Ties", slug: "regular-ties" },
  });
  const user = await db.user.create({
    data: {
      email: "admin@example.test",
      name: "Test Admin",
      passwordHash: await hash(password),
      admin: { create: {} },
    },
    include: { admin: true },
  });
  adminId = user.admin!.id;
});
after(async () => {
  await db.$disconnect();
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
  const r = await request(app).get(
    "/api/products?search=Forest&pattern=Striped&color=Green&maxPrice=130000",
  );
  assert.equal(r.status, 200);
  assert.ok(r.body.products.some((x: { id: string }) => x.id === p.id));
  const miss = await request(app).get("/api/products?pattern=Paisley");
  assert.equal(miss.body.total, 0);
  const detail = await request(app).get(`/api/products/${p.slug}`);
  assert.equal(detail.body.sku, p.sku);
});
test("checkout rejects empty items, invalid address and duplicate product rows", async () => {
  const invalid = await request(app)
    .post("/api/orders")
    .send({ address: {}, items: [] });
  assert.equal(invalid.status, 400);
  const p = await product();
  const data = payload(p.id);
  const duplicate = await request(app)
    .post("/api/orders")
    .send({ ...data, items: [data.items[0], data.items[0]] });
  assert.equal(duplicate.status, 400);
  assert.equal(
    (await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock,
    1,
  );
});
test("order is saved with snapshots, server prices, stock deduction and scoped access", async () => {
  const p = await product();
  const r = await request(app)
    .post("/api/orders")
    .send({ ...payload(p.id), total: 1 });
  assert.equal(r.status, 201);
  assert.equal(r.body.total, 154000);
  assert.equal(r.body.items[0].sku, p.sku);
  assert.equal(
    (await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock,
    0,
  );
  assert.equal(
    (await request(app).get(`/api/orders/${r.body.id}`)).status,
    400,
  );
  assert.equal(
    (
      await request(app)
        .get(`/api/orders/${r.body.id}`)
        .set("x-order-token", "a".repeat(64))
    ).status,
    404,
  );
  const lookup = await request(app)
    .get(`/api/orders/${r.body.number}`)
    .set("x-order-token", r.body.accessToken);
  assert.equal(lookup.status, 200);
  assert.equal(lookup.body.id, r.body.id);
});
test("idempotency prevents double deduction and rejects changed request bodies", async () => {
  const p = await product(2);
  const input = payload(p.id);
  const first = await createOrder(input);
  const second = await createOrder(input);
  assert.equal(first.id, second.id);
  assert.equal(
    (await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock,
    1,
  );
  await assert.rejects(
    () => createOrder({ ...input, note: "Changed order" }),
    /changed/,
  );
});
test("competing buyers cannot purchase the same single-stock item", async () => {
  const p = await product();
  const results = await Promise.allSettled([
    createOrder(payload(p.id)),
    createOrder(payload(p.id)),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock,
    0,
  );
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
  await assert.rejects(() => createOrder(input));
  assert.equal(
    (await db.product.findUniqueOrThrow({ where: { id: available.id } })).stock,
    1,
  );
});
test("cancellation restores inventory exactly once and blocks invalid transitions", async () => {
  const p = await product();
  const order = await createOrder(payload(p.id));
  await updateOrderStatus(order.id, "cancelled", adminId);
  await updateOrderStatus(order.id, "cancelled", adminId);
  assert.equal(
    (await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock,
    1,
  );
  assert.equal(
    await db.inventoryMovement.count({
      where: { orderId: order.id, reason: "Order cancelled" },
    }),
    1,
  );
  await assert.rejects(
    () => updateOrderStatus(order.id, "shipped", adminId),
    /Cannot change/,
  );
});
test("admin authentication, authorization, CSRF and product management", async () => {
  assert.equal((await request(app).get("/api/admin/dashboard")).status, 401);
  assert.equal(
    (await request(app).post("/api/admin/products").send({})).status,
    401,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/auth/login")
        .send({ email: "admin@example.test", password: "wrong" })
    ).status,
    401,
  );
  const agent = request.agent(app);
  const login = await agent
    .post("/api/auth/login")
    .set("Origin", "http://localhost:3000")
    .send({ email: "admin@example.test", password });
  assert.equal(login.status, 200);
  assert.match(String(login.headers["set-cookie"]), /HttpOnly/);
  assert.match(String(login.headers["set-cookie"]), /SameSite=Strict/);
  const me = await agent.get("/api/auth/me");
  assert.equal(me.status, 200);
  const csrf = me.body.csrfToken;
  assert.equal(
    (await agent.patch("/api/admin/settings").send({ shipping: 1 })).status,
    403,
  );
  assert.equal(
    (
      await agent
        .patch("/api/admin/settings")
        .set("x-csrf-token", csrf)
        .set("Origin", "https://evil.example")
        .send({ shipping: 1 })
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
  const created = await agent
    .post("/api/admin/products")
    .set("x-csrf-token", csrf)
    .send(data);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const changed = await agent
    .patch(`/api/admin/products/${created.body.id}`)
    .set("x-csrf-token", csrf)
    .send({ stock: 0, archived: true });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.stock, 0);
  assert.equal((await request(app).get(`/api/products/${slug}`)).status, 404);
  assert.equal(
    (
      await agent
        .delete(`/api/admin/products/${created.body.id}`)
        .set("x-csrf-token", csrf)
    ).status,
    200,
  );
  assert.equal(
    (await agent.post("/api/auth/logout").set("x-csrf-token", csrf)).status,
    200,
  );
  assert.equal((await agent.get("/api/admin/dashboard")).status, 401);
});
test("shipping requires tracking and delivered orders cannot be cancelled", async () => {
  const p = await product();
  const order = await createOrder(payload(p.id));
  await updateOrderStatus(order.id, "confirmed", adminId);
  await updateOrderStatus(order.id, "packed", adminId);
  await assert.rejects(
    () => updateOrderStatus(order.id, "shipped", adminId),
    /tracking/,
  );
  await updateOrderStatus(
    order.id,
    "shipped",
    adminId,
    "TRACK-001",
    "Test courier",
  );
  await updateOrderStatus(order.id, "delivered", adminId);
  await assert.rejects(() => updateOrderStatus(order.id, "cancelled", adminId));
  assert.equal(
    (await db.payment.findUniqueOrThrow({ where: { orderId: order.id } }))
      .status,
    "collected",
  );
});
