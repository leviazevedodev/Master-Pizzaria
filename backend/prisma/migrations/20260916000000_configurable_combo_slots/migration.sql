-- Evolui ComboItem para slots configuráveis sem apagar a composição antiga.
-- Os registros legados são copiados como FIXED_PRODUCT e continuam legíveis.
BEGIN;

CREATE TABLE IF NOT EXISTS "ComboSlot" (
  "id" TEXT NOT NULL,
  "comboId" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'FIXED_PRODUCT',
  "name" TEXT NOT NULL DEFAULT '',
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "baseProductId" TEXT,
  "sizeId" TEXT,
  "flavorScope" TEXT NOT NULL DEFAULT 'ALL',
  "maxFlavors" INTEGER,
  "allowModifiers" BOOLEAN NOT NULL DEFAULT false,
  "modifierPricingMode" TEXT NOT NULL DEFAULT 'NORMAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ComboSlot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ComboSlotProduct" (
  "id" TEXT NOT NULL,
  "slotId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "sizeId" TEXT,
  "priceAdjustment" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ComboSlotProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ComboSlotFlavorGroupRule" (
  "slotId" TEXT NOT NULL,
  "flavorGroupId" TEXT NOT NULL,
  "pricingRule" TEXT NOT NULL DEFAULT 'INCLUDED',
  "amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  CONSTRAINT "ComboSlotFlavorGroupRule_pkey" PRIMARY KEY ("slotId", "flavorGroupId")
);

CREATE TABLE IF NOT EXISTS "ComboSlotFlavorRule" (
  "slotId" TEXT NOT NULL,
  "flavorId" TEXT NOT NULL,
  "pricingRule" TEXT NOT NULL DEFAULT 'INCLUDED',
  "amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  CONSTRAINT "ComboSlotFlavorRule_pkey" PRIMARY KEY ("slotId", "flavorId")
);

CREATE TABLE IF NOT EXISTS "ComboSlotModifierRule" (
  "slotId" TEXT NOT NULL,
  "optionId" TEXT NOT NULL,
  "pricingRule" TEXT NOT NULL DEFAULT 'NORMAL',
  "amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  CONSTRAINT "ComboSlotModifierRule_pkey" PRIMARY KEY ("slotId", "optionId")
);

-- Cada componente fixo da v2.28 vira um slot fixo equivalente. ComboItem não
-- é removido nesta atualização, permitindo rollback da aplicação sem perda.
INSERT INTO "ComboSlot" (
  "id", "comboId", "type", "name", "quantity", "sortOrder", "sizeId",
  "flavorScope", "allowModifiers", "modifierPricingMode", "createdAt", "updatedAt"
)
SELECT
  'cs_' || md5(item."comboId" || ':' || item."productId"),
  item."comboId",
  'FIXED_PRODUCT',
  product."name",
  item."quantity",
  item."sortOrder",
  item."sizeId",
  'ALL',
  false,
  'NORMAL',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "ComboItem" item
JOIN "Product" product ON product."id" = item."productId"
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "ComboSlotProduct" (
  "id", "slotId", "productId", "sizeId", "priceAdjustment", "sortOrder"
)
SELECT
  'csp_' || md5(item."comboId" || ':' || item."productId"),
  'cs_' || md5(item."comboId" || ':' || item."productId"),
  item."productId",
  item."sizeId",
  0,
  0
FROM "ComboItem" item
ON CONFLICT ("id") DO NOTHING;

CREATE INDEX IF NOT EXISTS "ComboSlot_comboId_sortOrder_idx" ON "ComboSlot"("comboId", "sortOrder");
CREATE INDEX IF NOT EXISTS "ComboSlot_baseProductId_idx" ON "ComboSlot"("baseProductId");
CREATE INDEX IF NOT EXISTS "ComboSlot_sizeId_idx" ON "ComboSlot"("sizeId");
CREATE INDEX IF NOT EXISTS "ComboSlotProduct_productId_idx" ON "ComboSlotProduct"("productId");
CREATE INDEX IF NOT EXISTS "ComboSlotProduct_sizeId_idx" ON "ComboSlotProduct"("sizeId");
CREATE INDEX IF NOT EXISTS "ComboSlotProduct_slotId_sortOrder_idx" ON "ComboSlotProduct"("slotId", "sortOrder");
CREATE INDEX IF NOT EXISTS "ComboSlotFlavorGroupRule_flavorGroupId_idx" ON "ComboSlotFlavorGroupRule"("flavorGroupId");
CREATE INDEX IF NOT EXISTS "ComboSlotFlavorRule_flavorId_idx" ON "ComboSlotFlavorRule"("flavorId");
CREATE INDEX IF NOT EXISTS "ComboSlotModifierRule_optionId_idx" ON "ComboSlotModifierRule"("optionId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComboSlot_comboId_fkey' AND conrelid = '"ComboSlot"'::regclass) THEN
    ALTER TABLE "ComboSlot" ADD CONSTRAINT "ComboSlot_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComboSlot_baseProductId_fkey' AND conrelid = '"ComboSlot"'::regclass) THEN
    ALTER TABLE "ComboSlot" ADD CONSTRAINT "ComboSlot_baseProductId_fkey" FOREIGN KEY ("baseProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComboSlot_sizeId_fkey' AND conrelid = '"ComboSlot"'::regclass) THEN
    ALTER TABLE "ComboSlot" ADD CONSTRAINT "ComboSlot_sizeId_fkey" FOREIGN KEY ("sizeId") REFERENCES "PizzaSize"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComboSlotProduct_slotId_fkey' AND conrelid = '"ComboSlotProduct"'::regclass) THEN
    ALTER TABLE "ComboSlotProduct" ADD CONSTRAINT "ComboSlotProduct_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "ComboSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComboSlotProduct_productId_fkey' AND conrelid = '"ComboSlotProduct"'::regclass) THEN
    ALTER TABLE "ComboSlotProduct" ADD CONSTRAINT "ComboSlotProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComboSlotProduct_sizeId_fkey' AND conrelid = '"ComboSlotProduct"'::regclass) THEN
    ALTER TABLE "ComboSlotProduct" ADD CONSTRAINT "ComboSlotProduct_sizeId_fkey" FOREIGN KEY ("sizeId") REFERENCES "PizzaSize"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComboSlotFlavorGroupRule_slotId_fkey' AND conrelid = '"ComboSlotFlavorGroupRule"'::regclass) THEN
    ALTER TABLE "ComboSlotFlavorGroupRule" ADD CONSTRAINT "ComboSlotFlavorGroupRule_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "ComboSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComboSlotFlavorGroupRule_flavorGroupId_fkey' AND conrelid = '"ComboSlotFlavorGroupRule"'::regclass) THEN
    ALTER TABLE "ComboSlotFlavorGroupRule" ADD CONSTRAINT "ComboSlotFlavorGroupRule_flavorGroupId_fkey" FOREIGN KEY ("flavorGroupId") REFERENCES "FlavorGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComboSlotFlavorRule_slotId_fkey' AND conrelid = '"ComboSlotFlavorRule"'::regclass) THEN
    ALTER TABLE "ComboSlotFlavorRule" ADD CONSTRAINT "ComboSlotFlavorRule_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "ComboSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComboSlotFlavorRule_flavorId_fkey' AND conrelid = '"ComboSlotFlavorRule"'::regclass) THEN
    ALTER TABLE "ComboSlotFlavorRule" ADD CONSTRAINT "ComboSlotFlavorRule_flavorId_fkey" FOREIGN KEY ("flavorId") REFERENCES "Flavor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComboSlotModifierRule_slotId_fkey' AND conrelid = '"ComboSlotModifierRule"'::regclass) THEN
    ALTER TABLE "ComboSlotModifierRule" ADD CONSTRAINT "ComboSlotModifierRule_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "ComboSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComboSlotModifierRule_optionId_fkey' AND conrelid = '"ComboSlotModifierRule"'::regclass) THEN
    ALTER TABLE "ComboSlotModifierRule" ADD CONSTRAINT "ComboSlotModifierRule_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "ModifierOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComboSlot_type_check' AND conrelid = '"ComboSlot"'::regclass) THEN
    ALTER TABLE "ComboSlot" ADD CONSTRAINT "ComboSlot_type_check" CHECK ("type" IN ('FIXED_PRODUCT', 'PRODUCT_CHOICE', 'CONFIGURABLE_PIZZA'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComboSlot_flavorScope_check' AND conrelid = '"ComboSlot"'::regclass) THEN
    ALTER TABLE "ComboSlot" ADD CONSTRAINT "ComboSlot_flavorScope_check" CHECK ("flavorScope" IN ('ALL', 'GROUPS', 'MANUAL'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComboSlot_quantity_check' AND conrelid = '"ComboSlot"'::regclass) THEN
    ALTER TABLE "ComboSlot" ADD CONSTRAINT "ComboSlot_quantity_check" CHECK ("quantity" BETWEEN 1 AND 20);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComboSlot_maxFlavors_check' AND conrelid = '"ComboSlot"'::regclass) THEN
    ALTER TABLE "ComboSlot" ADD CONSTRAINT "ComboSlot_maxFlavors_check" CHECK ("maxFlavors" IS NULL OR "maxFlavors" BETWEEN 1 AND 4);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComboSlot_modifierPricingMode_check' AND conrelid = '"ComboSlot"'::regclass) THEN
    ALTER TABLE "ComboSlot" ADD CONSTRAINT "ComboSlot_modifierPricingMode_check" CHECK ("modifierPricingMode" IN ('NORMAL', 'INCLUDED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComboSlotFlavorGroupRule_pricingRule_check' AND conrelid = '"ComboSlotFlavorGroupRule"'::regclass) THEN
    ALTER TABLE "ComboSlotFlavorGroupRule" ADD CONSTRAINT "ComboSlotFlavorGroupRule_pricingRule_check" CHECK ("pricingRule" IN ('INCLUDED', 'SURCHARGE', 'DISCOUNT', 'BLOCKED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComboSlotFlavorRule_pricingRule_check' AND conrelid = '"ComboSlotFlavorRule"'::regclass) THEN
    ALTER TABLE "ComboSlotFlavorRule" ADD CONSTRAINT "ComboSlotFlavorRule_pricingRule_check" CHECK ("pricingRule" IN ('INCLUDED', 'SURCHARGE', 'DISCOUNT', 'BLOCKED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComboSlotModifierRule_pricingRule_check' AND conrelid = '"ComboSlotModifierRule"'::regclass) THEN
    ALTER TABLE "ComboSlotModifierRule" ADD CONSTRAINT "ComboSlotModifierRule_pricingRule_check" CHECK ("pricingRule" IN ('NORMAL', 'INCLUDED', 'SURCHARGE', 'DISCOUNT', 'BLOCKED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComboSlotFlavorGroupRule_amount_check' AND conrelid = '"ComboSlotFlavorGroupRule"'::regclass) THEN
    ALTER TABLE "ComboSlotFlavorGroupRule" ADD CONSTRAINT "ComboSlotFlavorGroupRule_amount_check" CHECK ("amount" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComboSlotFlavorRule_amount_check' AND conrelid = '"ComboSlotFlavorRule"'::regclass) THEN
    ALTER TABLE "ComboSlotFlavorRule" ADD CONSTRAINT "ComboSlotFlavorRule_amount_check" CHECK ("amount" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComboSlotModifierRule_amount_check' AND conrelid = '"ComboSlotModifierRule"'::regclass) THEN
    ALTER TABLE "ComboSlotModifierRule" ADD CONSTRAINT "ComboSlotModifierRule_amount_check" CHECK ("amount" >= 0);
  END IF;
END $$;

COMMIT;
