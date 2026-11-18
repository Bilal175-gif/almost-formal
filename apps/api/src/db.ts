import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { databaseUrl } from "./runtime.js";
if (process.env.VERCEL && !/^postgres(ql)?:/.test(process.env.DATABASE_URL || ""))
  throw new Error("Vercel API requires a persistent PostgreSQL DATABASE_URL.");
process.env.DATABASE_URL = databaseUrl();
export const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
