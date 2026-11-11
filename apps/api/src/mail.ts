import nodemailer from "nodemailer";
import type { Prisma } from "@prisma/client";
import { orderInclude } from "./orders.js";

type OrderDetails = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

const from = process.env.SMTP_FROM || process.env.SMTP_USER;
const adminEmail = process.env.STORE_NOTIFICATION_EMAIL;

const transport =
  process.env.NODE_ENV !== "test" &&
  process.env.SMTP_HOST &&
  process.env.SMTP_USER &&
  process.env.SMTP_PASSWORD &&
  from
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT || 587) === 465,
        requireTLS: Number(process.env.SMTP_PORT || 587) !== 465,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        },
        connectionTimeout: 10000,
      })
    : null;

export function mailStatus() {
  return transport
    ? "configured (run npm run smtp:test)"
    : "disabled (set SMTP_PASSWORD in .env)";
}

export async function sendSmtpTest() {
  if (!transport || !from || !process.env.SMTP_USER)
    throw new Error(
      "SMTP is incomplete. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD and SMTP_FROM in .env.",
    );
  await transport.verify();
  const to = adminEmail || process.env.SMTP_USER;
  await transport.sendMail({
    from,
    to,
    subject: "Almost Formal SMTP test",
    text: "SMTP is working. Order and contact emails can now be delivered.",
  });
  return to;
}

export async function sendOrderPlaced(order: OrderDetails) {
  if (!transport || !from) return;
  const items = order.items
    .map(
      (item) =>
        `${item.quantity} × ${item.title} — Rs. ${((item.price * item.quantity) / 100).toLocaleString("en-PK")}`,
    )
    .join("\n");
  const customerText = [
    `Thanks for your order, ${order.address.name}!`,
    `Order: ${order.number}`,
    "",
    items,
    "",
    `Total (cash on delivery): Rs. ${(order.total / 100).toLocaleString("en-PK")}`,
    `Private tracking code: ${order.accessToken}`,
    `Track your order: ${process.env.APP_ORIGIN || "http://localhost:3000"}/order-tracking`,
    "",
    "Please keep your tracking code private. We will contact you if we need to confirm delivery details.",
  ].join("\n");
  const messages = [
    transport.sendMail({
      from,
      to: order.address.email,
      subject: `Almost Formal order ${order.number} received`,
      text: customerText,
    }),
  ];
  if (adminEmail) {
    messages.push(
      transport.sendMail({
        from,
        to: adminEmail,
        subject: `New order ${order.number}`,
        text: [
          `Order: ${order.number}`,
          `Customer: ${order.address.name}`,
          `Email: ${order.address.email}`,
          `Phone: ${order.address.phone}`,
          `Total: Rs. ${(order.total / 100).toLocaleString("en-PK")}`,
          "",
          items,
        ].join("\n"),
      }),
    );
  }
  const results = await Promise.allSettled(messages);
  for (const result of results)
    if (result.status === "rejected")
      console.error("SMTP order email failed:", result.reason);
}

export async function sendOrderStatus(order: OrderDetails) {
  if (
    !transport ||
    !from ||
    !["shipped", "delivered", "cancelled"].includes(order.status)
  )
    return;
  const tracking = order.shipment?.trackingNumber
    ? `Carrier: ${order.shipment.carrier || "Courier"}\nTracking number: ${order.shipment.trackingNumber}\n`
    : "";
  await transport.sendMail({
    from,
    to: order.address.email,
    subject: `Almost Formal order ${order.number}: ${order.status}`,
    text: `Your order ${order.number} is ${order.status}.\n${tracking}\nQuestions? Reply to this email.`,
  });
}

export async function sendContactNotification(data: {
  name: string;
  email: string;
  message: string;
}) {
  if (!transport || !from || !adminEmail) return;
  await transport.sendMail({
    from,
    to: adminEmail,
    replyTo: data.email,
    subject: `Almost Formal contact: ${data.name}`,
    text: `From: ${data.name} <${data.email}>\n\n${data.message}`,
  });
}
