import { getPlatformProxy } from "wrangler";
import { readFile } from "node:fs/promises";

// D1's exec() does not accept a whole migration file at once (it
// chokes on the `-- CreateTable` comment lines), so split the file
// into single statements and run them as one batch.
async function applyMigrationSql(d1, sql) {
  const statements = sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  await d1.batch(statements.map((s) => d1.prepare(s)));
}

const { env, dispose } = await getPlatformProxy({
  configPath: "apps/api/wrangler.toml",
  persist: false,
});
try {
  // Apply migrations to the fresh in-memory D1.
  for (const file of [
    "apps/api/prisma/migrations/20261014214532_init/migration.sql",
    "apps/api/prisma/migrations/20261109150000_update_announcement/migration.sql",
  ]) {
    await applyMigrationSql(env.DB, await readFile(file, "utf8"));
  }
  console.log("migrations applied");

  // Batch atomicity: second statement violates the PK.
  await env.DB.exec(
    `CREATE TABLE _smoke (id TEXT PRIMARY KEY, v INTEGER)`,
  );
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO _smoke (id, v) VALUES (?, ?)`).bind("a", 1),
      env.DB.prepare(`INSERT INTO _smoke (id, v) VALUES (?, ?)`).bind("a", 2),
    ]);
    console.log("batch did NOT throw");
  } catch (e) {
    console.log("batch threw:", String(e).slice(0, 160));
  }
  const rows = await env.DB.prepare(`SELECT * FROM _smoke`).all();
  console.log("rows after failed batch:", JSON.stringify(rows.results));

  // Prisma client over the D1 binding.
  const { createDb } = await import("../apps/api/src/db-d1.ts");
  const db = createDb(env.DB);
  await db.storeSettings.create({ data: { id: "store" } });
  const settings = await db.storeSettings.findUnique({
    where: { id: "store" },
  });
  console.log("prisma settings row:", JSON.stringify(settings));
  const cat = await db.category.create({
    data: { name: "Regular Ties", slug: "regular-ties" },
  });
  console.log("prisma category id:", cat.id);
} finally {
  await dispose();
}
