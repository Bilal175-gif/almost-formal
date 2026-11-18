import { checkoutSchema } from "../../../packages/shared/index.js";
import type { PrismaClient } from "@prisma/client";
import type { D1Database } from "@cloudflare/workers-types";
import { newId, nowIso, randomTokenHex, sha256Hex } from "./auth.js";

// Orders on D1.
//
// D1 has no interactive transactions, and Prisma's D1 adapter silently
// degrades $transaction to individual queries (no rollback), so the
// original code's db.$transaction calls cannot be carried over. Every
// multi-row write below is restructured into D1 batch() calls instead:
//
// - createOrder: batch 1 conditionally decrements stock (UPDATE ...
//   WHERE stock >= qty, one statement per item). If any decrement
//   affects 0 rows the items already decremented in that batch are
//   restored with compensating increments and checkout fails with 409
//   — this is what makes the "failed mixed-stock order rolls back"
//   case hold. Batch 2 then inserts the order, address, items,
//   payment, shipment and inventory movements. If batch 2 fails (e.g.
//   a racing identical checkout won the idempotency key), stock is
//   restored and the previous order is returned for a replay.
// - updateOrderStatus: one batch. The first statement claims the
//   status change (UPDATE ... WHERE status = <old>); every later
//   statement is guarded by EXISTS (order is in the new status), so a
//   lost claim applies no side effects. The claim's change count is
//   checked and a lost claim becomes a 409.
//
// Reads still go through Prisma (same queries as the Express version).

export class HttpError extends Error {
  constructor(
    // 503: image uploads, when Cloudinary secrets are not configured.
    public status: 400 | 401 | 404 | 409 | 413 | 503,
    message: string,
  ) {
    super(message);
  }
}

export const orderInclude = {
  items: true,
  address: true,
  payment: true,
  shipment: true,
} as const;

export interface OrderContext {
  db: PrismaClient;
  d1: D1Database;
}

async function restoreStock(
  d1: D1Database,
  items: { productId: string; quantity: number }[],
): Promise<void> {
  if (!items.length) return;
  const ts = nowIso();
  await d1.batch(
    items.map((item) =>
      d1
        .prepare(
          `UPDATE "Product" SET "stock" = "stock" + ?, "updatedAt" = ? WHERE "id" = ?`,
        )
        .bind(item.quantity, ts, item.productId),
    ),
  );
}

export async function createOrder(ctx: OrderContext, input: unknown) {
  const { db, d1 } = ctx;
  const data = checkoutSchema.parse(input);
  const ids = data.items.map((i) => i.productId);
  if (new Set(ids).size !== ids.length)
    throw new HttpError(400, "A product may only appear once in your bag.");
  const requestHash = await sha256Hex(JSON.stringify(data));

  // Idempotency replay (pre-read; safe: replays never write).
  const previous = await db.order.findUnique({
    where: { idempotencyKey: data.idempotencyKey },
    include: orderInclude,
  });
  if (previous) {
    if (previous.requestHash !== requestHash)
      throw new HttpError(
        409,
        "Checkout details changed. Please start a new checkout.",
      );
    return { order: previous, created: false };
  }

  const settings = await db.storeSettings.findUniqueOrThrow({
    where: { id: "store" },
  });
  if (!settings.codEnabled)
    throw new HttpError(400, "Cash on delivery is currently unavailable.");

  const products = await db.product.findMany({
    where: { id: { in: ids }, archived: false },
    include: { images: { orderBy: { position: "asc" } } },
  });

  let subtotal = 0;
  const snapshots = [];
  for (const item of data.items) {
    const product = products.find((p) => p.id === item.productId);
    if (!product)
      throw new HttpError(
        409,
        "A product in your bag is no longer available.",
      );
    subtotal += product.price * item.quantity;
    snapshots.push({
      productId: product.id,
      title: product.title,
      sku: product.sku,
      price: product.price,
      quantity: item.quantity,
      image: product.images[0]?.url || "",
    });
  }

  // Batch 1: conditional stock decrements.
  const ts = nowIso();
  const decrements = await d1.batch(
    data.items.map((item) =>
      d1
        .prepare(
          `UPDATE "Product" SET "stock" = "stock" - ?, "updatedAt" = ? WHERE "id" = ? AND "stock" >= ? AND "archived" = 0`,
        )
        .bind(item.quantity, ts, item.productId, item.quantity),
    ),
  );
  const decremented = data.items.filter(
    (_, i) => (decrements[i]?.meta?.changes ?? 0) === 1,
  );
  const failed = data.items.find(
    (_, i) => (decrements[i]?.meta?.changes ?? 0) !== 1,
  );
  if (failed) {
    await restoreStock(d1, decremented);
    const product = products.find((p) => p.id === failed.productId);
    throw new HttpError(
      409,
      `${product?.title ?? "A product"} has already found a new home. Remove it from your bag to continue.`,
    );
  }

  // Batch 2: order + address + items + payment + shipment + movements.
  const orderId = newId();
  const addressId = newId();
  const total = subtotal + settings.shipping;
  const number = `AF-${Date.now().toString(36).toUpperCase()}-${randomTokenHex(2).toUpperCase()}`;
  const accessToken = randomTokenHex(32);
  const statements = [
    d1
      .prepare(
        `INSERT INTO "Address" ("id","name","email","phone","line1","city","state","postalCode") VALUES (?,?,?,?,?,?,?,?)`,
      )
      .bind(
        addressId,
        data.address.name,
        data.address.email,
        data.address.phone,
        data.address.line1,
        data.address.city,
        data.address.state,
        data.address.postalCode,
      ),
    d1
      .prepare(
        `INSERT INTO "Order" ("id","number","idempotencyKey","requestHash","accessToken","addressId","status","subtotal","shipping","total","note","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        orderId,
        number,
        data.idempotencyKey,
        requestHash,
        accessToken,
        addressId,
        "pending",
        subtotal,
        settings.shipping,
        total,
        data.note || "",
        ts,
        ts,
      ),
    ...snapshots.map((s) =>
      d1
        .prepare(
          `INSERT INTO "OrderItem" ("id","orderId","productId","title","sku","price","image","quantity") VALUES (?,?,?,?,?,?,?,?)`,
        )
        .bind(
          newId(),
          orderId,
          s.productId,
          s.title,
          s.sku,
          s.price,
          s.image,
          s.quantity,
        ),
    ),
    d1
      .prepare(
        `INSERT INTO "Payment" ("id","orderId","method","status","amount") VALUES (?,?,?,?,?)`,
      )
      .bind(newId(), orderId, "cod", "pending", total),
    d1
      .prepare(`INSERT INTO "Shipment" ("id","orderId") VALUES (?,?)`)
      .bind(newId(), orderId),
    ...data.items.map((item) =>
      d1
        .prepare(
          `INSERT INTO "InventoryMovement" ("id","productId","delta","reason","orderId","createdAt") VALUES (?,?,?,?,?,?)`,
        )
        .bind(newId(), item.productId, -item.quantity, "Order placed", orderId, ts),
    ),
  ];
  try {
    await d1.batch(statements);
  } catch {
    // A racing identical checkout may have won the idempotency key.
    // Restore the reserved stock, then replay if the other order exists.
    await restoreStock(d1, data.items);
    const raced = await db.order.findUnique({
      where: { idempotencyKey: data.idempotencyKey },
      include: orderInclude,
    });
    if (raced && raced.requestHash === requestHash)
      return { order: raced, created: false };
    throw new HttpError(
      409,
      "Another order is being processed. Please retry your checkout.",
    );
  }

  const created = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: orderInclude,
  });
  // `created` tells the caller whether this checkout actually placed a
  // new order: idempotency replays must not re-send the order email.
  return { order: created, created: true };
}

const transitions: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["packed", "cancelled"],
  packed: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

export async function updateOrderStatus(
  ctx: OrderContext,
  id: string,
  status: string,
  adminId: string,
  trackingNumber?: string,
  carrier?: string,
) {
  const { db, d1 } = ctx;
  const order = await db.order.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!order) throw new HttpError(404, "Order not found.");
  if (order.status === status) return order;
  if (!transitions[order.status]?.includes(status))
    throw new HttpError(409, `Cannot change ${order.status} to ${status}.`);
  if (status === "shipped" && !trackingNumber)
    throw new HttpError(
      400,
      "A tracking number is required before shipping.",
    );

  const ts = nowIso();
  const claimed = `EXISTS (SELECT 1 FROM "Order" WHERE "id" = ? AND "status" = ?)`;
  const statements = [
    // Claim the transition; only one caller can flip the status.
    d1
      .prepare(
        `UPDATE "Order" SET "status" = ?, "updatedAt" = ? WHERE "id" = ? AND "status" = ?`,
      )
      .bind(status, ts, id, order.status),
    ...(status === "cancelled"
      ? order.items.flatMap((item) => [
          d1
            .prepare(
              `UPDATE "Product" SET "stock" = "stock" + ?, "updatedAt" = ? WHERE "id" = ? AND ${claimed}`,
            )
            .bind(item.quantity, ts, item.productId, id, status),
          d1
            .prepare(
              `INSERT INTO "InventoryMovement" ("id","productId","delta","reason","orderId","createdAt") SELECT ?,?,?,?,?,? WHERE ${claimed}`,
            )
            .bind(
              newId(),
              item.productId,
              item.quantity,
              "Order cancelled",
              id,
              ts,
              id,
              status,
            ),
        ])
      : []),
    d1
      .prepare(
        `INSERT INTO "AuditLog" ("id","adminId","action","target","createdAt") SELECT ?,?,?,?,? WHERE ${claimed}`,
      )
      .bind(newId(), adminId, `order.${status}`, id, ts, id, status),
    ...(status === "delivered"
      ? [
          d1
            .prepare(
              `UPDATE "Payment" SET "status" = 'collected' WHERE "orderId" = ? AND ${claimed}`,
            )
            .bind(id, id, status),
        ]
      : []),
    ...(status === "cancelled"
      ? [
          d1
            .prepare(
              `UPDATE "Payment" SET "status" = 'cancelled' WHERE "orderId" = ? AND ${claimed}`,
            )
            .bind(id, id, status),
        ]
      : []),
    ...(trackingNumber
      ? carrier !== undefined
        ? [
            d1
              .prepare(
                `UPDATE "Shipment" SET "trackingNumber" = ?, "carrier" = ? WHERE "orderId" = ? AND ${claimed}`,
              )
              .bind(trackingNumber, carrier, id, id, status),
          ]
        : [
            // Only a tracking number was supplied: keep the existing
            // carrier (main's Prisma update ignores an undefined
            // carrier; writing NULL here would erase it).
            d1
              .prepare(
                `UPDATE "Shipment" SET "trackingNumber" = ? WHERE "orderId" = ? AND ${claimed}`,
              )
              .bind(trackingNumber, id, id, status),
          ]
      : []),
  ];
  const results = await d1.batch(statements);
  if ((results[0]?.meta?.changes ?? 0) !== 1)
    throw new HttpError(409, "Order status changed. Refresh and retry.");

  return db.order.findUniqueOrThrow({
    where: { id },
    include: orderInclude,
  });
}
