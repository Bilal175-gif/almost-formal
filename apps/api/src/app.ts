import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import { verify } from "argon2";
import { randomBytes, createHash } from "node:crypto";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import multer from "multer";
import sharp from "sharp";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "./db.js";
import {
  createOrder,
  HttpError,
  orderInclude,
  updateOrderStatus,
} from "./orders.js";
import {
  sendContactNotification,
  sendOrderPlaced,
  sendOrderStatus,
} from "./mail.js";
import {
  cloudinaryConfigured,
  destroyCloudinaryImage,
  isCloudinaryProductUrl,
  uploadProductImage,
} from "./cloudinary.js";
export const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 180,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    if (process.env.NODE_ENV !== "test")
      console.log(
        JSON.stringify({
          method: req.method,
          path: req.path,
          status: res.statusCode,
          ms: Date.now() - start,
        }),
      );
  });
  next();
});
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  const origin = req.get("origin");
  const allowedOrigins = new Set([
    process.env.APP_ORIGIN || "http://localhost:3000",
    ...(process.env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()),
  ]);
  const localDevelopmentOrigin =
    process.env.NODE_ENV !== "production" &&
    origin !== undefined &&
    /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
  const allowed = !!origin && (allowedOrigins.has(origin) || localDevelopmentOrigin);
  if (allowed && origin) {
    res.vary("Origin");
    res.set({
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-CSRF-Token, X-Order-Token",
    });
  }
  if (req.method === "OPTIONS") return res.sendStatus(allowed ? 204 : 403);
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    if (origin && !allowed)
      return res.status(403).json({ error: "Request origin is not allowed." });
    if (req.get("sec-fetch-site") === "cross-site" && !allowed)
      return res
        .status(403)
        .json({ error: "Cross-site requests are not allowed." });
  }
  next();
});
const protect = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies.af_session;
  if (!token)
    return res
      .status(401)
      .json({ error: "Please sign in as an administrator." });
  const session = await db.session.findUnique({
    where: { id: createHash("sha256").update(token).digest("hex") },
    include: { admin: { include: { user: true } } },
  });
  if (
    !session ||
    session.expiresAt < new Date() ||
    session.admin.role !== "admin"
  )
    return res.status(401).json({ error: "Your session has expired." });
  res.locals.admin = session.admin;
  if (
    !["GET", "HEAD"].includes(req.method) &&
    req.get("x-csrf-token") !==
      createHash("sha256").update(`csrf:${token}`).digest("hex")
  )
    return res.status(403).json({ error: "Invalid request token." });
  next();
};
const images = { images: { orderBy: { position: "asc" as const } } };
app.get("/api/health", (_req, res) =>
  res.json({ ok: true, service: "almost-formal-api" }),
);
app.get("/api/products", async (req, res) => {
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
    .parse(req.query);
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
    db.product.findMany({
      where,
      include: images,
      orderBy,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
    db.product.count({ where }),
  ]);
  res.json({
    products,
    total,
    page: q.page,
    pages: Math.ceil(total / q.limit),
  });
});
app.get("/api/product-filters", async (_req, res) => {
  const products = await db.product.findMany({
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
  res.json({
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
app.get("/api/products/:slug", async (req, res) => {
  const p = await db.product.findUnique({
    where: { slug: String(req.params.slug) },
    include: images,
  });
  if (!p || p.archived)
    throw new HttpError(404, "This find is no longer available.");
  res.json(p);
});
app.get("/api/categories", async (_req, res) =>
  res.json(
    await db.category.findMany({
      include: { _count: { select: { products: true } } },
    }),
  ),
);
app.get("/api/settings", async (_req, res) =>
  res.json(
    await db.storeSettings.findUniqueOrThrow({ where: { id: "store" } }),
  ),
);
app.post(
  "/api/orders",
  rateLimit({ windowMs: 60000, limit: 15 }),
  async (req, res) =>
    res.status(201).json(
      await createOrder(req.body, (order) => {
        void sendOrderPlaced(order).catch((error) =>
          console.error("SMTP order email failed:", error),
        );
      }),
    ),
);
app.get("/api/orders/:id", async (req, res) => {
  const token = z.string().length(64).parse(req.get("x-order-token"));
  const order = await db.order.findFirst({
    where: {
      OR: [{ id: String(req.params.id) }, { number: String(req.params.id) }],
      accessToken: token,
    },
    include: orderInclude,
  });
  if (!order)
    throw new HttpError(
      404,
      "Order not found. Check your order number and access code.",
    );
  res.set("Cache-Control", "no-store").json(order);
});
app.post(
  "/api/newsletter",
  rateLimit({ windowMs: 60000, limit: 5 }),
  async (req, res) => {
    const { email } = z.object({ email: z.email().max(200) }).parse(req.body);
    await db.subscriber.upsert({
      where: { email },
      create: { email },
      update: {},
    });
    res.json({ message: "You’re on the list. Good finds are coming." });
  },
);
app.post(
  "/api/contact",
  rateLimit({ windowMs: 60000, limit: 5 }),
  async (req, res) => {
    const data = z
      .object({
        name: z.string().trim().min(2).max(100),
        email: z.email().max(200),
        message: z.string().trim().min(10).max(3000),
      })
      .parse(req.body);
    await db.contactMessage.create({ data });
    void sendContactNotification(data).catch((error) =>
      console.error("SMTP contact email failed:", error),
    );
    res.status(201).json({
      message: "Your message has been saved for the Almost Formal team.",
    });
  },
);
app.post(
  "/api/auth/login",
  rateLimit({ windowMs: 15 * 60000, limit: 10 }),
  async (req, res) => {
    const { email, password } = z
      .object({
        email: z.email().optional(),
        password: z.string().min(1).max(256),
      })
      .parse(req.body);
    const candidates = email
      ? [
          await db.user.findUnique({
            where: { email },
            include: { admin: true },
          }),
        ]
      : await db.user.findMany({
          where: { admin: { isNot: null } },
          include: { admin: true },
        });
    let user: (typeof candidates)[number] | undefined;
    for (const candidate of candidates) {
      if (
        candidate?.admin &&
        candidate.passwordHash &&
        (await verify(candidate.passwordHash, password))
      ) {
        user = candidate;
        break;
      }
    }
    if (!user?.admin) throw new HttpError(401, "Password is incorrect.");
    const token = randomBytes(32).toString("hex");
    await db.session.create({
      data: {
        id: createHash("sha256").update(token).digest("hex"),
        adminId: user.admin.id,
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
      },
    });
    res
      .cookie("af_session", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 8 * 60 * 60 * 1000,
        path: "/api",
      })
      .json({
        name: user.name,
        csrfToken: createHash("sha256").update(`csrf:${token}`).digest("hex"),
      });
  },
);
app.get("/api/auth/me", protect, (req, res) =>
  res.set("Cache-Control", "no-store").json({
    name: res.locals.admin.user.name,
    email: res.locals.admin.user.email,
    csrfToken: createHash("sha256")
      .update(`csrf:${req.cookies.af_session}`)
      .digest("hex"),
  }),
);
app.post("/api/auth/logout", protect, async (req, res) => {
  await db.session.deleteMany({
    where: {
      id: createHash("sha256").update(req.cookies.af_session).digest("hex"),
    },
  });
  res.clearCookie("af_session", { path: "/api" }).json({ ok: true });
});
app.use("/api/admin", protect, (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.get("/api/admin/dashboard", async (_req, res) => {
  const [totalOrders, pending, completed, available, soldOut, revenue, recent] =
    await Promise.all([
      db.order.count(),
      db.order.count({ where: { status: "pending" } }),
      db.order.count({ where: { status: "delivered" } }),
      db.product.count({ where: { stock: { gt: 0 }, archived: false } }),
      db.product.count({ where: { stock: 0, archived: false } }),
      db.order.aggregate({
        where: { status: "delivered" },
        _sum: { total: true },
      }),
      db.order.findMany({
        take: 8,
        orderBy: { createdAt: "desc" },
        include: orderInclude,
      }),
    ]);
  res.json({
    totalOrders,
    pending,
    completed,
    available,
    soldOut,
    revenue: revenue._sum.total || 0,
    recent,
  });
});
app.get("/api/admin/products", async (_req, res) =>
  res.json(
    await db.product.findMany({
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
    .array(z.string().refine(
      (url) => /^\/(images|uploads)\/[a-zA-Z0-9._-]+$/.test(url) || isCloudinaryProductUrl(url),
      "Use an image uploaded to this store.",
    ))
    .min(1)
    .max(8)
    .optional(),
});
async function deleteUnusedCloudinaryImages(urls: string[]) {
  for (const url of new Set(urls)) {
    if (!isCloudinaryProductUrl(url)) continue;
    const [productReferences, orderReferences] = await Promise.all([
      db.productImage.count({ where: { url } }),
      db.orderItem.count({ where: { image: url } }),
    ]);
    if (productReferences === 0 && orderReferences === 0)
      await destroyCloudinaryImage(url);
  }
}
app.post("/api/admin/products", async (req, res) => {
  const { imageUrls, ...data } = productSchema.parse(req.body);
  if (!imageUrls) throw new HttpError(400, "Add at least one product image.");
  const p = await db.$transaction(async (tx) => {
    const category = await tx.category.findUnique({
      where: { name: data.category },
    });
    if (!category) throw new HttpError(400, "Choose an existing category.");
    const p = await tx.product.create({
      data: {
        ...data,
        images: {
          create: imageUrls.map((url, position) => ({
            url,
            alt: data.title,
            position,
          })),
        },
        categories: { create: { categoryId: category.id } },
        movements: {
          create: { delta: data.stock, reason: "Admin created product" },
        },
      },
      include: images,
    });
    await tx.auditLog.create({
      data: {
        adminId: res.locals.admin.id,
        action: "product.create",
        target: p.id,
      },
    });
    return p;
  });
  res.status(201).json(p);
});
app.patch("/api/admin/products/:id", async (req, res) => {
  const { imageUrls, ...data } = productSchema.partial().parse(req.body);
  const id = String(req.params.id);
  const previousImages = imageUrls
    ? await db.productImage.findMany({ where: { productId: id }, select: { url: true } })
    : [];
  const p = await db.$transaction(async (tx) => {
    const before = await tx.product.findUniqueOrThrow({ where: { id } });
    if (data.stock !== undefined && data.stock !== before.stock)
      await tx.inventoryMovement.create({
        data: {
          productId: id,
          delta: data.stock - before.stock,
          reason: "Admin inventory adjustment",
        },
      });
    if (data.category) {
      const category = await tx.category.findUnique({
        where: { name: data.category },
      });
      if (!category) throw new HttpError(400, "Choose an existing category.");
      await tx.productCategory.deleteMany({ where: { productId: id } });
      await tx.productCategory.create({
        data: { productId: id, categoryId: category.id },
      });
    }
    await tx.auditLog.create({
      data: {
        adminId: res.locals.admin.id,
        action: "product.update",
        target: id,
      },
    });
    return tx.product.update({
      where: { id },
      data: {
        ...data,
        ...(imageUrls
          ? {
              images: {
                deleteMany: {},
                create: imageUrls.map((url, position) => ({
                  url,
                  alt: data.title || before.title,
                  position,
                })),
              },
            }
          : {}),
      },
      include: images,
    });
  });
  res.json(p);
  if (imageUrls) {
    void deleteUnusedCloudinaryImages(previousImages.map((image) => image.url).filter((url) => !imageUrls.includes(url)))
      .catch((error) => console.error("Cloudinary image cleanup failed:", error));
  }
});
app.delete("/api/admin/products/:id", async (req, res) => {
  const id = String(req.params.id);
  const previousImages = await db.productImage.findMany({ where: { productId: id }, select: { url: true } });
  await db.$transaction(async (tx) => {
    const count = await tx.orderItem.count({ where: { productId: id } });
    if (count)
      throw new HttpError(
        409,
        "This product has order history. Archive it instead.",
      );
    await tx.inventoryMovement.deleteMany({ where: { productId: id } });
    await tx.product.delete({ where: { id } });
    await tx.auditLog.create({
      data: {
        adminId: res.locals.admin.id,
        action: "product.delete",
        target: id,
      },
    });
  });
  res.json({ ok: true });
  void deleteUnusedCloudinaryImages(previousImages.map((image) => image.url))
    .catch((error) => console.error("Cloudinary image cleanup failed:", error));
});
app.post("/api/admin/categories", async (req, res) => {
  const data = z
    .object({
      name: z.string().min(2).max(80),
      slug: z.string().regex(/^[a-z0-9-]+$/),
    })
    .parse(req.body);
  res.status(201).json(await db.category.create({ data }));
});
app.get("/api/admin/orders", async (_req, res) =>
  res.json(
    await db.order.findMany({
      include: orderInclude,
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ),
);
app.patch("/api/admin/orders/:id/status", async (req, res) => {
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
    .parse(req.body);
  const orderId = String(req.params.id);
  const before = await db.order.findUnique({
    where: { id: orderId },
    select: { status: true },
  });
  const order = await updateOrderStatus(
    orderId,
    data.status,
    res.locals.admin.id,
    data.trackingNumber,
    data.carrier,
  );
  if (
    before?.status !== order.status &&
    ["shipped", "delivered", "cancelled"].includes(order.status)
  ) {
    const details = await db.order.findUniqueOrThrow({
      where: { id: orderId },
      include: orderInclude,
    });
    void sendOrderStatus(details).catch((error) =>
      console.error("SMTP status email failed:", error),
    );
  }
  res.json(order);
});
app.get("/api/admin/inventory", async (_req, res) =>
  res.json(
    await db.inventoryMovement.findMany({
      take: 200,
      include: { product: { select: { title: true, sku: true, stock: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ),
);
app.get("/api/admin/customers", async (_req, res) => {
  const addresses = await db.address.findMany({
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
  res.json(addresses);
});
app.get("/api/admin/messages", async (_req, res) =>
  res.json(
    await db.contactMessage.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ),
);
app.patch("/api/admin/settings", async (req, res) => {
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
    .parse(req.body);
  res.json(await db.storeSettings.update({ where: { id: "store" }, data }));
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    cb(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)),
});
const uploads = path.resolve(process.env.UPLOAD_DIR || "uploads");
app.use(
  "/uploads",
  express.static(uploads, { dotfiles: "deny", immutable: true, maxAge: "1y" }),
);
app.post("/api/admin/uploads", upload.single("image"), async (req, res) => {
  if (!req.file)
    throw new HttpError(400, "Choose a JPEG, PNG or WebP image under 5 MB.");
  let optimized: Buffer;
  try {
    const metadata = await sharp(req.file.buffer, { limitInputPixels: 25000000 }).metadata();
    if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format))
      throw new Error("Unsupported image format");
    optimized = await sharp(req.file.buffer, { limitInputPixels: 25000000 })
      .rotate()
      .resize(1600, 2000, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 88 })
      .toBuffer();
  } catch {
    throw new HttpError(400, "Choose a valid JPEG, PNG or WebP image under 5 MB and 25 megapixels.");
  }
  if (cloudinaryConfigured()) {
    const url = await uploadProductImage(optimized);
    return res.status(201).json({ url });
  }
  if (process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_API_KEY || process.env.CLOUDINARY_API_SECRET)
    throw new HttpError(503, "Cloudinary credentials are incomplete.");
  await mkdir(uploads, { recursive: true });
  const filename = `${randomBytes(16).toString("hex")}.webp`;
  await writeFile(path.join(uploads, filename), optimized);
  res.status(201).json({ url: `/uploads/${filename}` });
});
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "Endpoint not found." }),
);
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof z.ZodError)
    return res.status(400).json({
      error: err.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    });
  if (err instanceof HttpError)
    return res.status(err.status).json({ error: err.message });
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002")
      return res.status(409).json({
        error:
          "This record already exists. Please retry or choose a unique value.",
      });
    if (err.code === "P2025")
      return res.status(404).json({ error: "Record not found." });
    if (["P1008", "P2028", "P2034"].includes(err.code))
      return res.status(409).json({
        error: "Another order is being processed. Please retry your checkout.",
      });
  }
  if (err instanceof multer.MulterError)
    return res.status(400).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});
