ALTER TABLE "Product" ADD COLUMN "discountPercent" INTEGER NOT NULL DEFAULT 0;
DROP TRIGGER "OrderItem_reserve_stock";
CREATE TRIGGER "OrderItem_reserve_stock" BEFORE INSERT ON "OrderItem"
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM "Product"
    WHERE "id" = NEW."productId"
      AND "archived" = 0
      AND "stock" >= NEW."quantity"
      AND CAST(ROUND("price" * (100 - "discountPercent") / 100.0) AS INTEGER) = NEW."price"
  ) THEN RAISE(ABORT, 'Product unavailable or price changed') END;
  UPDATE "Product" SET "stock" = "stock" - NEW."quantity"
  WHERE "id" = NEW."productId";
END;
