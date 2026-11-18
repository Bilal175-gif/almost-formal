import type { Env } from "./db";

type Message = {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
};

type Address = {
  name: string;
  email: string;
  phone: string;
};

type OrderForEmail = {
  number: string;
  status: string;
  accessToken: string;
  total: number;
  address: Address | null;
  items: Array<{ title: string; quantity: number; price: number }>;
  shipment: { carrier: string | null; trackingNumber: string | null } | null;
};

async function send(env: Env, message: Message) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new Error("Resend email is not configured on the API Worker.");
  }
  const { replyTo, ...content } = message;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [content.to],
      subject: content.subject,
      text: content.text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Resend rejected an email request (${response.status}).`);
  }
}

function itemLines(order: OrderForEmail) {
  return order.items
    .map(
      (item) =>
        `${item.quantity} × ${item.title} — Rs. ${((item.price * item.quantity) / 100).toLocaleString("en-PK")}`,
    )
    .join("\n");
}

export async function sendOrderCreated(env: Env, order: OrderForEmail) {
  if (!order.address) throw new Error("Order address is missing; notification email cannot be sent.");
  const items = itemLines(order);
  const messages = [
    send(env, {
      to: order.address.email,
      subject: `Almost Formal order ${order.number} received`,
      text: [
        `Thanks for your order, ${order.address.name}!`,
        `Order: ${order.number}`,
        "",
        items,
        "",
        `Total (cash on delivery): Rs. ${(order.total / 100).toLocaleString("en-PK")}`,
        `Private tracking code: ${order.accessToken}`,
        `Track your order: ${env.APP_ORIGIN || "https://almostformal.shop"}/order-tracking`,
        "",
        "Please keep your tracking code private.",
      ].join("\n"),
    }),
  ];
  if (env.STORE_NOTIFICATION_EMAIL) {
    messages.push(
      send(env, {
        to: env.STORE_NOTIFICATION_EMAIL,
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
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Order email failed:", result.reason);
    }
  }
}

export async function sendContactNotification(
  env: Env,
  contact: { name: string; email: string; message: string },
) {
  if (!env.STORE_NOTIFICATION_EMAIL) {
    throw new Error("STORE_NOTIFICATION_EMAIL is not configured on the API Worker.");
  }
  await send(env, {
    to: env.STORE_NOTIFICATION_EMAIL,
    subject: `Almost Formal contact: ${contact.name}`,
    replyTo: contact.email,
    text: `From: ${contact.name} <${contact.email}>\n\n${contact.message}`,
  });
}

export async function sendOrderStatus(env: Env, order: OrderForEmail) {
  if (!["shipped", "delivered", "cancelled"].includes(order.status)) return;
  if (!order.address) throw new Error("Order address is missing; status email cannot be sent.");
  const tracking = order.shipment?.trackingNumber
    ? `Carrier: ${order.shipment.carrier || "Courier"}\nTracking number: ${order.shipment.trackingNumber}\n`
    : "";
  await send(env, {
    to: order.address.email,
    subject: `Almost Formal order ${order.number}: ${order.status}`,
    text: `Your order ${order.number} is ${order.status}.\n${tracking}\nQuestions? Reply to this email.`,
  });
}
