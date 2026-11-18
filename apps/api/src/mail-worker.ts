// Email for the Worker runtime — Resend over HTTPS only.
//
// The Express API used nodemailer SMTP locally and Resend HTTPS on
// Render (see express-legacy/mail.ts). Workers have no SMTP and no
// nodemailer, so only the Resend HTTPS path survives here — the same
// transport as express-legacy/email-delivery.ts, rewritten for fetch
// in a Worker (no Node imports).
//
// Behaviour matches main exactly:
// - If RESEND_API_KEY or EMAIL_FROM is not configured, every send is
//   a silent no-op: orders and contact messages still save, checkout
//   never crashes on email. (Same as main when no transport exists.)
// - Send failures are logged, never thrown to the caller: callers use
//   fire-and-forget (`void send...().catch(...)`), as in main.
// - Same subjects/bodies as main, same Rs. formatting.

import type { Env } from "./env.js";
import { orderInclude } from "./orders.js";
import type { Prisma } from "@prisma/client";

type OrderDetails = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

type EmailMessage = {
  from: string;
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
};

async function sendMail(env: Env, message: EmailMessage): Promise<void> {
  const apiKey = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;
  if (!apiKey || !from) return;
  const { replyTo, ...body } = message;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [body.to],
      subject: body.subject,
      text: body.text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new Error(`Email provider rejected the request (${response.status}).`);
}

export function mailStatus(env: Env): string {
  if (env.RESEND_API_KEY && env.EMAIL_FROM)
    return "Resend HTTPS configured";
  return "disabled (set RESEND_API_KEY and verified EMAIL_FROM as Worker secrets)";
}

export async function sendTestEmail(env: Env): Promise<string> {
  const to = env.STORE_NOTIFICATION_EMAIL;
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM || !to)
    throw new Error(
      "Set RESEND_API_KEY, EMAIL_FROM and STORE_NOTIFICATION_EMAIL first.",
    );
  await sendMail(env, {
    from: env.EMAIL_FROM,
    to,
    subject: "Almost Formal email test",
    text: "Resend is working. Order and contact emails can now be delivered.",
  });
  return to;
}

export async function sendOrderPlaced(
  env: Env,
  order: OrderDetails,
): Promise<void> {
  const from = env.EMAIL_FROM;
  const adminEmail = env.STORE_NOTIFICATION_EMAIL;
  if (!env.RESEND_API_KEY || !from) return;
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
    `Track your order: ${env.APP_ORIGIN || "http://localhost:3000"}/order-tracking`,
    "",
    "Please keep your tracking code private. We will contact you if we need to confirm delivery details.",
  ].join("\n");
  const messages = [
    sendMail(env, {
      from,
      to: order.address.email,
      subject: `Almost Formal order ${order.number} received`,
      text: customerText,
    }),
  ];
  if (adminEmail) {
    messages.push(
      sendMail(env, {
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
      console.error("Resend order email failed:", result.reason);
}

export async function sendOrderStatus(
  env: Env,
  order: OrderDetails,
): Promise<void> {
  const from = env.EMAIL_FROM;
  if (
    !env.RESEND_API_KEY ||
    !from ||
    !["shipped", "delivered", "cancelled"].includes(order.status)
  )
    return;
  const tracking = order.shipment?.trackingNumber
    ? `Carrier: ${order.shipment.carrier || "Courier"}\nTracking number: ${order.shipment.trackingNumber}\n`
    : "";
  await sendMail(env, {
    from,
    to: order.address.email,
    subject: `Almost Formal order ${order.number}: ${order.status}`,
    text: `Your order ${order.number} is ${order.status}.\n${tracking}\nQuestions? Reply to this email.`,
  });
}

export async function sendContactNotification(
  env: Env,
  data: { name: string; email: string; message: string },
): Promise<void> {
  const from = env.EMAIL_FROM;
  const adminEmail = env.STORE_NOTIFICATION_EMAIL;
  if (!env.RESEND_API_KEY || !from || !adminEmail) return;
  await sendMail(env, {
    from,
    to: adminEmail,
    replyTo: data.email,
    subject: `Almost Formal contact: ${data.name}`,
    text: `From: ${data.name} <${data.email}>\n\n${data.message}`,
  });
}
