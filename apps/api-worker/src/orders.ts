import { checkoutSchema } from "../../../packages/shared/index";
import { all, ApiError, first, id, json, sha256, statement, type D1Database } from "./db";

export type OrderRow = Record<string, unknown> & {
  id: string;
  number: string;
  requestHash: string;
  accessToken: string;
  addressId: string;
  status: string;
  total: number;
};
type Item = { productId: string; quantity: number };
export type OrderDetails = OrderRow & {
  items: Array<{ title: string; quantity: number; price: number }>;
  address: { name: string; email: string; phone: string; line1: string; city: string; state: string; postalCode: string } | null;
  shipment: { carrier: string | null; trackingNumber: string | null } | null;
};

export async function orderDetails(db: D1Database, order: OrderRow): Promise<OrderDetails> {
  const [items, address, payment, shipment] = await Promise.all([
    all<{ title: string; quantity: number; price: number }>(db, 'SELECT * FROM "OrderItem" WHERE "orderId" = ? ORDER BY "rowid"', order.id),
    first<{ name: string; email: string; phone: string; line1: string; city: string; state: string; postalCode: string }>(db, 'SELECT * FROM "Address" WHERE "id" = ?', order.addressId),
    first(db, 'SELECT * FROM "Payment" WHERE "orderId" = ?', order.id),
    first<{ carrier: string | null; trackingNumber: string | null }>(db, 'SELECT * FROM "Shipment" WHERE "orderId" = ?', order.id),
  ]);
  return { ...order, items, address, payment, shipment };
}

export async function createOrder(
  db: D1Database,
  input: unknown,
  onCreated?: (order: OrderDetails) => void,
) {
  const data = checkoutSchema.parse(input);
  if (new Set(data.items.map((item: Item) => item.productId)).size !== data.items.length)
    throw new ApiError(400, "A product may only appear once in your bag.");
  const hash = await sha256(JSON.stringify(data));
  const previous = await first<OrderRow>(db, 'SELECT * FROM "Order" WHERE "idempotencyKey" = ?', data.idempotencyKey);
  if (previous) {
    if (previous.requestHash !== hash) throw new ApiError(409, "Checkout details changed. Please start a new checkout.");
    return json(await orderDetails(db, previous), 201);
  }
  const settings = await first<{ shipping: number; codEnabled: number }>(db, 'SELECT "shipping", "codEnabled" FROM "StoreSettings" WHERE "id" = ?', "store");
  if (!settings || !settings.codEnabled) throw new ApiError(400, "Cash on delivery is currently unavailable.");
  const placeholders = data.items.map(() => "?").join(",");
  const products = await all<{ id: string; title: string; sku: string; price: number; stock: number; archived: number }>(db, `SELECT "id", "title", "sku", "price", "stock", "archived" FROM "Product" WHERE "id" IN (${placeholders})`, ...data.items.map((item: Item) => item.productId));
  const images = await all<{ productId: string; url: string }>(db, `SELECT "productId", "url" FROM "ProductImage" WHERE "productId" IN (${placeholders}) ORDER BY "position"`, ...data.items.map((item: Item) => item.productId));
  let subtotal = 0;
  for (const item of data.items) {
    const product = products.find((entry) => entry.id === item.productId);
    if (!product || product.archived || product.stock < item.quantity)
      throw new ApiError(409, "A product in your bag is no longer available.");
    subtotal += product.price * item.quantity;
  }
  const total = subtotal + settings.shipping;
  const orderId = id();
  const addressId = id();
  const accessToken = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const number = `AF-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;
  const now = new Date().toISOString();
  const stmts = [
    statement(db, 'INSERT INTO "Address" ("id", "name", "email", "phone", "line1", "city", "state", "postalCode") VALUES (?, ?, ?, ?, ?, ?, ?, ?)', addressId, data.address.name, data.address.email, data.address.phone, data.address.line1, data.address.city, data.address.state, data.address.postalCode),
    statement(db, 'INSERT INTO "Order" ("id", "number", "idempotencyKey", "requestHash", "accessToken", "addressId", "status", "subtotal", "shipping", "total", "note", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', orderId, number, data.idempotencyKey, hash, accessToken, addressId, "pending", subtotal, settings.shipping, total, data.note || "", now, now),
  ];
  for (const item of data.items) {
    const product = products.find((entry) => entry.id === item.productId)!;
    stmts.push(statement(db, 'INSERT INTO "OrderItem" ("id", "orderId", "productId", "title", "sku", "price", "image", "quantity") VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id(), orderId, product.id, product.title, product.sku, product.price, images.find((image) => image.productId === product.id)?.url || "", item.quantity));
    stmts.push(statement(db, 'INSERT INTO "InventoryMovement" ("id", "productId", "delta", "reason", "orderId", "createdAt") VALUES (?, ?, ?, ?, ?, ?)', id(), product.id, -item.quantity, "Order placed", orderId, now));
  }
  stmts.push(statement(db, 'INSERT INTO "Payment" ("id", "orderId", "method", "status", "amount") VALUES (?, ?, ?, ?, ?)', id(), orderId, "cod", "pending", total));
  stmts.push(statement(db, 'INSERT INTO "Shipment" ("id", "orderId") VALUES (?, ?)', id(), orderId));
  try {
    await db.batch(stmts);
  } catch (error) {
    const concurrent = await first<OrderRow>(db, 'SELECT * FROM "Order" WHERE "idempotencyKey" = ?', data.idempotencyKey);
    if (concurrent) {
      if (concurrent.requestHash !== hash) throw new ApiError(409, "Checkout details changed. Please start a new checkout.");
      return json(await orderDetails(db, concurrent), 201);
    }
    console.error("D1 checkout batch failed", error);
    throw new ApiError(409, "A product changed during checkout. Please refresh your bag and retry.");
  }
  const created = await first<OrderRow>(db, 'SELECT * FROM "Order" WHERE "id" = ?', orderId);
  if (!created) throw new ApiError(500, "Order was saved but could not be loaded.");
  const details = await orderDetails(db, created);
  onCreated?.(details);
  return json(details, 201);
}

export async function getOrder(db: D1Database, lookup: string, accessToken: string | null) {
  if (!accessToken || accessToken.length !== 64) throw new ApiError(400, "Enter a valid order access code.");
  const order = await first<OrderRow>(db, 'SELECT * FROM "Order" WHERE ("id" = ? OR "number" = ?) AND "accessToken" = ?', lookup, lookup, accessToken);
  if (!order) throw new ApiError(404, "Order not found. Check your order number and access code.");
  return json(await orderDetails(db, order));
}
