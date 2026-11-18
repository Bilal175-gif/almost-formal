import "dotenv/config";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const tables = [
  "User",
  "Product",
  "Category",
  "StoreSettings",
  "Subscriber",
  "ContactMessage",
  "Address",
  "Cart",
  "Wishlist",
  "Admin",
  "ProductImage",
  "ProductCategory",
  "CartItem",
  "WishlistItem",
  "InventoryMovement",
  "Order",
  "OrderItem",
  "Payment",
  "Shipment",
  "Session",
  "AuditLog",
];

const sourceUrl = process.env.POSTGRES_SOURCE_URL || process.env.NEON_SOURCE_URL;
if (!sourceUrl) throw new Error("Set POSTGRES_SOURCE_URL or NEON_SOURCE_URL.");

const workerDirectory = fileURLToPath(new URL("../apps/api-worker", import.meta.url));
const d1Name = process.env.D1_DATABASE_NAME || "almost-formal-db";
const d1Environment = process.env.D1_ENV || "production";

function executeD1(sql) {
  const result = spawnSync(
    "npx",
    ["wrangler", "d1", "execute", d1Name, "--remote", "--env", d1Environment, "--command", sql],
    { cwd: workerDirectory, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  );
  if (result.status !== 0) throw new Error("A read-only D1 query failed.");
  const jsonStart = result.stdout.lastIndexOf("\n[");
  if (jsonStart < 0) throw new Error("Wrangler returned no D1 query result.");
  const response = JSON.parse(result.stdout.slice(jsonStart + 1).trim());
  if (!Array.isArray(response) || response.length !== 1 || response[0].success !== true) {
    throw new Error("Wrangler returned an unsuccessful D1 query.");
  }
  return response[0].results || [];
}

function normalize(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return Number(value);
  if (Buffer.isBuffer(value)) return value.toString("hex");
  return value;
}

function canonicalRow(row, columns = Object.keys(row)) {
  return JSON.stringify(
    Object.fromEntries(columns.sort().map((column) => [column, normalize(row[column])])),
  );
}

const client = new pg.Client({ connectionString: sourceUrl, connectionTimeoutMillis: 10_000 });
let totalRows = 0;
const mismatches = [];

try {
  await client.connect();
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");

  for (const table of tables) {
    const source = await client.query(`SELECT * FROM public."${table}"`);
    const target = executeD1(`SELECT * FROM "${table}"`);
    totalRows += source.rows.length;

    if (source.rows.length !== target.length) {
      mismatches.push({ table, reason: "row-count" });
      continue;
    }

    if (!source.rows.length) continue;
    const columns = Object.keys(source.rows[0]);
    const expected = source.rows.map((row) => canonicalRow(row, [...columns])).sort();
    const actual = target.map((row) => canonicalRow(row, columns)).sort();
    if (expected.some((row, index) => row !== actual[index]))
      mismatches.push({ table, reason: "row-content" });
  }

  const foreignKeys = executeD1("SELECT * FROM pragma_foreign_key_check");
  if (foreignKeys.length) mismatches.push({ table: "foreign keys", reason: "constraint-check" });

  if (mismatches.length) {
    console.error(JSON.stringify({ tablesChecked: tables.length, sourceRows: totalRows, mismatches }));
    process.exitCode = 1;
  } else {
    console.log(
      `D1 row-level verification passed: ${tables.length} tables, ${totalRows} rows, and no foreign-key violations.`,
    );
  }

  await client.query("ROLLBACK");
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(`D1 row-level verification failed (${error.code || "verification-error"}).`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
