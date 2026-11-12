import { hash } from "argon2";
import { z } from "zod";
import { db } from "./db.js";
import { validateHostedEnvironment } from "./runtime.js";

try {
  validateHostedEnvironment();
  // Idempotent setup: no demo products and no reset of existing settings/stock.
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
  if (!(await db.admin.count())) {
    const email = z.email().parse(process.env.ADMIN_EMAIL);
    const password = z
      .string()
      .min(12)
      .max(256)
      .parse(process.env.ADMIN_PASSWORD);
    const passwordHash = await hash(password);
    await db.user.upsert({
      where: { email },
      create: {
        email,
        name: "Store administrator",
        passwordHash,
        admin: { create: {} },
      },
      update: { passwordHash, admin: { create: {} } },
    });
    console.log(
      "Initial administrator created. Remove ADMIN_PASSWORD from Render after the first deploy.",
    );
  }
  await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  process.env.HOST = "0.0.0.0";
  process.env.STORAGE_MODE = "cloudinary";
  await import("./server.js");
} catch {
  // Do not serialize Prisma or validation errors containing private values.
  console.error(
    "Render startup failed. Check PostgreSQL connectivity, APP_ORIGIN, Cloudinary credentials and initial ADMIN_EMAIL/ADMIN_PASSWORD (12+ characters).",
  );
  await db.$disconnect();
  process.exitCode = 1;
}
