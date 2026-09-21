-- Opções aditivas da vitrine e preservação permanente das avaliações aprovadas.
BEGIN;

ALTER TABLE "BusinessSettings"
  ADD COLUMN IF NOT EXISTS "homeCatalogLayout" TEXT NOT NULL DEFAULT 'GRID',
  ADD COLUMN IF NOT EXISTS "deliveredOrdersCounterEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Review"
  DROP CONSTRAINT IF EXISTS "Review_orderId_fkey";

ALTER TABLE "Review"
  ALTER COLUMN "orderId" DROP NOT NULL;

ALTER TABLE "Review"
  ADD CONSTRAINT "Review_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
