// Build a D1 import SQL file from the LIVE backup JSON — no Neon
// export needed. This is the cutover data path (see CUTOVER.md):
// the live Render API was slow (cold start) but UP, and its catalogue
// was captured to ~/workspace/almost-formal-live-backup-2026-11-19/.
//
// Usage:
//   node scripts/migrate-neon-to-d1/03-json-to-d1.mjs \
//     ~/workspace/almost-formal-live-backup-2026-11-19 \
//     ./d1-import-live-products.sql
//
// What it emits (dependency order, Neon cuid IDs kept verbatim):
//   StoreSettings (1) -> Category (6) -> Product (29) ->
//   ProductImage (29) -> ProductCategory (29, matched by the
//   product's `category` NAME to the category id in categories.json)
// Dates are kept exactly as in the backup (ISO strings). Booleans
// become 1/0. Strings are single-quote escaped.
//
// Safety: the script FAILS (exit 1, no file written) if any check
// fails — a product whose category name is not in categories.json,
// a non-Cloudinary image URL, a duplicate slug/sku/id, or a count
// mismatch. It never touches Neon, Render, D1, or the network.
// Apply only to an EMPTY D1 after the migrations (CUTOVER.md step 2):
//   wrangler d1 execute almost-formal-db --remote --file=d1-import-live-products.sql
// Verify afterwards with the COUNT queries in CUTOVER.md / README.
import { readFileSync, writeFileSync } from "node:fs";

const [backupDir, outFile] = process.argv.slice(2);
if (!backupDir || !outFile) {
  console.error(
    "Usage: node scripts/migrate-neon-to-d1/03-json-to-d1.mjs <backup-dir> <out.sql>",
  );
  process.exit(1);
}

const fail = (msg) => {
  console.error(`03-json-to-d1: ${msg}`);
  process.exit(1);
};

const productsDoc = JSON.parse(
  readFileSync(`${backupDir}/products-all.json`, "utf8"),
);
const products = productsDoc.products;
if (!Array.isArray(products)) fail("products-all.json has no products array");
const categories = JSON.parse(
  readFileSync(`${backupDir}/categories.json`, "utf8"),
);
const settings = JSON.parse(
  readFileSync(`${backupDir}/settings.json`, "utf8"),
);
if (!Array.isArray(categories)) fail("categories.json is not an array");
if (!settings || settings.id !== "store")
  fail("settings.json is not the store settings row");

const categoryByName = new Map(categories.map((c) => [c.name, c.id]));

// --- Verification (fail loudly, write nothing) ---
if (products.length !== 29)
  fail(`expected 29 products, found ${products.length}`);
const seen = new Set();
let imageCount = 0;
for (const p of products) {
  for (const key of ["id", "slug", "sku"]) {
    if (!p[key]) fail(`product missing ${key}: ${JSON.stringify(p).slice(0, 120)}`);
    if (seen.has(`${key}:${p[key]}`)) fail(`duplicate ${key}: ${p[key]}`);
    seen.add(`${key}:${p[key]}`);
  }
  if (!categoryByName.has(p.category))
    fail(`product ${p.slug} has unknown category name: ${p.category}`);
  if (!Array.isArray(p.images) || p.images.length === 0)
    fail(`product ${p.slug} has no images`);
  for (const img of p.images) {
    imageCount++;
    if (
      typeof img.url !== "string" ||
      !img.url.startsWith("https://res.cloudinary.com/dmwgexmef/image/upload/")
    )
      fail(`product ${p.slug} has a non-Cloudinary image URL: ${img.url}`);
    if (img.url.includes("/uploads/"))
      fail(`product ${p.slug} has a legacy /uploads image URL: ${img.url}`);
  }
}
if (imageCount !== 29)
  fail(`expected 29 product images, found ${imageCount}`);

// --- SQL generation ---
const esc = (v) =>
  v === null || v === undefined
    ? "NULL"
    : typeof v === "boolean"
      ? v
        ? "1"
        : "0"
      : typeof v === "number"
        ? String(v)
        : `'${String(v).replace(/'/g, "''")}'`;

const out = [
  "-- Live catalogue import for D1 — generated from the live Render API backup.",
  `-- Source: ${backupDir}/products-all.json (+ categories.json, settings.json)`,
  `-- Generated: ${new Date().toISOString()}`,
  "-- Apply ONLY to an empty D1 after the migrations (CUTOVER.md step 2).",
  "-- Do not re-run on a live D1: ids/slugs/skus are UNIQUE and the file is not idempotent.",
  `-- Counts: ${products.length} products, ${imageCount} images, ${categories.length} categories, 1 settings row.`,
  "",
];

const settingsCols = [
  "id",
  "name",
  "email",
  "phone",
  "instagram",
  "shipping",
  "codEnabled",
  "announcement",
];
out.push(
  `INSERT INTO "StoreSettings" (${settingsCols.map((c) => `"${c}"`).join(",")}) VALUES (${settingsCols.map((c) => esc(settings[c])).join(",")});`,
);
for (const c of categories) {
  out.push(
    `INSERT INTO "Category" ("id","name","slug") VALUES (${esc(c.id)},${esc(c.name)},${esc(c.slug)});`,
  );
}
const productCols = [
  "id",
  "slug",
  "sku",
  "title",
  "description",
  "price",
  "stock",
  "pattern",
  "color",
  "condition",
  "conditionNote",
  "flaws",
  "length",
  "width",
  "material",
  "era",
  "category",
  "featured",
  "archived",
  "createdAt",
  "updatedAt",
];
for (const p of products) {
  out.push(
    `INSERT INTO "Product" (${productCols.map((c) => `"${c}"`).join(",")}) VALUES (${productCols.map((c) => esc(p[c])).join(",")});`,
  );
  for (const img of p.images) {
    out.push(
      `INSERT INTO "ProductImage" ("id","productId","url","alt","position") VALUES (${esc(img.id)},${esc(img.productId)},${esc(img.url)},${esc(img.alt)},${esc(img.position)});`,
    );
  }
  out.push(
    `INSERT INTO "ProductCategory" ("productId","categoryId") VALUES (${esc(p.id)},${esc(categoryByName.get(p.category))});`,
  );
}
out.push(
  `-- Product: ${products.length} rows`,
  `-- ProductImage: ${imageCount} rows`,
  `-- ProductCategory: ${products.length} rows`,
  `-- Category: ${categories.length} rows`,
  `-- StoreSettings: 1 row`,
);

writeFileSync(outFile, out.join("\n") + "\n");
const prices = new Set(products.map((p) => p.price));
const stocks = new Set(products.map((p) => p.stock));
console.log(
  `Wrote ${outFile}: ${products.length} products, ${imageCount} images, ` +
    `${categories.length} categories, 1 settings row. ` +
    `Prices: ${[...prices].join(",")} — Stocks: ${[...stocks].join(",")} — ` +
    `all images Cloudinary (dmwgexmef), all categories resolved.`,
);
