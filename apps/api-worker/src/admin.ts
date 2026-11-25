import { z } from "zod";
import { all, ApiError, bools, first, id, json, run, statement, type D1Database, type Env } from "./db";
import { withImages } from "./catalog";
import { allowedImageUrl, deleteImage, publicId } from "./media";
import { orderDetails, type OrderDetails, type OrderRow } from "./orders";

const productSchema = z.object({
  title: z.string().trim().min(2).max(150), slug: z.string().regex(/^[a-z0-9-]+$/), sku: z.string().min(2).max(60),
  description: z.string().min(10).max(3000), price: z.number().int().positive().max(100000000), discountPercent: z.number().int().min(0).max(99).default(0), stock: z.number().int().min(0).max(10000),
  category: z.string().min(1), pattern: z.string().min(1), color: z.string().min(1), condition: z.enum(["Excellent", "Good", "Worn (character)"]),
  conditionNote: z.string().min(1).max(1000), flaws: z.string().max(1000), length: z.number().positive(), width: z.number().positive(),
  material: z.string().nullable(), era: z.string().nullable(), featured: z.boolean(), archived: z.boolean().optional(),
  imageUrls: z.array(z.string()).min(1).max(8).optional(),
});

type ProductInput = z.infer<typeof productSchema>;

function validateImages(env: Env, urls: string[] | undefined) {
  if (urls && urls.some((url) => !allowedImageUrl(env, url))) throw new ApiError(400, "Use an image uploaded to this store.");
}

async function categoryId(db: D1Database, name: string) {
  const category = await first<{ id: string }>(db, 'SELECT "id" FROM "Category" WHERE "name" = ?', name);
  if (!category) throw new ApiError(400, "Choose an existing category.");
  return category.id;
}

async function cleanupImages(db: D1Database, env: Env, urls: string[]) {
  for (const url of new Set(urls)) {
    if (!publicId(env, url)) continue;
    const refs = await first<{ count: number }>(db, 'SELECT (SELECT COUNT(*) FROM "ProductImage" WHERE "url" = ?) + (SELECT COUNT(*) FROM "OrderItem" WHERE "image" = ?) AS count', url, url);
    if (!refs?.count) await deleteImage(env, url);
  }
}

export async function adminProducts(db: D1Database) {
  return json(await withImages(db, await all(db, 'SELECT * FROM "Product" ORDER BY "createdAt" DESC')));
}

export async function createProduct(db: D1Database, env: Env, adminId: string, input: unknown) {
  const data = productSchema.parse(input);
  if (!data.imageUrls) throw new ApiError(400, "Add at least one product image.");
  validateImages(env, data.imageUrls);
  const category = await categoryId(db, data.category);
  const productId = id();
  const now = new Date().toISOString();
  const fields = ["id", "slug", "sku", "title", "description", "price", "discountPercent", "stock", "pattern", "color", "condition", "conditionNote", "flaws", "length", "width", "material", "era", "category", "featured", "archived", "createdAt", "updatedAt"];
  const values = fields.map((field) => field === "id" ? productId : field === "createdAt" || field === "updatedAt" ? now : field === "featured" || field === "archived" ? Number(Boolean(data[field])) : data[field as keyof ProductInput]);
  const stmts = [
    statement(db, `INSERT INTO "Product" (${fields.map((field) => `"${field}"`).join(",")}) VALUES (${fields.map(() => "?").join(",")})`, ...values),
    statement(db, 'INSERT INTO "ProductCategory" ("productId", "categoryId") VALUES (?, ?)', productId, category),
    statement(db, 'INSERT INTO "InventoryMovement" ("id", "productId", "delta", "reason", "createdAt") VALUES (?, ?, ?, ?, ?)', id(), productId, data.stock, "Admin created product", now),
    statement(db, 'INSERT INTO "AuditLog" ("id", "adminId", "action", "target", "createdAt") VALUES (?, ?, ?, ?, ?)', id(), adminId, "product.create", productId, now),
  ];
  for (const [position, url] of data.imageUrls.entries()) stmts.push(statement(db, 'INSERT INTO "ProductImage" ("id", "productId", "url", "alt", "position") VALUES (?, ?, ?, ?, ?)', id(), productId, url, data.title, position));
  await db.batch(stmts);
  return json((await withImages(db, [await first(db, 'SELECT * FROM "Product" WHERE "id" = ?', productId) as { id: string; slug: string }]))[0], 201);
}

export async function updateProduct(db: D1Database, env: Env, adminId: string, productId: string, input: unknown, ctx: ExecutionContextLike) {
  const data = productSchema.partial().parse(input);
  validateImages(env, data.imageUrls);
  const before = await first<{ id: string; title: string; stock: number }>(db, 'SELECT "id", "title", "stock" FROM "Product" WHERE "id" = ?', productId);
  if (!before) throw new ApiError(404, "Product not found.");
  const oldImages = data.imageUrls ? await all<{ url: string }>(db, 'SELECT "url" FROM "ProductImage" WHERE "productId" = ?', productId) : [];
  const category = data.category ? await categoryId(db, data.category) : null;
  const now = new Date().toISOString();
  const fields = Object.keys(data).filter((key) => key !== "imageUrls");
  const values = fields.map((key) => key === "featured" || key === "archived" ? Number(Boolean(data[key as keyof ProductInput])) : data[key as keyof ProductInput]);
  const stmts = [
    statement(db, `UPDATE "Product" SET ${fields.map((key) => `"${key}" = ?`).join(", ")}${fields.length ? ", " : ""}"updatedAt" = ? WHERE "id" = ?`, ...values, now, productId),
    statement(db, 'INSERT INTO "AuditLog" ("id", "adminId", "action", "target", "createdAt") VALUES (?, ?, ?, ?, ?)', id(), adminId, "product.update", productId, now),
  ];
  if (data.stock !== undefined && data.stock !== before.stock) stmts.push(statement(db, 'INSERT INTO "InventoryMovement" ("id", "productId", "delta", "reason", "createdAt") VALUES (?, ?, ?, ?, ?)', id(), productId, data.stock - before.stock, "Admin inventory adjustment", now));
  if (category) {
    stmts.push(statement(db, 'DELETE FROM "ProductCategory" WHERE "productId" = ?', productId));
    stmts.push(statement(db, 'INSERT INTO "ProductCategory" ("productId", "categoryId") VALUES (?, ?)', productId, category));
  }
  if (data.imageUrls) {
    stmts.push(statement(db, 'DELETE FROM "ProductImage" WHERE "productId" = ?', productId));
    for (const [position, url] of data.imageUrls.entries()) stmts.push(statement(db, 'INSERT INTO "ProductImage" ("id", "productId", "url", "alt", "position") VALUES (?, ?, ?, ?, ?)', id(), productId, url, data.title || before.title, position));
  }
  await db.batch(stmts);
  if (data.imageUrls) ctx.waitUntil(cleanupImages(db, env, oldImages.map((image) => image.url).filter((url) => !data.imageUrls!.includes(url))));
  return json((await withImages(db, [await first(db, 'SELECT * FROM "Product" WHERE "id" = ?', productId) as { id: string; slug: string }]))[0]);
}

export async function removeProduct(db: D1Database, env: Env, adminId: string, productId: string, ctx: ExecutionContextLike) {
  const count = await first<{ count: number }>(db, 'SELECT COUNT(*) AS count FROM "OrderItem" WHERE "productId" = ?', productId);
  if (count?.count) throw new ApiError(409, "This product has order history. Archive it instead.");
  const images = await all<{ url: string }>(db, 'SELECT "url" FROM "ProductImage" WHERE "productId" = ?', productId);
  const now = new Date().toISOString();
  await db.batch([
    statement(db, 'DELETE FROM "InventoryMovement" WHERE "productId" = ?', productId),
    statement(db, 'DELETE FROM "Product" WHERE "id" = ?', productId),
    statement(db, 'INSERT INTO "AuditLog" ("id", "adminId", "action", "target", "createdAt") VALUES (?, ?, ?, ?, ?)', id(), adminId, "product.delete", productId, now),
  ]);
  ctx.waitUntil(cleanupImages(db, env, images.map((image) => image.url)));
  return json({ ok: true });
}

export interface ExecutionContextLike { waitUntil(promise: Promise<unknown>): void }

export async function dashboard(db: D1Database) {
  const stats = await first<Record<string, number>>(db, `SELECT
    (SELECT COUNT(*) FROM "Order") AS totalOrders,
    (SELECT COUNT(*) FROM "Order" WHERE "status" = 'pending') AS pending,
    (SELECT COUNT(*) FROM "Order" WHERE "status" = 'delivered') AS completed,
    (SELECT COUNT(*) FROM "Product" WHERE "stock" > 0 AND "archived" = 0) AS available,
    (SELECT COUNT(*) FROM "Product" WHERE "stock" = 0 AND "archived" = 0) AS soldOut,
    (SELECT COALESCE(SUM("total"), 0) FROM "Order" WHERE "status" = 'delivered') AS revenue`);
  const recent = await all<OrderRow>(db, 'SELECT * FROM "Order" ORDER BY "createdAt" DESC LIMIT 8');
  return json({ ...stats, recent: await Promise.all(recent.map((order) => orderDetails(db, order))) });
}

export async function adminOrders(db: D1Database) {
  const rows = await all<OrderRow>(db, 'SELECT * FROM "Order" ORDER BY "createdAt" DESC LIMIT 200');
  return json(await Promise.all(rows.map((order) => orderDetails(db, order))));
}

const transitions: Record<string, string[]> = { pending: ["confirmed", "cancelled"], confirmed: ["packed", "cancelled"], packed: ["shipped", "cancelled"], shipped: ["delivered"], delivered: [], cancelled: [] };

export async function updateOrderStatus(
  db: D1Database,
  adminId: string,
  orderId: string,
  input: unknown,
  onUpdated?: (order: OrderDetails) => void,
) {
  const data = z.object({ status: z.enum(["confirmed", "packed", "shipped", "delivered", "cancelled"]), trackingNumber: z.string().max(150).optional(), carrier: z.string().max(100).optional() }).parse(input);
  const order = await first<OrderRow>(db, 'SELECT * FROM "Order" WHERE "id" = ?', orderId);
  if (!order) throw new ApiError(404, "Order not found.");
  if (order.status === data.status) return json(await orderDetails(db, order));
  if (!transitions[order.status]?.includes(data.status)) throw new ApiError(409, `Cannot change ${order.status} to ${data.status}.`);
  if (data.status === "shipped" && !data.trackingNumber) throw new ApiError(400, "A tracking number is required before shipping.");
  const now = new Date().toISOString();
  const statusChangeId = id();
  const changedOrder = 'EXISTS (SELECT 1 FROM "Order" WHERE "id" = ? AND "statusChangeId" = ?)';
  const stmts = [
    statement(db, 'UPDATE "Order" SET "status" = ?, "statusChangeId" = ?, "updatedAt" = ? WHERE "id" = ? AND "status" = ?', data.status, statusChangeId, now, orderId, order.status),
    statement(db, `INSERT INTO "AuditLog" ("id", "adminId", "action", "target", "createdAt") SELECT ?, ?, ?, ?, ? WHERE ${changedOrder}`, id(), adminId, `order.${data.status}`, orderId, now, orderId, statusChangeId),
  ];
  if (data.trackingNumber) stmts.push(statement(db, `UPDATE "Shipment" SET "trackingNumber" = ?, "carrier" = ? WHERE "orderId" = ? AND ${changedOrder}`, data.trackingNumber, data.carrier || null, orderId, orderId, statusChangeId));
  if (data.status === "delivered" || data.status === "cancelled") stmts.push(statement(db, `UPDATE "Payment" SET "status" = ? WHERE "orderId" = ? AND ${changedOrder}`, data.status === "delivered" ? "collected" : "cancelled", orderId, orderId, statusChangeId));
  if (data.status === "cancelled") {
    const items = await all<{ productId: string; quantity: number }>(db, 'SELECT "productId", "quantity" FROM "OrderItem" WHERE "orderId" = ?', orderId);
    for (const item of items) stmts.push(statement(db, `INSERT INTO "InventoryMovement" ("id", "productId", "delta", "reason", "orderId", "createdAt") SELECT ?, ?, ?, ?, ?, ? WHERE ${changedOrder}`, id(), item.productId, item.quantity, "Order cancelled", orderId, now, orderId, statusChangeId));
  }
  const results = await db.batch(stmts) as Array<{ meta?: { changes?: number } }>;
  if (results[0]?.meta?.changes !== 1)
    throw new ApiError(409, "Order status changed. Refresh and retry.");
  const updated = await first<typeof order>(db, 'SELECT * FROM "Order" WHERE "id" = ?', orderId);
  if (!updated) throw new ApiError(500, "Updated order could not be loaded.");
  const details = await orderDetails(db, updated);
  onUpdated?.(details);
  return json(details);
}

export async function inventory(db: D1Database) {
  const rows = await all<Record<string, unknown>>(db, 'SELECT m.*, p."title" AS productTitle, p."sku" AS productSku, p."stock" AS productStock FROM "InventoryMovement" m JOIN "Product" p ON p."id" = m."productId" ORDER BY m."createdAt" DESC LIMIT 200');
  return json(rows.map(({ productTitle, productSku, productStock, ...row }) => ({ ...row, product: { title: productTitle, sku: productSku, stock: productStock } })));
}

export async function customers(db: D1Database) {
  const addresses = await all<{ id: string } & Record<string, unknown>>(db, 'SELECT * FROM "Address" ORDER BY "id" DESC LIMIT 500');
  const orders = await all<{ addressId: string } & Record<string, unknown>>(db, 'SELECT "id", "addressId", "number", "total", "status", "createdAt" FROM "Order"');
  return json(addresses.map((address) => ({ ...address, orders: orders.filter((order) => order.addressId === address.id).map(({ addressId: _, ...order }) => order) })));
}

export async function messages(db: D1Database) {
  return json(await all(db, 'SELECT * FROM "ContactMessage" ORDER BY "createdAt" DESC LIMIT 100'));
}

export async function updateSettings(db: D1Database, input: unknown) {
  const data = z.object({ name: z.string().min(1).max(100), email: z.union([z.email(), z.literal("")]), phone: z.string().max(30), instagram: z.union([z.url().refine((value) => ["instagram.com", "www.instagram.com"].includes(new URL(value).hostname)), z.literal("")]), shipping: z.number().int().min(0).max(1000000), codEnabled: z.boolean(), announcement: z.string().max(200) }).partial().parse(input);
  const keys = Object.keys(data);
  if (keys.length) await run(db, `UPDATE "StoreSettings" SET ${keys.map((key) => `"${key}" = ?`).join(", ")} WHERE "id" = ?`, ...keys.map((key) => key === "codEnabled" ? Number(data.codEnabled) : data[key as keyof typeof data]), "store");
  const row = await first<Record<string, unknown>>(db, 'SELECT * FROM "StoreSettings" WHERE "id" = ?', "store");
  return json(bools(row!, ["codEnabled"]));
}

export async function createCategory(db: D1Database, input: unknown) {
  const data = z.object({ name: z.string().min(2).max(80), slug: z.string().regex(/^[a-z0-9-]+$/) }).parse(input);
  const category = { id: id(), ...data };
  await run(db, 'INSERT INTO "Category" ("id", "name", "slug") VALUES (?, ?, ?)', category.id, category.name, category.slug);
  return json(category, 201);
}
