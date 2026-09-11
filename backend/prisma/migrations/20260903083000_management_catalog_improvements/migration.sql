ALTER TABLE "BusinessSettings"
  ADD COLUMN IF NOT EXISTS "whatsappSecondaryVisible" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "customerDailyOrderLimit" INTEGER NOT NULL DEFAULT 5;

UPDATE "BusinessSettings"
SET "whatsappSecondary" = '+5579988725557'
WHERE "id" = 'default' AND COALESCE("whatsappSecondary", '') = '';

ALTER TABLE "Coupon"
  ADD COLUMN IF NOT EXISTS "allowGuest" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "BusinessGoal"
  ADD COLUMN IF NOT EXISTS "metric" TEXT NOT NULL DEFAULT 'REVENUE';

ALTER TABLE "BusinessGoal" ALTER COLUMN "period" SET DEFAULT 'CUSTOM';
