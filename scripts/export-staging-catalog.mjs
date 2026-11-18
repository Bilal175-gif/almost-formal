import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const sourceUrl = process.env.NEON_SOURCE_URL;
if (!sourceUrl || !/^postgres(ql)?:/.test(sourceUrl))
  throw new Error("Set NEON_SOURCE_URL to the Neon PostgreSQL connection string.");

const sqlValue = (value) => {
  if (value === null || value === undefined) return "NULL";
  if (value instanceof Date) return sqlValue(value.toISOString());
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Non-finite database number.");
    return String(value);
  }
  if (typeof value !== "string" || value.includes("\0"))
    throw new Error("Unsupported database value.");
  return `'${value.replaceAll("'", "''")}'`;
};

const insert = (table, columns, row, key = "id") => {
  const names = columns.map((column) => `"${column}"`).join(", ");
  const values = columns.map((column) => sqlValue(row[column])).join(", ");
  const updates = columns
    .filter((column) => column !== key)
    .map((column) => `"${column}" = excluded."${column}"`)
    .join(", ");
  return `INSERT INTO "${table}" (${names}) VALUES (${values}) ON CONFLICT("${key}") DO UPDATE SET ${updates};`;
};

const productColumns = [
  "id", "slug", "sku", "title", "description", "price", "stock",
  "pattern", "color", "condition", "conditionNote", "flaws", "length",
  "width", "material", "era", "category", "featured", "archived",
  "createdAt", "updatedAt",
];
const imageColumns = ["id", "productId", "url", "alt", "position"];
const settingColumns = [
  "id", "name", "email", "phone", "instagram", "shipping",
  "codEnabled", "announcement",
];

const db = new PrismaClient({ datasourceUrl: sourceUrl });
try {
  const [products, categories, settings] = await Promise.all([
    db.product.findMany({ include: { images: true, categories: true } }),
    db.category.findMany(),
    db.storeSettings.findUnique({ where: { id: "store" } }),
  ]);
  if (!settings) throw new Error("Source store settings are missing.");
  const lines = ["-- Public catalog only. No customers, admins, orders, or sessions."];
  lines.push(insert("StoreSettings", settingColumns, settings));
  for (const category of categories)
    lines.push(insert("Category", ["id", "name", "slug"], category));
  for (const product of products) {
    lines.push(insert("Product", productColumns, product));
    for (const image of product.images)
      lines.push(insert("ProductImage", imageColumns, image));
    for (const link of product.categories)
      lines.push(`INSERT INTO "ProductCategory" ("productId", "categoryId") VALUES (${sqlValue(link.productId)}, ${sqlValue(link.categoryId)}) ON CONFLICT("productId", "categoryId") DO NOTHING;`);
  }
  const destination = "/tmp/almost-formal-staging-catalog.sql";
  await writeFile(destination, `${lines.join("\n")}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ destination, products: products.length, images: products.reduce((n, product) => n + product.images.length, 0), categories: categories.length }));
} finally {
  await db.$disconnect();
}
