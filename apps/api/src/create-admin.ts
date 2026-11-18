import { hashPassword } from "./auth.js";
import { z } from "zod";
import { db } from "./db.js";

// One-time admin creation against the local Node/SQLite database
// (local dev only). For D1 use scripts/admin-reset-d1.ts instead —
// it writes the same PBKDF2 hash format via the D1 binding.
// Passwords are hashed with PBKDF2 (auth.ts); argon2 hashes from the
// old script cannot be verified by the Worker and must be reset.
const email = z.email().parse(process.env.ADMIN_EMAIL);
const password = z.string().min(8).parse(process.env.ADMIN_PASSWORD);
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
console.log("Administrator account created/updated.");
await db.$disconnect();
