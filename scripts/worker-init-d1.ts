// One-time D1 initialisation (local or remote) — the Worker
// equivalent of the old Render start-render.ts store setup.
//
// Idempotent: ensures the single StoreSettings row and the five
// default categories exist. Creates NO demo products, resets NO
// existing settings/stock/passwords, and creates NO admin — the
// admin is created/reset separately with scripts/admin-reset-d1.ts
// (PBKDF2; argon2 hashes from Render cannot be verified here).
//
// Usage (local D1):
//   npx tsx scripts/worker-init-d1.ts
// Usage (remote D1, after `wrangler login`):
//   npx tsx scripts/worker-init-d1.ts --remote
import { createDb } from "../apps/api/src/db-d1.ts";
import { getPlatformProxy } from "wrangler";

const remote = process.argv.includes("--remote");

const { env, dispose } = await getPlatformProxy({
  configPath: "apps/api/wrangler.toml",
  // Local mode persists to .wrangler/state under the current working
  // directory, so it is shared across proxy-based script runs — but
  // NOT with `wrangler dev --local` (which keeps its own state under
  // apps/api/.wrangler). To seed the dev server's D1, use
  // `wrangler d1 execute --local` from apps/api instead.
  persist: remote ? false : true,
  environment: remote ? "production" : undefined,
});
try {
  const db = createDb(env.DB);
  await db.storeSettings.upsert({
    where: { id: "store" },
    create: { id: "store" },
    update: {},
  });
  for (const name of [
    "Regular Ties",
    "Bow Ties",
    "Pocket Squares",
    "Cufflinks",
    "Tie Bars",
  ])
    await db.category.upsert({
      where: { name },
      create: { name, slug: name.toLowerCase().replaceAll(" ", "-") },
      update: {},
    });
  await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  console.log(
    `D1 initialised (${remote ? "remote" : "local"}): store settings + 5 categories present.`,
  );
} finally {
  await dispose();
}
