# Neon (PostgreSQL) -> D1 data migration

## Primary path (used): live backup JSON -> D1 SQL — no Neon needed
`03-json-to-d1.mjs` builds `d1-import-live-products.sql` from the
live Render API backup in
`~/workspace/almost-formal-live-backup-2026-11-19/` (catalogue only:
29 products, 29 images, 6 categories, 1 settings row — dry-run
verified, see CUTOVER.md step 3). **Use this path.** The CSV/Neon
path below is a fallback for a future full export (orders,
customers, movements) if order history ever needs to move too.

## Fallback path: Neon CSV export -> D1 SQL
D1 starts **empty**. The 29 live Neon products (and orders, customers,
settings) do NOT move automatically — this folder is the whole plan.
Nothing here has been run against live Neon: there are no Neon
credentials in this repo or on this machine.

## Steps (in order, all manual)

1. **Back up Neon first.** In the Neon dashboard (or `pg_dump`):
   `pg_dump "$DATABASE_URL" -F c -f neon-backup.dump`
   Keep the backup outside both providers.
2. **Export CSVs** (needs the Neon `DATABASE_URL`, pooled or direct,
   from the secure vault — never in chat/repo):
   ```bash
   export DATABASE_URL='postgresql://...@...neon.tech/neondb?sslmode=require'
   ./scripts/migrate-neon-to-d1/01-export.sh ./neon-export
   ```
   Sessions are deliberately NOT exported (8h expiry; admins sign in
   again after cutover with a reset PBKDF2 password).
3. **Convert to D1 SQL:**
   ```bash
   node scripts/migrate-neon-to-d1/02-convert.mjs ./neon-export ./d1-import.sql
   ```
   Review `d1-import.sql` (row counts per table are in the `--` comments).
4. **Dry run on LOCAL D1** (never remote first):
   ```bash
   wrangler d1 execute almost-formal-db --local --file=./d1-import.sql
   npm run test:d1   # suite runs against its own fresh local D1
   ```
5. **Apply migrations to REMOTE D1 first** (if not already done):
   ```bash
   wrangler d1 execute almost-formal-db --remote --file=apps/api/prisma/migrations/20261014214532_init/migration.sql
   wrangler d1 execute almost-formal-db --remote --file=apps/api/prisma/migrations/20261109150000_update_announcement/migration.sql
   ```
   (Split each migration file into single statements if D1 rejects the
   whole file — see `scripts/smoke-d1.mts` for the splitter.)
6. **Apply the import to REMOTE D1** (split into ≤90-statement chunks
   if D1 complains about batch size; keep chunk order):
   ```bash
   wrangler d1 execute almost-formal-db --remote --file=./d1-import.sql
   ```
7. **Verify counts** — compare each table against the export log:
   ```bash
   wrangler d1 execute almost-formal-db --remote --command="SELECT 'Product', COUNT(*) FROM \"Product\" UNION ALL SELECT 'Order', COUNT(*) FROM \"Order\" UNION ALL SELECT 'ProductImage', COUNT(*) FROM \"ProductImage\";"
   ```
   Expected (14 Nov live state): **29 products** (28 named ties + 1
   stray "Tie"), each with 1 image. If counts differ, STOP — do not
   cut over; re-export.
8. **Spot-check images:** every live product image URL must be a
   `res.cloudinary.com/dmwgexmef/...` URL (those survive the move) or
   `/images/...` (served by the web app itself). Any `/uploads/...`
   URL will 410 on the Worker — re-upload that image to Cloudinary
   and update the product before cutover. Count them first:
   ```sql
   -- in psql against Neon:
   SELECT url FROM "ProductImage" WHERE url LIKE '/uploads/%';
   ```
9. **Reset the admin password** on remote D1 (argon2 hashes from
   Render cannot be verified by the Worker):
   ```bash
   ADMIN_EMAIL=<admin email> ADMIN_PASSWORD='<new 12+ char password>' npx tsx scripts/admin-reset-d1.ts --remote
   ```
10. **Init store rows** (idempotent, no demo products):
    ```bash
    npx tsx scripts/worker-init-d1.ts --remote
    ```

Only after steps 5–10 verify green does the frontend re-point
(CUTOVER.md step 4). Render stays live until then.
