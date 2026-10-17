import { createHash, randomBytes } from "node:crypto";
import { checkoutSchema } from "../../../packages/shared/index.js";
import { db } from "./db.js";
export class HttpError extends Error {
  constructor(
    public status: number,
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
export async function createOrder(input: unknown) {
  const data = checkoutSchema.parse(input);
  const ids = data.items.map((i) => i.productId);
  if (new Set(ids).size !== ids.length)
    throw new HttpError(400, "A product may only appear once in your bag.");
  const requestHash = createHash("sha256")
    .update(JSON.stringify(data))
    .digest("hex");
  return db.$transaction(
    async (tx) => {
      const previous = await tx.order.findUnique({
        where: { idempotencyKey: data.idempotencyKey },
        include: orderInclude,
      });
      if (previous) {
        if (previous.requestHash !== requestHash)
          throw new HttpError(
            409,
            "Checkout details changed. Please start a new checkout.",
          );
        return previous;
      }
      const settings = await tx.storeSettings.findUniqueOrThrow({
        where: { id: "store" },
      });
      if (!settings.codEnabled)
        throw new HttpError(400, "Cash on delivery is currently unavailable.");
      const products = await tx.product.findMany({
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
        const reserved = await tx.product.updateMany({
          where: {
            id: product.id,
            stock: { gte: item.quantity },
            archived: false,
          },
          data: { stock: { decrement: item.quantity } },
        });
        if (reserved.count !== 1)
          throw new HttpError(
            409,
            `${product.title} has already found a new home. Remove it from your bag to continue.`,
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
      const total = subtotal + settings.shipping;
      const order = await tx.order.create({
        data: {
          number: `AF-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString("hex").toUpperCase()}`,
          accessToken: randomBytes(32).toString("hex"),
          idempotencyKey: data.idempotencyKey,
          requestHash,
          subtotal,
          shipping: settings.shipping,
          total,
          note: data.note || "",
          address: { create: data.address },
          items: { create: snapshots },
          payment: { create: { method: "cod", amount: total } },
          shipment: { create: {} },
        },
        include: orderInclude,
      });
      await tx.inventoryMovement.createMany({
        data: data.items.map((i) => ({
          productId: i.productId,
          delta: -i.quantity,
          reason: "Order placed",
          orderId: order.id,
        })),
      });
      return order;
    },
    { maxWait: 10000, timeout: 15000 },
  );
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
  id: string,
  status: string,
  adminId: string,
  trackingNumber?: string,
  carrier?: string,
) {
  return db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
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
    if (status === "cancelled")
      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
        await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            delta: item.quantity,
            reason: "Order cancelled",
            orderId: id,
          },
        });
      }
    await tx.auditLog.create({
      data: { adminId, action: `order.${status}`, target: id },
    });
    if (status === "delivered")
      await tx.payment.update({
        where: { orderId: id },
        data: { status: "collected" },
      });
    if (status === "cancelled")
      await tx.payment.update({
        where: { orderId: id },
        data: { status: "cancelled" },
      });
    return tx.order.update({
      where: { id },
      data: {
        status,
        ...(trackingNumber
          ? { shipment: { update: { trackingNumber, carrier } } }
          : {}),
      },
      include: orderInclude,
    });
  });
}
