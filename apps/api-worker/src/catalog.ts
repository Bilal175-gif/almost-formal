import { z } from "zod";
import { all, ApiError, bools, first, json, type D1Database } from "./db";

type ProductRow = Record<string, unknown> & { id: string; slug: string };

async function withImages(db: D1Database, products: ProductRow[]) {
  if (!products.length) return [];
  const placeholders = products.map(() => "?").join(",");
  const images = await all<{ id: string; productId: string; url: string; alt: string; position: number }>(
    db,
    `SELECT * FROM "ProductImage" WHERE "productId" IN (${placeholders}) ORDER BY "position"`,
    ...products.map((product) => product.id),
  );
  return products.map((product) => ({
    ...bools(product, ["featured", "archived"]),
    images: images.filter((image) => image.productId === product.id),
  }));
}

export async function productList(db: D1Database, url: URL) {
  const q = z.object({
    search: z.string().max(100).optional(),
    category: z.string().optional(),
    pattern: z.string().optional(),
    color: z.string().optional(),
    condition: z.string().optional(),
    maxPrice: z.coerce.number().int().min(0).optional(),
    sort: z.enum(["newest", "price-asc", "price-desc", "name"]).default("newest"),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(12),
    featured: z.enum(["true", "false"]).optional(),
    inStock: z.enum(["true", "false"]).optional(),
  }).parse(Object.fromEntries(url.searchParams));
  const where = ['"archived" = 0'];
  const values: unknown[] = [];
  if (q.search) {
    where.push('(LOWER("title") LIKE ? OR LOWER("description") LIKE ? OR LOWER("pattern") LIKE ?)');
    const needle = `%${q.search.toLowerCase()}%`;
    values.push(needle, needle, needle);
  }
  for (const key of ["category", "pattern", "color", "condition"] as const) {
    if (!q[key]) continue;
    const entries = q[key].split(",").filter(Boolean);
    if (!entries.length) continue;
    where.push(`"${key}" IN (${entries.map(() => "?").join(",")})`);
    values.push(...entries);
  }
  if (q.maxPrice !== undefined) { where.push('"price" <= ?'); values.push(q.maxPrice); }
  if (q.featured) { where.push('"featured" = ?'); values.push(q.featured === "true" ? 1 : 0); }
  if (q.inStock === "true") where.push('"stock" > 0');
  const filter = where.join(" AND ");
  const order = q.sort === "price-asc" ? '"price" ASC' : q.sort === "price-desc" ? '"price" DESC' : q.sort === "name" ? '"title" ASC' : '"createdAt" DESC';
  const count = await first<{ total: number }>(db, `SELECT COUNT(*) AS total FROM "Product" WHERE ${filter}`, ...values);
  const products = await all<ProductRow>(db, `SELECT * FROM "Product" WHERE ${filter} ORDER BY ${order} LIMIT ? OFFSET ?`, ...values, q.limit, (q.page - 1) * q.limit);
  return json({ products: await withImages(db, products), total: count?.total || 0, page: q.page, pages: Math.ceil((count?.total || 0) / q.limit) });
}

export async function productDetail(db: D1Database, slug: string) {
  const product = await first<ProductRow>(db, 'SELECT * FROM "Product" WHERE "slug" = ? AND "archived" = 0', slug);
  if (!product) throw new ApiError(404, "This find is no longer available.");
  return json((await withImages(db, [product]))[0]);
}

export async function productFilters(db: D1Database) {
  const products = await all<Record<string, unknown>>(db, 'SELECT "category", "pattern", "color", "condition", "price" FROM "Product" WHERE "archived" = 0');
  const values = (key: string) => [...new Set(products.map((product) => product[key]).filter(Boolean))].sort();
  return json({ categories: values("category"), patterns: values("pattern"), colors: values("color"), conditions: values("condition"), maxPrice: Math.max(0, ...products.map((product) => Number(product.price))) });
}

export async function categories(db: D1Database) {
  const rows = await all<Record<string, unknown>>(db, 'SELECT c.*, (SELECT COUNT(*) FROM "ProductCategory" pc WHERE pc."categoryId" = c."id") AS products FROM "Category" c ORDER BY c."name"');
  return json(rows.map(({ products, ...row }) => ({ ...row, _count: { products } })));
}

export async function settings(db: D1Database) {
  const row = await first<Record<string, unknown>>(db, 'SELECT * FROM "StoreSettings" WHERE "id" = ?', "store");
  if (!row) throw new ApiError(503, "Store settings are not initialized.");
  return json(bools(row, ["codEnabled"]));
}

export { withImages };
