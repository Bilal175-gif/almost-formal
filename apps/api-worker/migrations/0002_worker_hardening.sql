ALTER TABLE "Order"
ADD COLUMN "statusChangeId" TEXT NOT NULL DEFAULT '';

CREATE INDEX "RateLimit_expiresAt_idx" ON "RateLimit" ("expiresAt");
