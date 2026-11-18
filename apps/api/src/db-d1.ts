import * as PrismaModule from "@prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";
import type { D1Database } from "@cloudflare/workers-types";

// The generated client is CJS with dynamic exports; a namespace import
// keeps the runtime binding (a named import is elided by per-file
// transforms that cannot see the export).
const { PrismaClient } = PrismaModule;

// Prisma client backed by the D1 binding. Construct one per request from
// c.env.DB — Workers have no persistent DATABASE_URL file and no
// long-lived connection to hold. The adapter executes queries through
// the D1 binding; no Prisma query engine binary is involved.
export function createDb(d1: D1Database): PrismaModule.PrismaClient {
  return new PrismaClient({ adapter: new PrismaD1(d1) });
}
