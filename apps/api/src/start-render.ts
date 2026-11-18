import { hash } from "argon2";
import { db } from "./db.js";
import {
  validateHostedEnvironment,
  initialAdminCredentials,
  startupErrorMessage,
} from "./runtime.js";

let stage = "environment validation";
try {
  validateHostedEnvironment();
  stage = "store initialization";
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
    stage = "initial administrator creation";
    const { email, password } = initialAdminCredentials();
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
  stage = "expired session cleanup";
  await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  process.env.HOST = "0.0.0.0";
  process.env.STORAGE_MODE = "cloudinary";
  stage = "HTTP server loading";
  await import("./server.js");
} catch (error) {
  // Do not serialize Prisma or validation errors containing private values.
  console.error(startupErrorMessage(error, stage));
  await db.$disconnect();
  process.exitCode = 1;
}
