// Generates apps/api/seed.sql — the same catalogue as apps/api/prisma/seed.ts
// (8 demo ties + 14 Instagram listings + 5 categories + store settings)
// as plain INSERTs, so it can be applied to the *wrangler dev* local D1
// with:  npx wrangler d1 execute almost-formal --local --file=apps/api/seed.sql
// (run from apps/api). The getPlatformProxy D1 is a different database
// from the dev server's local D1, so Prisma-based seeding cannot reach it.
// Re-running is idempotent (INSERT OR REPLACE on the unique keys).
// Usage: node scripts/seed-sql.mjs
import { writeFileSync } from "node:fs";

const now = new Date().toISOString();
const esc = (s) => String(s).replaceAll("'", "''");

const categories = ["Regular Ties", "Bow Ties", "Pocket Squares", "Cufflinks", "Tie Bars"];
const products = [
  ["Blue Polka Vintage Tie", 990, "Floral", "Blue", "Good", 0, "Regular Ties"],
  ["Forest Club Tie", 1290, "Striped", "Green", "Good", 1, "Regular Ties"],
  ["Patchwork Paisley Tie", 1490, "Paisley", "Multicolor", "Excellent", 2, "Regular Ties"],
  ["Red Heritage Tie", 1180, "Geometric", "Red", "Good", 3, "Regular Ties"],
  ["Brown Classic Tie", 1090, "Striped", "Brown", "Worn (character)", 4, "Regular Ties"],
  ["Mustard Statement", 1090, "Floral", "Yellow", "Good", 5, "Regular Ties"],
  ["Vintage Bow Tie", 790, "Solid", "Red", "Excellent", 6, "Bow Ties"],
  ["Navy Geometric Tie", 1390, "Geometric", "Blue", "Good", 7, "Regular Ties"],
];
const instagramProducts = [
  ["DejwEjhiG6b", "Retro Line", "Brown tie with subtle fine-line detailing and a vintage feel.", 1190, "Striped", "Brown", false],
  ["DejqQAkCBtD", "Looney Love", "Cartoon tie featuring Looney Tunes characters in a love-themed design.", 1490, "Graphic", "Multicolor", false],
  ["Dejp15XCKJo", "Tigger Tales", "Cartoon tie featuring Tigger from Winnie the Pooh.", 1390, "Graphic", "Multicolor", false],
  ["DejpiTiCMXB", "Molecular Retro", "Brown tie with molecule and chemistry-inspired sketches.", 1290, "Graphic", "Brown", false],
  ["Dejo7FDCMpL", "Crimson Forest", "Slim floral tie with leafy patterns and vintage forest tones.", 1390, "Floral", "Multicolor", false],
  ["DejokWiCOEU", "Pastel Reverie", "Slim floral tie with soft pastel tones.", 1190, "Floral", "Multicolor", true],
  ["DejoNKyiMc0", "Mickey’s Retro Garden", "Vintage tie featuring Mickey Mouse and sunflowers in earthy tones.", 1590, "Graphic", "Multicolor", false],
  ["Dejn8s-CNJ1", "Retro Bloom", "Retro floral tie with a vintage aesthetic.", 1250, "Floral", "Multicolor", true],
  ["DejnYpYCBFm", "The Old Money Check", "Brown and black mini-check tie with a classic vintage feel.", 1290, "Checked", "Brown", false],
  ["Dejm9HRiF5F", "The Royal Crest", "Metallic tie with a regal, sherwani-inspired design.", 1490, "Graphic", "Multicolor", false],
  ["DejmtULiOHh", "Silver Static", "Metallic grey tie with a sleek geometric pattern.", 1190, "Geometric", "Grey", false],
  ["DejmSg5iB8I", "The Dotted Affair", "Vintage tie with playful dotted patterns.", 1090, "Dotted", "Multicolor", false],
  ["Dejl8QVCEdX", "Autumn Reverie", "Autumn-inspired vintage tie.", 1190, "Graphic", "Multicolor", false],
  ["DejkDIIiE9s", "The Brown Bloom", "Brown floral vintage tie.", 1290, "Floral", "Brown", false],
];

const lines = [
  `-- Idempotent re-seed: remove prior seed rows (children first) then insert.`,
  `DELETE FROM "InventoryMovement" WHERE "id" LIKE 'seed-%';`,
  `DELETE FROM "ProductImage" WHERE "id" LIKE 'seed-%';`,
  `DELETE FROM "ProductCategory" WHERE "productId" LIKE 'seed-%';`,
  `DELETE FROM "Product" WHERE "id" LIKE 'seed-%';`,
  `DELETE FROM "Category" WHERE "id" LIKE 'seed-%';`,
  `DELETE FROM "StoreSettings" WHERE "id" = 'store';`,
];
const catId = (name) => `seed-cat-${name.toLowerCase().replaceAll(" ", "-")}`;
for (const name of categories) {
  lines.push(
    `INSERT INTO "Category" ("id", "name", "slug") VALUES ('${catId(name)}', '${esc(name)}', '${esc(name.toLowerCase().replaceAll(" ", "-"))}');`,
  );
}

function addProduct({ id, title, slug, sku, desc, price, stock, pattern, color, condition, conditionNote, flaws, length, width, category, featured, images, movementReason }) {
  lines.push(
    `INSERT INTO "Product" ("id", "slug", "sku", "title", "description", "price", "stock", "pattern", "color", "condition", "conditionNote", "flaws", "length", "width", "material", "era", "category", "featured", "archived", "createdAt", "updatedAt") VALUES ('${id}', '${esc(slug)}', '${esc(sku)}', '${esc(title)}', '${esc(desc)}', ${price}, ${stock}, '${esc(pattern)}', '${esc(color)}', '${esc(condition)}', '${esc(conditionNote)}', '${esc(flaws)}', ${length}, ${width}, NULL, NULL, '${esc(category)}', ${featured ? 1 : 0}, 0, '${now}', '${now}');`,
  );
  images.forEach((img, i) => {
    lines.push(
      `INSERT INTO "ProductImage" ("id", "productId", "url", "alt", "position") VALUES ('${id}-img-${i}', '${id}', '${esc(img.url)}', '${esc(img.alt)}', ${i});`,
    );
  });
  lines.push(
    `INSERT INTO "ProductCategory" ("productId", "categoryId") VALUES ('${id}', '${catId(category)}');`,
  );
  if (movementReason) {
    lines.push(
      `INSERT INTO "InventoryMovement" ("id", "productId", "delta", "reason", "orderId", "createdAt") VALUES ('${id}-mov', '${id}', 1, '${esc(movementReason)}', NULL, '${now}');`,
    );
  }
}

products.forEach(([title, rupees, pattern, color, condition, index], i) => {
  const slug = title.toLowerCase().replaceAll(" ", "-");
  const category = index === 6 ? "Bow Ties" : "Regular Ties";
  addProduct({
    id: `seed-prod-demo-${index + 1}`,
    title, slug, sku: `AF-DEMO-00${index + 1}`,
    desc: "A little history, a lot of character. A carefully chosen vintage piece, ready for its next story. Demo catalogue item; photography is generated.",
    price: rupees * 100, stock: 1, pattern, color, condition,
    conditionNote: condition === "Excellent" ? "Excellent vintage condition, with no notable wear." : condition === "Good" ? "Good vintage condition with minor signs of wear." : "Visible age and light wear add character.",
    flaws: condition === "Worn (character)" ? "Light surface wear; inspect before sale." : "No visible flaws in demo imagery; physical inspection required.",
    length: index === 6 ? 12 : 147, width: index === 6 ? 6 : 9,
    category, featured: true,
    images: [{ url: `/images/tie-${index}.webp`, alt: `${title} on crumpled vintage paper` }],
    movementReason: "Demo inventory seed",
  });
});

instagramProducts.forEach(([code, title, description, rupees, pattern, color, sold]) => {
  addProduct({
    id: `seed-prod-ig-${code.toLowerCase()}`,
    title, slug: `instagram-${code.toLowerCase()}`, sku: `AF-IG-${code}`,
    desc: `${description} Listed from @almost.formal. Website price is temporary; confirm details before ordering.`,
    price: rupees * 100, stock: sold ? 0 : 1, pattern, color,
    condition: "Unverified",
    conditionNote: "Instagram caption says quality 10/10; physical condition has not been independently checked.",
    flaws: "Please confirm any wear or flaws with the seller before ordering.",
    length: 0, width: 0, category: "Regular Ties", featured: !sold,
    images: [0, 1].map((p) => ({ url: `/images/instagram/${code}-${p}.webp`, alt: `${title}, photo ${p + 1} from Almost Formal Instagram` })),
    movementReason: sold ? null : "Instagram catalogue import",
  });
});

lines.push(
  `INSERT INTO "StoreSettings" ("id", "name", "email", "phone", "instagram", "shipping", "codEnabled", "announcement") VALUES ('store', 'almost formal', '', '', '', 25000, 1, 'ONE-OF-ONE FINDS. FRESH DROPS.');`,
);

writeFileSync("apps/api/seed.sql", lines.join("\n") + "\n");
console.log(`Wrote apps/api/seed.sql (${lines.length} statements: 5 categories, 22 products).`);
