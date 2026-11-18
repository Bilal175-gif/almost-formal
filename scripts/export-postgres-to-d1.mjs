import "dotenv/config";
import { writeFile } from "node:fs/promises";
import path from "node:path";
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

function sqlIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function sqlValue(value, table, column) {
  if (value === null) return "NULL";
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (Buffer.isBuffer(value)) return `X'${value.toString("hex")}'`;
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Unsupported number in ${table}.${column}.`);
    return String(value);
  }
  if (typeof value === "string") return `'${value.replaceAll("'", "''")}'`;
  throw new Error(`Unsupported PostgreSQL value in ${table}.${column}.`);
}

const sourceUrl = process.env.POSTGRES_SOURCE_URL || process.env.NEON_SOURCE_URL;
const outputPath = process.env.D1_MIGRATION_SQL_PATH;
if (!sourceUrl || !outputPath) {
  throw new Error(
    "Set POSTGRES_SOURCE_URL (or NEON_SOURCE_URL) to a read-only PostgreSQL connection and D1_MIGRATION_SQL_PATH to a new output file.",
  );
}
const url = new URL(sourceUrl);
if (!["postgres:", "postgresql:"].includes(url.protocol)) {
  throw new Error("POSTGRES_SOURCE_URL must use PostgreSQL.");
}

const output = path.resolve(outputPath);
const validationOutput = `${output}.validation.sql`;
const countsOutput = `${output}.counts.json`;
const client = new pg.Client({ connectionString: sourceUrl });
const migration = [
  "-- Exported from a read-only repeatable-read PostgreSQL snapshot.",
  "-- Import only into the dedicated, empty D1 database after reviewing the data.",
  'DROP TRIGGER IF EXISTS "OrderItem_reserve_stock";',
];
const counts = {};

try {
  await client.connect();
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  for (const table of tables) {
    const columnsResult = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position",
      [table],
    );
    const columns = columnsResult.rows.map((row) => row.column_name);
    if (!columns.length) throw new Error(`Required PostgreSQL table ${table} is missing.`);
    const rows = await client.query(`SELECT * FROM public.${sqlIdentifier(table)}`);
    counts[table] = rows.rowCount;
    if (table === "StoreSettings" && rows.rowCount === 0) {
      throw new Error("PostgreSQL StoreSettings is empty; refusing to omit required store settings.");
    }
    if (table === "StoreSettings") {
      migration.push('-- Replace the default row seeded by the D1 schema migration.', `DELETE FROM "StoreSettings" WHERE "id" = 'store';`);
    }
    if (rows.rows.length) {
      const columnList = columns.map(sqlIdentifier).join(", ");
      for (const row of rows.rows) {
        migration.push(
          `INSERT INTO ${sqlIdentifier(table)} (${columnList}) VALUES (${columns
            .map((column) => sqlValue(row[column], table, column))
            .join(", ")});`,
        );
      }
    }
  }
  await client.query("COMMIT");
  migration.push(
    "",
    "-- Restore checkout stock reservation after all historical order items are imported.",
    `CREATE TRIGGER "OrderItem_reserve_stock" BEFORE INSERT ON "OrderItem"
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM "Product"
    WHERE "id" = NEW."productId"
      AND "archived" = 0
      AND "stock" >= NEW."quantity"
      AND "price" = NEW."price"
  ) THEN RAISE(ABORT, 'Product unavailable or price changed') END;
  UPDATE "Product" SET "stock" = "stock" - NEW."quantity"
  WHERE "id" = NEW."productId";
END;`,
  );
  await writeFile(output, `${migration.join("\n")}\n`, { flag: "wx", mode: 0o600 });
  const countColumns = Object.entries(counts).flatMap(([table, count]) => [
    `(SELECT COUNT(*) FROM ${sqlIdentifier(table)}) AS ${sqlIdentifier(`${table}_actual`)}`,
    `${count} AS ${sqlIdentifier(`${table}_expected`)}`,
  ]);
  const validationSql = [
    "-- Compare expected source counts to counts in the imported D1 database.",
    `SELECT ${[
      ...countColumns,
      '(SELECT COUNT(*) FROM pragma_foreign_key_check) AS "foreign_key_violations"',
    ].join(",\n")};`,
  ].join("\n");
  await writeFile(
    validationOutput,
    `${validationSql}\n`,
    { flag: "wx", mode: 0o600 },
  );
  await writeFile(countsOutput, `${JSON.stringify(counts, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  console.log(`Wrote D1 import SQL: ${output}`);
  console.log(`Wrote count/FK validation SQL: ${validationOutput}`);
  console.log(`Wrote source row counts: ${countsOutput}`);
  console.log("No D1 database was accessed or changed.");
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  await client.end().catch(() => {});
}
