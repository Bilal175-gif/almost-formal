import { hash } from "argon2";
import { z } from "zod";
import { db } from "./db.js";
const email = z.email().parse(process.env.ADMIN_EMAIL);
const password = z.string().min(14).parse(process.env.ADMIN_PASSWORD);
const passwordHash = await hash(password);
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
