#!/usr/bin/env bash
# Export live Neon (PostgreSQL) data to CSV for the D1 migration.
#
# RUN THIS ONLY FROM A MACHINE WITH THE NEON DATABASE_URL — the URL is
# NEVER committed and NEVER pasted in chat. Supply it via the secure
# vault / environment only:
#   export DATABASE_URL='postgresql://...neon.tech/neondb?sslmode=require'
#   ./scripts/migrate-neon-to-d1/01-export.sh ./neon-export
#
# Output: one CSV per table (with header row) in the given directory.
# Tables are exported in dependency order; 02-convert.mjs keeps that
# order when generating D1 INSERTs. Sessions are NOT exported (they
# expire in 8h and their tokens are argon2-era anyway — admins sign
# in again after cutover). Cart/Wishlist rows are exported as-is.
set -euo pipefail
OUT="${1:-./neon-export}"
: "${DATABASE_URL:?DATABASE_URL (Neon connection string) is required}"
mkdir -p "$OUT"

# table -> column list (must match the Prisma schema column order used
# by 02-convert.mjs; keep both files in sync)
declare -A TABLES=(
  [StoreSettings]="id,name,email,phone,instagram,shipping,codEnabled,announcement"
  [User]="id,email,name,passwordHash,createdAt"
  [Admin]="id,userId,role"
  [Category]="id,name,slug"
  [Product]="id,slug,sku,title,description,price,stock,pattern,color,condition,conditionNote,flaws,length,width,material,era,category,featured,archived,createdAt,updatedAt"
  [ProductImage]="id,productId,url,alt,position"
  [ProductCategory]="productId,categoryId"
  [Address]="id,userId,name,email,phone,line1,city,state,postalCode"
  [Cart]="id,userId,updatedAt"
  [CartItem]="cartId,productId,quantity"
  [Wishlist]="id,userId"
  [WishlistItem]="wishlistId,productId"
  ["Order"]="id,number,idempotencyKey,requestHash,accessToken,userId,addressId,status,subtotal,shipping,total,note,createdAt,updatedAt"
  [OrderItem]="id,orderId,productId,title,sku,price,image,quantity"
  [Payment]="id,orderId,method,status,amount"
  [Shipment]="id,orderId,carrier,trackingNumber"
  [InventoryMovement]="id,productId,delta,reason,orderId,createdAt"
  [AuditLog]="id,adminId,action,target,createdAt"
  [Subscriber]="id,email,createdAt"
  [ContactMessage]="id,name,email,message,createdAt"
)
ORDER="StoreSettings User Admin Category Product ProductImage ProductCategory Address Cart CartItem Wishlist WishlistItem Order OrderItem Payment Shipment InventoryMovement AuditLog Subscriber ContactMessage"

for table in $ORDER; do
  cols="${TABLES[$table]}"
  echo "Exporting $table ..."
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
    "\COPY (SELECT $cols FROM \"$table\") TO STDOUT WITH (FORMAT csv, HEADER true)" \
    > "$OUT/$table.csv"
  echo "  $table: $(($(wc -l < "$OUT/$table.csv") - 1)) rows"
done
echo "Done. CSVs in $OUT — now run 02-convert.mjs, then review the SQL before applying it to D1."
