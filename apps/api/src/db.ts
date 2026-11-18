import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { databaseUrl } from "./runtime.js";
process.env.DATABASE_URL = databaseUrl();
export const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
