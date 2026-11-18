// Local D1 seed helper for `wrangler dev --local` verification ONLY.
// Seeds the PERSISTED local D1 (shared with `wrangler dev --local`)
// with migrations + settings + categories + 1 test product + 1 TEST
// admin. Test credentials only — never use these values live.
import { readFile } from "node:fs/promises";
import { getPlatformProxy } from "wrangler";

const { env, dispose } = await getPlatformProxy({
  configPath: "apps/api/wrangler.toml",
  persist: true,
});
try {
  for (const file of [
    "apps/api/prisma/migrations/20261014214532_init/migration.sql",
    "apps/api/prisma/migrations/20261109150000_update_announcement/migration.sql",
  ]) {
    const sql = await readFile(file, "utf8");
    const statements = sql
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    await env.DB.batch(statements.map((s) => env.DB.prepare(s)));
    console.log("applied", file);
  }
  const { createDb } = await import(
    "../apps/api/src/db-d1.ts"
  );
  const { hashPassword } = await import(
    "../apps/api/src/auth.ts"
  );
  const db = createDb(env.DB);
  await db.storeSettings.upsert({
    where: { id: "store" },
    create: { id: "store" },
    update: {},
  });
  for (const name of ["Regular Ties", "Bow Ties", "Pocket Squares", "Cufflinks", "Tie Bars"])
    await db.category.upsert({
      where: { name },
      create: { name, slug: name.toLowerCase().replaceAll(" ", "-") },
      update: {},
    });
  const password = "LocalTest-12345678";
  const passwordHash = await hashPassword(password);
  await db.user.upsert({
    where: { email: "admin@example.test" },
    update: { passwordHash, admin: { upsert: { create: {}, update: {} } } },
    create: {
      name: "Test Admin",
      email: "admin@example.test",
      passwordHash,
      admin: { create: {} },
    },
  });
  const slug = "local-test-tie";
  await db.product.upsert({
    where: { slug },
    update: { stock: 2 },
    create: {
      slug,
      sku: slug,
      title: "Local Test Tie",
      description: "A test tie for local Worker verification.",
      price: 120000,
      stock: 2,
      pattern: "Solid",
      color: "Blue",
      condition: "Good",
      conditionNote: "Minor wear",
      flaws: "None",
      length: 147,
      width: 9,
      category: "Regular Ties",
      featured: true,
      images: { create: { url: "/images/tie-1.webp", alt: "Local Test Tie" } },
    },
  });
  console.log("seed done: products=", await db.product.count(), "admin=admin@example.test / LocalTest-12345678 (TEST ONLY)");
} finally {
  await dispose();
}
