-- Suporta instalações novas e estruturas desta versão já criadas por db push.
-- O bloco é atômico: uma falha não deixa esta migração aplicada pela metade.
BEGIN;

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "isCombo" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "ComboItem" (
    "comboId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "sizeId" TEXT,
    CONSTRAINT "ComboItem_pkey" PRIMARY KEY ("comboId", "productId")
);

-- A primeira implementação de combos ainda não possuía tamanho por componente.
ALTER TABLE "ComboItem" ADD COLUMN IF NOT EXISTS "sizeId" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "comboItems" JSONB;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "stockSnapshot" JSONB;

CREATE INDEX IF NOT EXISTS "ComboItem_productId_idx" ON "ComboItem"("productId");
CREATE INDEX IF NOT EXISTS "ComboItem_sizeId_idx" ON "ComboItem"("sizeId");
CREATE INDEX IF NOT EXISTS "ComboItem_comboId_sortOrder_idx" ON "ComboItem"("comboId", "sortOrder");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComboItem_comboId_fkey' AND conrelid = '"ComboItem"'::regclass) THEN
    ALTER TABLE "ComboItem" ADD CONSTRAINT "ComboItem_comboId_fkey"
      FOREIGN KEY ("comboId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComboItem_productId_fkey' AND conrelid = '"ComboItem"'::regclass) THEN
    ALTER TABLE "ComboItem" ADD CONSTRAINT "ComboItem_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComboItem_sizeId_fkey' AND conrelid = '"ComboItem"'::regclass) THEN
    ALTER TABLE "ComboItem" ADD CONSTRAINT "ComboItem_sizeId_fkey"
      FOREIGN KEY ("sizeId") REFERENCES "PizzaSize"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComboItem_quantity_check' AND conrelid = '"ComboItem"'::regclass) THEN
    ALTER TABLE "ComboItem" ADD CONSTRAINT "ComboItem_quantity_check" CHECK ("quantity" BETWEEN 1 AND 20);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComboItem_not_self_check' AND conrelid = '"ComboItem"'::regclass) THEN
    ALTER TABLE "ComboItem" ADD CONSTRAINT "ComboItem_not_self_check" CHECK ("comboId" <> "productId");
  END IF;
END $$;

ALTER TABLE "BusinessSettings"
  ALTER COLUMN "deliveryPricingMode" SET DEFAULT 'AREA',
  ALTER COLUMN "deliveryPricePerKm" SET DEFAULT 1.00,
  ALTER COLUMN "deliveryMinimumKm" SET DEFAULT 10.00,
  ALTER COLUMN "deliveryMinimumFee" SET DEFAULT 4.00;

COMMIT;
