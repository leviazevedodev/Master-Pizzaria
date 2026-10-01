-- Existing links retain their current price and availability behavior.
BEGIN;

ALTER TABLE "ProductFlavor"
  ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "priceMode" TEXT NOT NULL DEFAULT 'BASE_PRICE',
  ADD COLUMN "surcharge" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "ProductFlavor" ADD CONSTRAINT "ProductFlavor_priceMode_check"
  CHECK ("priceMode" IN ('BASE_PRICE', 'HIDDEN_PRICE', 'SURCHARGE'));
ALTER TABLE "ProductFlavor" ADD CONSTRAINT "ProductFlavor_surcharge_check"
  CHECK ("surcharge" >= 0);

ALTER TABLE "Order" ADD COLUMN "customerEmail" TEXT;
CREATE INDEX "Order_customerEmail_createdAt_idx" ON "Order"("customerEmail", "createdAt");

CREATE TABLE "GuestOrderVerification" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GuestOrderVerification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GuestOrderVerification_email_key" ON "GuestOrderVerification"("email");
CREATE INDEX "GuestOrderVerification_expiresAt_idx" ON "GuestOrderVerification"("expiresAt");

COMMIT;
