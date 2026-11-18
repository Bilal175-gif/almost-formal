// One-time admin creation/reset against D1 (local or remote).
//
// Usage (local D1):
//   ADMIN_EMAIL=admin@example.test ADMIN_PASSWORD='<secret>' npx tsx scripts/admin-reset-d1.ts
// Usage (remote D1, after `wrangler login`):
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... npx tsx scripts/admin-reset-d1.ts --remote
//
// Creates the user if missing, otherwise resets the password and ensures
// an admin row exists. Passwords are PBKDF2 hashes (see apps/api/src/auth.ts);
// existing argon2 hashes cannot be verified by the Worker, which is why a
// reset is required at cutover.
import { hashPassword } from "../apps/api/src/auth.ts";
import { createDb } from "../apps/api/src/db-d1.ts";
import { getPlatformProxy } from "wrangler";
import { z } from "zod";

const email = z.email().parse(process.env.ADMIN_EMAIL);
const password = z.string().min(8).parse(process.env.ADMIN_PASSWORD);
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
  const passwordHash = await hashPassword(password);
  await db.user.upsert({
    where: { email },
    update: { passwordHash, admin: { upsert: { create: {}, update: {} } } },
    create: {
      name: "Store administrator",
      email,
      passwordHash,
      admin: { create: {} },
    },
  });
  console.log(`Administrator account created/updated for ${email}.`);
} finally {
  await dispose();
}
