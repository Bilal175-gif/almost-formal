import { Hono, type Context, type Next } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import * as PrismaModule from "@prisma/client";
import type { Admin, Prisma, PrismaClient, User } from "@prisma/client";

// Namespace import: the generated client is CJS with dynamic exports,
// so a named value import can be elided by per-file transforms.
// `Prisma` (type namespace) and `PrismaRuntime` (error classes) are kept
// separate because the namespace is needed both as a type and a value.
const PrismaRuntime = PrismaModule.Prisma;
import { createDb } from "./db-d1.js";
import type { Env } from "./env.js";
import { randomTokenHex, sha256Hex, verifyPassword, newId, nowIso } from "./auth.js";
import {
  createOrder,
  HttpError,
  orderInclude,
  updateOrderStatus,
} from "./orders.js";
import {
  cloudinaryConfigured,
  cloudinaryPartiallyConfigured,
  destroyCloudinaryImage,
  isCloudinaryProductUrl,
  uploadProductImage,
} from "./cloudinary-worker.js";
import {
  sendContactNotification,
  sendOrderPlaced,
  sendOrderStatus,
} from "./mail-worker.js";

// Hono Worker port of the Express API (original kept in
// src/express-legacy/ until this replacement is verified).
//
// Same routes, same payloads, same status codes as the Express version.
// Differences, all forced by the Workers runtime:
// - Prisma client is built per request from the D1 binding (db-d1.ts);
//   there is no long-lived DATABASE_URL connection.
// - Auth uses PBKDF2 (auth.ts); argon2 cannot run in Workers.
// - Uploads go to Cloudinary via signed fetch (cloudinary-worker.ts);
//   no Sharp resize on upload (Cloudinary stores as WebP and the
//   storefront serves f_auto,q_auto variants). No R2 bucket, no local
//   disk. Without Cloudinary secrets the upload endpoint answers 503.
//   Legacy /uploads/* files from the old local-disk host cannot be
//   served by a Worker and answer 410 — see the route below and
//   CUTOVER.md (those images must be re-uploaded to Cloudinary).
// - Email is Resend over HTTPS only (mail-worker.ts); there is no
//   SMTP on Workers. With no RESEND_API_KEY orders/contact still save
//   and email is skipped, exactly as on main without a transport.
// - Public catalogue GETs use a small in-memory cache (same TTL env
//   as main's public-cache.ts); writes invalidate it.
// - The web app normally calls the API same-origin through its /api
//   rewrites, so the af_session cookie stays SameSite=Strict (Secure
//   when APP_ORIGIN is https). CORS answers only for APP_ORIGIN /
//   ALLOWED_ORIGINS — see sessionCookieOptions and the cors
//   middleware below.
// - Rate limits are an in-memory per-isolate sliding window. They
//   enforce the same limits as before for a single isolate; for
//   production, add Cloudflare WAF rate-limiting rules as well.
// - Multi-row writes use D1 batch() (see orders.ts); db.$transaction
//   is never used — D1 has no interactive transactions.

type Variables = {
  db: PrismaClient;
  admin: Admin & { user: User };
};

type ApiContext = Context<{ Bindings: Env; Variables: Variables }>;

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// One Prisma client per request, from the D1 binding.
app.use("*", async (c, next) => {
  c.set("db", createDb(c.env.DB));
  await next();
});

app.use("*", async (c, next) => {
  const start = Date.now();
  await next();
  if (c.env.NODE_ENV !== "test")
    console.log(
      JSON.stringify({
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        ms: Date.now() - start,
      }),
    );
});

// Exact origins allowed to call the API directly cross-origin:
// APP_ORIGIN plus the comma-separated ALLOWED_ORIGINS list (same
// rule as main's Express middleware, which also allowed local dev
// origins outside production).
function allowedOrigins(c: ApiContext): Set<string> {
  return new Set([
    c.env.APP_ORIGIN || "http://localhost:3000",
    ...(c.env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  ]);
}

function isAllowedOrigin(c: ApiContext, origin: string | undefined): boolean {
  if (!origin) return false;
  if (allowedOrigins(c).has(origin)) return true;
  return (
    c.env.NODE_ENV !== "production" &&
    /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)
  );
}

// CORS for direct cross-origin API calls.
// The primary path is same-origin through the web app's /api rewrites,
// so browsers normally never call the Worker directly. This only
// answers preflights and echoes CORS headers when the request Origin
// is allowed, so no other site can read API responses.
app.use("/api/*", async (c, next) => {
  const origin = c.req.header("origin");
  const allowed = isAllowedOrigin(c, origin);
  if (c.req.method === "OPTIONS") {
    if (!allowed) return c.json({ error: "Not found." }, 403);
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin!,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods":
          "GET, HEAD, POST, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, X-CSRF-Token, X-Order-Token",
        "Access-Control-Max-Age": "600",
        Vary: "Origin",
      },
    });
  }
  await next();
  if (allowed && c.res) {
    c.res.headers.set("Access-Control-Allow-Origin", origin!);
    c.res.headers.set("Access-Control-Allow-Credentials", "true");
    c.res.headers.set(
      "Access-Control-Allow-Methods",
      "GET, HEAD, POST, PATCH, DELETE, OPTIONS",
    );
    c.res.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, X-CSRF-Token, X-Order-Token",
    );
    c.res.headers.append("Vary", "Origin");
  }
});

// Origin check for non-GET /api requests (same rule as Express).
app.use("/api/*", async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const origin = c.req.header("origin");
    if (origin && !isAllowedOrigin(c, origin))
      return c.json({ error: "Request origin is not allowed." }, 403);
    // A cross-site fetch from the web app itself (direct Worker call,
    // not through the /api rewrites) is allowed; anything else is not.
    if (
      c.req.header("sec-fetch-site") === "cross-site" &&
      !isAllowedOrigin(c, origin)
    )
      return c.json({ error: "Cross-site requests are not allowed." }, 403);
  }
  await next();
  // Same as main: API responses are never cached by browsers/CDNs.
  if (c.res) c.res.headers.set("Cache-Control", "private, no-store");
});

// Public catalogue cache — same rules as main's public-cache.ts:
// only GETs of the public catalogue endpoints, bounded memory
// (100 entries / 4 MB), TTL from PUBLIC_CACHE_TTL_SECONDS (0 = off,
// main's Render value was 30). Any non-GET /api write clears it.
// Checkout always reads current stock/prices from the database.
const publicCacheEntries = new Map<string, { body: string; until: number }>();
let publicCacheBytes = 0;
let publicCacheGeneration = 0;
app.use("/api/*", async (c, next) => {
  const ttlSeconds = Math.min(
    60,
    Math.max(0, Number(c.env.PUBLIC_CACHE_TTL_SECONDS) || 0),
  );
  if (!ttlSeconds) {
    await next();
    return;
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    publicCacheEntries.clear();
    publicCacheBytes = 0;
    publicCacheGeneration++;
    await next();
    publicCacheEntries.clear();
    publicCacheBytes = 0;
    publicCacheGeneration++;
    return;
  }
  if (
    c.req.method !== "GET" ||
    !/^\/api\/(products(?:\/[^/]+)?|product-filters|categories|settings)$/.test(
      c.req.path,
    )
  ) {
    await next();
    return;
  }
  const key = c.req.url;
  const cached = publicCacheEntries.get(key);
  if (cached && cached.until > Date.now()) {
    return new Response(cached.body, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
      },
    });
  }
  if (cached) {
    publicCacheBytes -= cached.body.length;
    publicCacheEntries.delete(key);
  }
  const generation = publicCacheGeneration;
  await next();
  if (c.res && c.res.status === 200 && generation === publicCacheGeneration) {
    const body = await c.res.clone().text();
    if (body.length <= 256 * 1024) {
      if (
        publicCacheEntries.size >= 100 ||
        publicCacheBytes + body.length > 4 * 1024 * 1024
      ) {
        publicCacheEntries.clear();
        publicCacheBytes = 0;
      }
      const previous = publicCacheEntries.get(key);
      if (previous) publicCacheBytes -= previous.body.length;
      publicCacheEntries.set(key, {
        body,
        until: Date.now() + ttlSeconds * 1000,
      });
      publicCacheBytes += body.length;
    }
  }
});

// Session cookie options. The web app calls the API same-origin
// through its /api rewrites, so the cookie is always SameSite=Strict
// (as in main's Express version). Secure whenever APP_ORIGIN is an
// https origin, so it works on the live site and stays non-secure
// for plain-http local development.
function sessionCookieOptions(c: ApiContext) {
  const secure = (c.env.APP_ORIGIN || "").startsWith("https://");
  return {
    httpOnly: true,
    secure,
    sameSite: "Strict" as const,
    maxAge: 8 * 60 * 60,
    path: "/api",
  };
}

type Bucket = { count: number; resetAt: number };
// Each limiter gets its own buckets — sharing one map across limiters
// double-counts requests that pass through two of them (e.g. login
// passes the global limiter and its own stricter one).
const allBuckets: Set<Map<string, Bucket>> = new Set();

// Test helper: the API tests reset limits between scenarios.
export function resetRateLimits(): void {
  for (const buckets of allBuckets) buckets.clear();
}

function rateLimit(limit: number, windowMs: number) {
  const buckets = new Map<string, Bucket>();
  allBuckets.add(buckets);
  return async (c: ApiContext, next: Next) => {
    // Key by client IP only (same as main's global limiter: 180/min
    // per IP across /api, not per endpoint). Trust only
    // cf-connecting-ip, which Cloudflare sets — X-Forwarded-For is
    // client-controlled and must not be trusted.
    const ip = c.req.header("cf-connecting-ip") || "unknown";
    const key = ip;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > limit)
      return c.json(
        { error: "Too many requests. Please try again shortly." },
        429,
        {
          "RateLimit-Limit": String(limit),
          "RateLimit-Remaining": "0",
          "RateLimit-Reset": String(Math.ceil((bucket.resetAt - now) / 1000)),
          "Retry-After": String(Math.ceil((bucket.resetAt - now) / 1000)),
        },
      );
    await next();
  };
}

app.use("/api/*", rateLimit(180, 60_000));

// Security headers (the Helmet subset that applies to a JSON API).
app.use("/api/*", async (c, next) => {
  await next();
  if (c.res) {
    c.res.headers.set("X-Content-Type-Options", "nosniff");
    c.res.headers.set("X-Frame-Options", "DENY");
    c.res.headers.set("Referrer-Policy", "no-referrer");
  }
});

async function readJson<T>(c: ApiContext): Promise<T> {
  // Enforce the 100 KB limit on the parsed body, not just the
  // Content-Length header (a chunked body may carry no header).
  let text: string;
  try {
    text = await c.req.text();
  } catch {
    throw new HttpError(400, "Invalid request body.");
  }
  if (text.length > 100 * 1024)
    throw new HttpError(413, "Request body is too large.");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, "Invalid request body.");
  }
}

const protect = async (c: ApiContext, next: Next) => {
  const token = getCookie(c, "af_session");
  if (!token)
    return c.json({ error: "Please sign in as an administrator." }, 401);
  const session = await c.var.db.session.findUnique({
    where: { id: await sha256Hex(token) },
    include: { admin: { include: { user: true } } },
  });
  if (
    !session ||
    session.expiresAt < new Date() ||
    session.admin.role !== "admin"
  )
    return c.json({ error: "Your session has expired." }, 401);
  c.set("admin", session.admin);
  if (
    !["GET", "HEAD"].includes(c.req.method) &&
    c.req.header("x-csrf-token") !== (await sha256Hex(`csrf:${token}`))
  )
    return c.json({ error: "Invalid request token." }, 403);
  await next();
};

const images = { images: { orderBy: { position: "asc" as const } } };

app.get("/api/health", (c) =>
  c.json({ ok: true, service: "almost-formal-api" }),
);

app.get("/api/products", async (c) => {
  const q = z
    .object({
      search: z.string().max(100).optional(),
      category: z.string().optional(),
      pattern: z.string().optional(),
      color: z.string().optional(),
      condition: z.string().optional(),
      maxPrice: z.coerce.number().int().min(0).optional(),
      sort: z
        .enum(["newest", "price-asc", "price-desc", "name"])
        .default("newest"),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(12),
      featured: z.enum(["true", "false"]).optional(),
      inStock: z.enum(["true", "false"]).optional(),
    })
    .parse(c.req.query());
  const where: Prisma.ProductWhereInput = {
    archived: false,
    ...(q.search
      ? {
          OR: [
            { title: { contains: q.search } },
            { description: { contains: q.search } },
            { pattern: { contains: q.search } },
          ],
        }
      : {}),
    ...(q.category ? { category: { in: q.category.split(",") } } : {}),
    ...(q.pattern ? { pattern: { in: q.pattern.split(",") } } : {}),
    ...(q.color ? { color: { in: q.color.split(",") } } : {}),
    ...(q.condition ? { condition: { in: q.condition.split(",") } } : {}),
    ...(q.maxPrice !== undefined ? { price: { lte: q.maxPrice } } : {}),
    ...(q.featured ? { featured: q.featured === "true" } : {}),
    ...(q.inStock === "true" ? { stock: { gt: 0 } } : {}),
  };
  const orderBy: Prisma.ProductOrderByWithRelationInput =
    q.sort === "price-asc"
      ? { price: "asc" }
      : q.sort === "price-desc"
        ? { price: "desc" }
        : q.sort === "name"
          ? { title: "asc" }
          : { createdAt: "desc" };
  const [products, total] = await Promise.all([
    c.var.db.product.findMany({
      where,
      include: images,
      orderBy,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
    c.var.db.product.count({ where }),
  ]);
  return c.json({
    products,
    total,
    page: q.page,
    pages: Math.ceil(total / q.limit),
  });
});

app.get("/api/product-filters", async (c) => {
  const products = await c.var.db.product.findMany({
    where: { archived: false },
    select: {
      category: true,
      pattern: true,
      color: true,
      condition: true,
      price: true,
    },
  });
  const values = (key: "category" | "pattern" | "color" | "condition") =>
    [
      ...new Set(products.map((product) => product[key]).filter(Boolean)),
    ].sort();
  return c.json({
    categories: values("category"),
    patterns: values("pattern"),
    colors: values("color"),
    conditions: values("condition"),
    maxPrice: products.reduce(
      (max, product) => Math.max(max, product.price),
      0,
    ),
  });
});

app.get("/api/products/:slug", async (c) => {
  const p = await c.var.db.product.findUnique({
    where: { slug: c.req.param("slug") },
    include: images,
  });
  if (!p || p.archived)
    throw new HttpError(404, "This find is no longer available.");
  return c.json(p);
});

app.get("/api/categories", async (c) =>
  c.json(
    await c.var.db.category.findMany({
      include: { _count: { select: { products: true } } },
    }),
  ),
);

app.get("/api/settings", async (c) =>
  c.json(
    await c.var.db.storeSettings.findUniqueOrThrow({ where: { id: "store" } }),
  ),
);

app.post(
  "/api/orders",
  rateLimit(15, 60_000),
  async (c) => {
    const { order, created } = await createOrder(
      { db: c.var.db, d1: c.env.DB },
      await readJson(c),
    );
    // Email only for a newly placed order, never for an idempotency
    // replay — same rule as main. Failures are logged, checkout is
    // unaffected (mail-worker never throws to the caller, and with no
    // RESEND_API_KEY configured this is a silent no-op).
    if (created)
      void sendOrderPlaced(c.env, order).catch((error) =>
        console.error("Resend order email failed:", error),
      );
    return c.json(order, 201);
  },
);

app.get("/api/orders/:id", async (c) => {
  const token = z.string().length(64).parse(c.req.header("x-order-token"));
  const order = await c.var.db.order.findFirst({
    where: {
      OR: [
        { id: c.req.param("id") },
        { number: c.req.param("id") },
      ],
      accessToken: token,
    },
    include: orderInclude,
  });
  if (!order)
    throw new HttpError(
      404,
      "Order not found. Check your order number and access code.",
    );
  c.header("Cache-Control", "no-store");
  return c.json(order);
});

app.post(
  "/api/newsletter",
  rateLimit(5, 60_000),
  async (c) => {
    const { email } = z
      .object({ email: z.email().max(200) })
      .parse(await readJson(c));
    await c.var.db.subscriber.upsert({
      where: { email },
      create: { email },
      update: {},
    });
    return c.json({ message: "You’re on the list. Good finds are coming." });
  },
);

app.post(
  "/api/contact",
  rateLimit(5, 60_000),
  async (c) => {
    const data = z
      .object({
        name: z.string().trim().min(2).max(100),
        email: z.email().max(200),
        message: z.string().trim().min(10).max(3000),
      })
      .parse(await readJson(c));
    await c.var.db.contactMessage.create({ data });
    void sendContactNotification(c.env, data).catch((error) =>
      console.error("Resend contact email failed:", error),
    );
    return c.json(
      {
        message: "Your message has been saved for the Almost Formal team.",
      },
      201,
    );
  },
);

app.post(
  "/api/auth/login",
  rateLimit(10, 15 * 60_000),
  async (c) => {
    const { email, password } = z
      .object({
        email: z.email().optional(),
        password: z.string().min(1).max(256),
      })
      .parse(await readJson(c));
    const candidates = email
      ? [
          await c.var.db.user.findUnique({
            where: { email },
            include: { admin: true },
          }),
        ]
      : await c.var.db.user.findMany({
          where: { admin: { isNot: null } },
          include: { admin: true },
        });
    let user: (typeof candidates)[number] | undefined;
    let legacyHash = false;
    for (const candidate of candidates) {
      if (candidate?.admin && candidate.passwordHash) {
        // Argon2 hashes were created on the old Render backend and can
        // never verify in a Worker. Say so plainly instead of the
        // misleading "Password is incorrect." — the fix is a password
        // reset via scripts/admin-reset-d1.ts (see CUTOVER.md).
        if (candidate.passwordHash.startsWith("$argon2")) {
          legacyHash = true;
          continue;
        }
        if (await verifyPassword(password, candidate.passwordHash)) {
          user = candidate;
          break;
        }
      }
    }
    if (!user?.admin)
      throw new HttpError(
        401,
        legacyHash
          ? "This admin password was set on the old backend and must be reset before signing in here."
          : "Password is incorrect.",
      );
    const token = randomTokenHex(32);
    await c.var.db.session.create({
      data: {
        id: await sha256Hex(token),
        adminId: user.admin.id,
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
      },
    });
    setCookie(c, "af_session", token, sessionCookieOptions(c));
    return c.json({
      name: user.name,
      csrfToken: await sha256Hex(`csrf:${token}`),
    });
  },
);

app.get("/api/auth/me", protect, async (c) => {
  c.header("Cache-Control", "no-store");
  return c.json({
    name: c.var.admin.user.name,
    email: c.var.admin.user.email,
    csrfToken: await sha256Hex(`csrf:${getCookie(c, "af_session")}`),
  });
});

app.post("/api/auth/logout", protect, async (c) => {
  await c.var.db.session.deleteMany({
    where: { id: await sha256Hex(getCookie(c, "af_session") ?? "") },
  });
  deleteCookie(c, "af_session", { path: "/api" });
  return c.json({ ok: true });
});

app.use("/api/admin/*", protect, async (c, next) => {
  c.header("Cache-Control", "no-store");
  await next();
});

app.get("/api/admin/dashboard", async (c) => {
  const [totalOrders, pending, completed, available, soldOut, revenue, recent] =
    await Promise.all([
      c.var.db.order.count(),
      c.var.db.order.count({ where: { status: "pending" } }),
      c.var.db.order.count({ where: { status: "delivered" } }),
      c.var.db.product.count({ where: { stock: { gt: 0 }, archived: false } }),
      c.var.db.product.count({ where: { stock: 0, archived: false } }),
      c.var.db.order.aggregate({
        where: { status: "delivered" },
        _sum: { total: true },
      }),
      c.var.db.order.findMany({
        take: 8,
        orderBy: { createdAt: "desc" },
        include: orderInclude,
      }),
    ]);
  return c.json({
    totalOrders,
    pending,
    completed,
    available,
    soldOut,
    revenue: revenue._sum.total || 0,
    recent,
  });
});

app.get("/api/admin/products", async (c) =>
  c.json(
    await c.var.db.product.findMany({
      include: images,
      orderBy: { createdAt: "desc" },
    }),
  ),
);

const productSchema = z.object({
  title: z.string().trim().min(2).max(150),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  sku: z.string().min(2).max(60),
  description: z.string().min(10).max(3000),
  price: z.number().int().positive().max(100000000),
  stock: z.number().int().min(0).max(10000),
  category: z.string().min(1),
  pattern: z.string().min(1),
  color: z.string().min(1),
  condition: z.enum(["Excellent", "Good", "Worn (character)"]),
  conditionNote: z.string().min(1).max(1000),
  flaws: z.string().max(1000),
  length: z.number().positive(),
  width: z.number().positive(),
  material: z.string().nullable(),
  era: z.string().nullable(),
  featured: z.boolean(),
  archived: z.boolean().optional(),
  imageUrls: z
    .array(
      z.string().refine(
        (url) =>
          /^\/(images|uploads)\/[a-zA-Z0-9._-]+$/.test(url) ||
          /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/.+$/.test(
            url,
          ),
        "Use an image uploaded to this store.",
      ),
    )
    .min(1)
    .max(8)
    .optional(),
});

// NOTE: the refine above can only check the URL shape — the exact
// cloud-name/folder check needs c.env, so create/patch handlers call
// assertImageUrls(imageUrls, c.env.CLOUDINARY_CLOUD_NAME) after
// parsing (same rule as main's isCloudinaryProductUrl).
function assertImageUrls(
  imageUrls: string[] | undefined,
  cloudName: string | undefined,
): void {
  if (!imageUrls) return;
  for (const url of imageUrls) {
    if (
      !/^\/(images|uploads)\/[a-zA-Z0-9._-]+$/.test(url) &&
      !isCloudinaryProductUrl(url, cloudName)
    )
      throw new HttpError(400, "Use an image uploaded to this store.");
  }
}

async function deleteUnusedCloudinaryImages(
  env: Env,
  urls: string[],
): Promise<void> {
  const db = createDb(env.DB);
  for (const url of new Set(urls)) {
    if (!isCloudinaryProductUrl(url, env.CLOUDINARY_CLOUD_NAME)) continue;
    const [productReferences, orderReferences] = await Promise.all([
      db.productImage.count({ where: { url } }),
      db.orderItem.count({ where: { image: url } }),
    ]);
    if (productReferences === 0 && orderReferences === 0)
      await destroyCloudinaryImage(env, url);
  }
}

// Admin product writes are multi-row: reads first, then one D1 batch()
// (see orders.ts for why db.$transaction cannot be used on D1).
app.post("/api/admin/products", async (c) => {
  const { imageUrls, ...data } = productSchema.parse(await readJson(c));
  assertImageUrls(imageUrls, c.env.CLOUDINARY_CLOUD_NAME);
  if (!imageUrls) throw new HttpError(400, "Add at least one product image.");
  const db = c.var.db;
  const d1 = c.env.DB;
  const category = await db.category.findUnique({
    where: { name: data.category },
  });
  if (!category) throw new HttpError(400, "Choose an existing category.");
  const productId = newId();
  const ts = nowIso();
  await d1.batch([
    d1
      .prepare(
        `INSERT INTO "Product" ("id","slug","sku","title","description","price","stock","pattern","color","condition","conditionNote","flaws","length","width","material","era","category","featured","archived","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        productId,
        data.slug,
        data.sku,
        data.title,
        data.description,
        data.price,
        data.stock,
        data.pattern,
        data.color,
        data.condition,
        data.conditionNote,
        data.flaws,
        data.length,
        data.width,
        data.material,
        data.era,
        data.category,
        data.featured ? 1 : 0,
        data.archived ? 1 : 0,
        ts,
        ts,
      ),
    ...imageUrls.map((url, position) =>
      d1
        .prepare(
          `INSERT INTO "ProductImage" ("id","productId","url","alt","position") VALUES (?,?,?,?,?)`,
        )
        .bind(newId(), productId, url, data.title, position),
    ),
    d1
      .prepare(
        `INSERT INTO "ProductCategory" ("productId","categoryId") VALUES (?,?)`,
      )
      .bind(productId, category.id),
    d1
      .prepare(
        `INSERT INTO "InventoryMovement" ("id","productId","delta","reason","createdAt") VALUES (?,?,?,?,?)`,
      )
      .bind(newId(), productId, data.stock, "Admin created product", ts),
    d1
      .prepare(
        `INSERT INTO "AuditLog" ("id","adminId","action","target","createdAt") VALUES (?,?,?,?,?)`,
      )
      .bind(newId(), c.var.admin.id, "product.create", productId, ts),
  ]);
  const p = await db.product.findUniqueOrThrow({
    where: { id: productId },
    include: images,
  });
  return c.json(p, 201);
});

app.patch("/api/admin/products/:id", async (c) => {
  const { imageUrls, ...data } = productSchema
    .partial()
    .parse(await readJson(c));
  assertImageUrls(imageUrls, c.env.CLOUDINARY_CLOUD_NAME);
  const id = c.req.param("id");
  const db = c.var.db;
  const d1 = c.env.DB;
  const before = await db.product.findUniqueOrThrow({ where: { id } });
  const previousImages = imageUrls
    ? await db.productImage.findMany({
        where: { productId: id },
        select: { url: true },
      })
    : [];
  const ts = nowIso();
  const statements = [];
  if (data.stock !== undefined && data.stock !== before.stock)
    statements.push(
      d1
        .prepare(
          `INSERT INTO "InventoryMovement" ("id","productId","delta","reason","createdAt") VALUES (?,?,?,?,?)`,
        )
        .bind(
          newId(),
          id,
          data.stock - before.stock,
          "Admin inventory adjustment",
          ts,
        ),
    );
  if (data.category) {
    const category = await db.category.findUnique({
      where: { name: data.category },
    });
    if (!category) throw new HttpError(400, "Choose an existing category.");
    statements.push(
      d1
        .prepare(`DELETE FROM "ProductCategory" WHERE "productId" = ?`)
        .bind(id),
      d1
        .prepare(
          `INSERT INTO "ProductCategory" ("productId","categoryId") VALUES (?,?)`,
        )
        .bind(id, category.id),
    );
  }
  statements.push(
    d1
      .prepare(
        `INSERT INTO "AuditLog" ("id","adminId","action","target","createdAt") VALUES (?,?,?,?,?)`,
      )
      .bind(newId(), c.var.admin.id, "product.update", id, ts),
  );
  if (imageUrls) {
    statements.push(
      d1
        .prepare(`DELETE FROM "ProductImage" WHERE "productId" = ?`)
        .bind(id),
      ...imageUrls.map((url, position) =>
        d1
          .prepare(
            `INSERT INTO "ProductImage" ("id","productId","url","alt","position") VALUES (?,?,?,?,?)`,
          )
          .bind(newId(), id, url, data.title || before.title, position),
      ),
    );
  }
  const sets: string[] = [];
  const values: unknown[] = [];
  const columns: Record<string, string> = {
    title: "title",
    slug: "slug",
    sku: "sku",
    description: "description",
    price: "price",
    stock: "stock",
    pattern: "pattern",
    color: "color",
    condition: "condition",
    conditionNote: "conditionNote",
    flaws: "flaws",
    length: "length",
    width: "width",
    material: "material",
    era: "era",
    category: "category",
    featured: "featured",
    archived: "archived",
  };
  for (const [key, column] of Object.entries(columns)) {
    const value = (data as Record<string, unknown>)[key];
    if (value !== undefined) {
      sets.push(`"${column}" = ?`);
      values.push(typeof value === "boolean" ? (value ? 1 : 0) : value);
    }
  }
  sets.push(`"updatedAt" = ?`);
  values.push(ts, id);
  statements.push(
    d1
      .prepare(`UPDATE "Product" SET ${sets.join(", ")} WHERE "id" = ?`)
      .bind(...values),
  );
  await d1.batch(statements);
  const p = await db.product.findUniqueOrThrow({
    where: { id },
    include: images,
  });
  if (imageUrls) {
    void deleteUnusedCloudinaryImages(
      c.env,
      previousImages
        .map((image) => image.url)
        .filter((url) => !imageUrls.includes(url)),
    ).catch((error) =>
      console.error("Cloudinary image cleanup failed:", error),
    );
  }
  return c.json(p);
});

app.delete("/api/admin/products/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.var.db;
  const d1 = c.env.DB;
  const count = await db.orderItem.count({ where: { productId: id } });
  if (count)
    throw new HttpError(
      409,
      "This product has order history. Archive it instead.",
    );
  const previousImages = await db.productImage.findMany({
    where: { productId: id },
    select: { url: true },
  });
  const ts = nowIso();
  await d1.batch([
    // Delete child rows explicitly: D1/SQLite only enforces ON DELETE
    // CASCADE when foreign_keys is on, which the Prisma D1 adapter
    // does not guarantee — never rely on the cascade here.
    d1
      .prepare(`DELETE FROM "ProductImage" WHERE "productId" = ?`)
      .bind(id),
    d1
      .prepare(`DELETE FROM "ProductCategory" WHERE "productId" = ?`)
      .bind(id),
    d1
      .prepare(`DELETE FROM "InventoryMovement" WHERE "productId" = ?`)
      .bind(id),
    d1.prepare(`DELETE FROM "Product" WHERE "id" = ?`).bind(id),
    d1
      .prepare(
        `INSERT INTO "AuditLog" ("id","adminId","action","target","createdAt") VALUES (?,?,?,?,?)`,
      )
      .bind(newId(), c.var.admin.id, "product.delete", id, ts),
  ]);
  void deleteUnusedCloudinaryImages(
    c.env,
    previousImages.map((image) => image.url),
  ).catch((error) =>
    console.error("Cloudinary image cleanup failed:", error),
  );
  return c.json({ ok: true });
});

app.post("/api/admin/categories", async (c) => {
  const data = z
    .object({
      name: z.string().min(2).max(80),
      slug: z.string().regex(/^[a-z0-9-]+$/),
    })
    .parse(await readJson(c));
  return c.json(await c.var.db.category.create({ data }), 201);
});

app.get("/api/admin/orders", async (c) =>
  c.json(
    await c.var.db.order.findMany({
      include: orderInclude,
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ),
);

app.patch("/api/admin/orders/:id/status", async (c) => {
  const data = z
    .object({
      status: z.enum([
        "confirmed",
        "packed",
        "shipped",
        "delivered",
        "cancelled",
      ]),
      trackingNumber: z.string().max(150).optional(),
      carrier: z.string().max(100).optional(),
    })
    .parse(await readJson(c));
  const orderId = c.req.param("id");
  const before = await c.var.db.order.findUnique({
    where: { id: orderId },
    select: { status: true },
  });
  const order = await updateOrderStatus(
    { db: c.var.db, d1: c.env.DB },
    orderId,
    data.status,
    c.var.admin.id,
    data.trackingNumber,
    data.carrier,
  );
  if (
    before?.status !== order.status &&
    ["shipped", "delivered", "cancelled"].includes(order.status)
  ) {
    const details = await c.var.db.order.findUniqueOrThrow({
      where: { id: orderId },
      include: orderInclude,
    });
    void sendOrderStatus(c.env, details).catch((error) =>
      console.error("Resend status email failed:", error),
    );
  }
  return c.json(order);
});

app.get("/api/admin/inventory", async (c) =>
  c.json(
    await c.var.db.inventoryMovement.findMany({
      take: 200,
      include: { product: { select: { title: true, sku: true, stock: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ),
);

app.get("/api/admin/customers", async (c) => {
  const addresses = await c.var.db.address.findMany({
    include: {
      orders: {
        select: {
          id: true,
          number: true,
          total: true,
          status: true,
          createdAt: true,
        },
      },
    },
    orderBy: { id: "desc" },
    take: 500,
  });
  return c.json(addresses);
});

app.get("/api/admin/messages", async (c) =>
  c.json(
    await c.var.db.contactMessage.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ),
);

app.patch("/api/admin/settings", async (c) => {
  const data = z
    .object({
      name: z.string().min(1).max(100),
      email: z.union([z.email(), z.literal("")]),
      phone: z.string().max(30),
      instagram: z.union([
        z
          .url()
          .refine(
            (v) =>
              new URL(v).hostname === "www.instagram.com" ||
              new URL(v).hostname === "instagram.com",
          ),
        z.literal(""),
      ]),
      shipping: z.number().int().min(0).max(1000000),
      codEnabled: z.boolean(),
      announcement: z.string().max(200),
    })
    .partial()
    .parse(await readJson(c));
  return c.json(
    await c.var.db.storeSettings.update({ where: { id: "store" }, data }),
  );
});

// Uploads: Cloudinary only (cloudinary-worker.ts). The file is
// signed-uploaded to `almost-formal/products` and stored as WebP by
// Cloudinary; the returned res.cloudinary.com URL is what the
// product form saves. There is no server-side resize on Workers —
// Sharp is a native binary and cannot run here — and no R2 bucket
// or local disk. Without Cloudinary secrets the endpoint answers
// 503 (same as main when STORAGE_MODE=cloudinary is set but the
// credentials are missing); with only some of the three secrets set
// it also answers 503 and names the gap, without leaking values.
const ALLOWED_UPLOAD_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

app.post("/api/admin/uploads", async (c) => {
  if (!cloudinaryConfigured(c.env)) {
    if (cloudinaryPartiallyConfigured(c.env))
      throw new HttpError(
        503,
        "Cloudinary credentials are incomplete. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET together.",
      );
    throw new HttpError(
      503,
      "Configure Cloudinary before uploading product images.",
    );
  }
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    throw new HttpError(400, "Choose a JPEG, PNG or WebP image under 5 MB.");
  }
  const file = form.get("image");
  if (
    !(file instanceof File) ||
    !ALLOWED_UPLOAD_TYPES[file.type] ||
    file.size > 5 * 1024 * 1024 ||
    file.size === 0
  )
    throw new HttpError(400, "Choose a JPEG, PNG or WebP image under 5 MB.");
  let url: string;
  try {
    url = await uploadProductImage(c.env, file);
  } catch (error) {
    console.error("Cloudinary upload failed:", error);
    throw new HttpError(
      503,
      "Image upload failed. Check the Cloudinary configuration and retry.",
    );
  }
  return c.json({ url }, 201);
});

// Legacy /uploads/* files lived on the old host's local disk (and
// briefly in R2 in the first Worker draft). A Worker has no disk to
// serve them from, so they answer 410 Gone: the image must be
// re-uploaded to Cloudinary and the product record updated (see
// CUTOVER.md). Product images already in Cloudinary or in the web
// app's public/images are unaffected.
app.get("/uploads/:file", (c) =>
  c.json(
    {
      error:
        "Legacy local uploads are not served by the API Worker. Re-upload this image to Cloudinary.",
    },
    410,
  ),
);

app.notFound((c) => c.json({ error: "Endpoint not found." }, 404));

app.onError((err, c) => {
  if (err instanceof z.ZodError)
    return c.json(
      {
        error: err.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      },
      400,
    );
  if (err instanceof HttpError)
    return c.json({ error: err.message }, err.status);
  // Raw D1 batch() errors are plain Errors, not Prisma errors: a
  // duplicate slug/sku surfaces as "UNIQUE constraint failed" and
  // must answer 409 like main's P2002, never a bare 500.
  if (err instanceof Error && /UNIQUE constraint failed/i.test(err.message))
    return c.json(
      {
        error:
          "This record already exists. Please retry or choose a unique value.",
      },
      409,
    );
  if (err instanceof PrismaRuntime.PrismaClientKnownRequestError) {
    if (err.code === "P2002")
      return c.json(
        {
          error:
            "This record already exists. Please retry or choose a unique value.",
        },
        409,
      );
    if (err.code === "P2025")
      return c.json({ error: "Record not found." }, 404);
    if (["P1008", "P2028", "P2034"].includes(err.code))
      return c.json(
        {
          error:
            "Another order is being processed. Please retry your checkout.",
        },
        409,
      );
  }
  console.error(err);
  return c.json({ error: "Something went wrong. Please try again." }, 500);
});

export default app;
