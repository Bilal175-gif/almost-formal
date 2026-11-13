import { spawnSync } from "node:child_process";
import { migrationDatabaseUrl } from "./migration-database-url.mjs";

const url = migrationDatabaseUrl(process.env.DATABASE_URL, process.env.DIRECT_URL);
const result = spawnSync(
  "prisma",
  ["migrate", "deploy", "--schema", "apps/api/prisma-postgres/schema.prisma"],
  {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  },
);
if (result.error) throw new Error("Could not start Prisma migration command.");
process.exitCode = result.status ?? 1;
