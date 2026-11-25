import { z } from "zod";
import { all, ApiError, first, id, json, parseJson, run, sha256, type Env } from "./db";
import { categories, productDetail, productFilters, productList, settings } from "./catalog";
import { login, logout, me, requireAdmin } from "./auth";
import { createOrder, getOrder } from "./orders";
import { uploadImage } from "./media";
import { sendContactNotification, sendOrderCreated, sendOrderStatus } from "./email";
import { adminOrders, adminProducts, createCategory, createProduct, customers, dashboard, inventory, messages, removeProduct, updateOrderStatus, updateProduct, updateSettings, type ExecutionContextLike } from "./admin";
import { post, posts, savePost } from "./editorial";

async function limit(env: Env, request: Request, key: string, max: number, windowMs: number) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const bucket = Math.floor(Date.now() / windowMs);
  const rateKey = `${key}:${await sha256(ip)}:${bucket}`;
  await run(env.DB, 'DELETE FROM "RateLimit" WHERE "expiresAt" <= ?', Date.now());
  await run(env.DB, 'INSERT INTO "RateLimit" ("key", "count", "expiresAt") VALUES (?, 1, ?) ON CONFLICT("key") DO UPDATE SET "count" = "count" + 1', rateKey, (bucket + 1) * windowMs);
  const row = await first<{ count: number }>(env.DB, 'SELECT "count" FROM "RateLimit" WHERE "key" = ?', rateKey);
  if (row && row.count > max) throw new ApiError(429, "Too many requests. Please try again later.");
}

async function route(request: Request, env: Env, ctx: ExecutionContextLike) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const db = env.DB;
  if (path === "/api/health" && method === "GET") return json({ ok: true, service: "almost-formal-api", runtime: "cloudflare-worker" });
  if (path.startsWith("/api/")) await limit(env, request, "api", 180, 60_000);
  if (path === "/api/products" && method === "GET") return productList(db, url);
  if (path === "/api/product-filters" && method === "GET") return productFilters(db);
  if (path === "/api/categories" && method === "GET") return categories(db);
  if (path === "/api/settings" && method === "GET") return settings(db);
  if (path === "/api/blog" && method === "GET") return posts(db);
  const publicPost = /^\/api\/blog\/([a-z0-9-]+)$/.exec(path);
  if (publicPost && method === "GET") return post(db, publicPost[1]);
  const productMatch = /^\/api\/products\/([^/]+)$/.exec(path);
  if (productMatch && method === "GET") return productDetail(db, decodeURIComponent(productMatch[1]));
  if (path === "/api/orders" && method === "POST") {
    await limit(env, request, "orders", 15, 60_000);
    return createOrder(db, await parseJson(request), (order) => {
      ctx.waitUntil(
        sendOrderCreated(env, order).catch((error) =>
          console.error("Order email failed:", error),
        ),
      );
    });
  }
  const orderMatch = /^\/api\/orders\/([^/]+)$/.exec(path);
  if (orderMatch && method === "GET") return getOrder(db, decodeURIComponent(orderMatch[1]), request.headers.get("x-order-token"));
  if (path === "/api/newsletter" && method === "POST") {
    await limit(env, request, "newsletter", 5, 60_000);
    const { email } = z.object({ email: z.email().max(200) }).parse(await parseJson(request));
    await run(db, 'INSERT OR IGNORE INTO "Subscriber" ("id", "email", "createdAt") VALUES (?, ?, ?)', id(), email, new Date().toISOString());
    return json({ message: "You’re on the list. Good finds are coming." });
  }
  if (path === "/api/contact" && method === "POST") {
    await limit(env, request, "contact", 5, 60_000);
    const data = z.object({ name: z.string().trim().min(2).max(100), email: z.email().max(200), message: z.string().trim().min(10).max(3000) }).parse(await parseJson(request));
    await run(db, 'INSERT INTO "ContactMessage" ("id", "name", "email", "message", "createdAt") VALUES (?, ?, ?, ?, ?)', id(), data.name, data.email, data.message, new Date().toISOString());
    ctx.waitUntil(
      sendContactNotification(env, data).catch((error) =>
        console.error("Contact notification email failed:", error),
      ),
    );
    return json({ message: "Your message has been saved for the Almost Formal team." }, 201);
  }
  if (path === "/api/auth/login" && method === "POST") {
    await limit(env, request, "login", 10, 15 * 60_000);
    return login(db, request);
  }
  if (path === "/api/auth/me" && method === "GET") return me(db, request);
  if (path === "/api/auth/logout" && method === "POST") return logout(db, request);
  if (path.startsWith("/api/admin/")) {
    const admin = await requireAdmin(db, request, method !== "GET" && method !== "HEAD");
    if (path === "/api/admin/blog" && method === "GET") return posts(db, true);
    if (path === "/api/admin/blog" && method === "POST") return savePost(db, await parseJson(request));
    const adminPost = /^\/api\/admin\/blog\/([^/]+)$/.exec(path);
    if (adminPost && method === "PATCH") return savePost(db, await parseJson(request), adminPost[1]);
    if (path === "/api/admin/dashboard" && method === "GET") return dashboard(db);
    if (path === "/api/admin/products" && method === "GET") return adminProducts(db);
    if (path === "/api/admin/products" && method === "POST") return createProduct(db, env, admin.adminId, await parseJson(request));
    const adminProduct = /^\/api\/admin\/products\/([^/]+)$/.exec(path);
    if (adminProduct && method === "PATCH") return updateProduct(db, env, admin.adminId, adminProduct[1], await parseJson(request), ctx);
    if (adminProduct && method === "DELETE") return removeProduct(db, env, admin.adminId, adminProduct[1], ctx);
    if (path === "/api/admin/categories" && method === "POST") return createCategory(db, await parseJson(request));
    if (path === "/api/admin/orders" && method === "GET") return adminOrders(db);
    const statusMatch = /^\/api\/admin\/orders\/([^/]+)\/status$/.exec(path);
    if (statusMatch && method === "PATCH") return updateOrderStatus(db, admin.adminId, statusMatch[1], await parseJson(request), (order) => {
      if (["shipped", "delivered", "cancelled"].includes(order.status)) {
        ctx.waitUntil(
          sendOrderStatus(env, order).catch((error) =>
            console.error("Order status email failed:", error),
          ),
        );
      }
    });
    if (path === "/api/admin/inventory" && method === "GET") return inventory(db);
    if (path === "/api/admin/customers" && method === "GET") return customers(db);
    if (path === "/api/admin/messages" && method === "GET") return messages(db);
    if (path === "/api/admin/settings" && method === "PATCH") return updateSettings(db, await parseJson(request));
    if (path === "/api/admin/uploads" && method === "POST") {
      await limit(env, request, "uploads", 30, 60_000);
      return json({ url: await uploadImage(env, request) }, 201);
    }
  }
  return json({ error: "Endpoint not found." }, 404);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContextLike) {
    const origin = request.headers.get("Origin");
    const allowedOrigins = new Set((env.ALLOWED_ORIGINS || "").split(",").map((entry) => entry.trim()).filter(Boolean));
    if (env.APP_ORIGIN) allowedOrigins.add(env.APP_ORIGIN);
    const allowed = !!origin && allowedOrigins.has(origin);
    const cors = new Headers({
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Cross-Origin-Resource-Policy": "same-site",
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    });
    if (allowed && origin) {
      cors.set("Access-Control-Allow-Origin", origin);
      cors.set("Access-Control-Allow-Credentials", "true");
      cors.set("Access-Control-Allow-Methods", "GET, HEAD, POST, PATCH, DELETE, OPTIONS");
      cors.set("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token, X-Order-Token");
      cors.set("Vary", "Origin");
    }
    if (request.method === "OPTIONS") return new Response(null, { status: allowed ? 204 : 403, headers: cors });
    if (request.method !== "GET" && request.method !== "HEAD" && origin && !allowed)
      return json({ error: "Request origin is not allowed." }, 403, cors);
    try {
      const response = await route(request, env, ctx);
      for (const [name, value] of cors) response.headers.set(name, value);
      return response;
    } catch (error) {
      if (error instanceof z.ZodError) return json({ error: error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") }, 400, cors);
      if (error instanceof ApiError) return json({ error: error.message }, error.status, cors);
      console.error("API Worker request failed", error);
      return json({ error: "Something went wrong. Please try again." }, 500, cors);
    }
  },
};
