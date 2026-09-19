-- Ajustes aditivos de identidade e configuração dos combos solicitados.
-- As colunas antigas de aniversário/indicação são preservadas para manter
-- compatibilidade com pedidos e transações históricas.
BEGIN;

ALTER TABLE "BusinessSettings"
ADD COLUMN IF NOT EXISTS "facebookName" TEXT;

UPDATE "BusinessSettings"
SET
  "birthdayCampaignEnabled" = false,
  "referralEnabled" = false,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "birthdayCampaignEnabled" = true OR "referralEnabled" = true;

-- O Combo Master passa a ter uma pizza configurável e mantém Guaraná e
-- Brownie como produtos fixos. ComboItem permanece intacto como histórico.
DELETE FROM "ComboSlot"
WHERE "comboId" IN (
  SELECT "id" FROM "Product" WHERE "slug" = 'combo-master'
)
AND EXISTS (SELECT 1 FROM "Product" WHERE "slug" = 'calabresa')
AND EXISTS (SELECT 1 FROM "PizzaSize" WHERE "slug" = 'media')
AND EXISTS (SELECT 1 FROM "Product" WHERE "slug" = 'guarana-2l')
AND EXISTS (SELECT 1 FROM "Product" WHERE "slug" = 'brownie-master');

INSERT INTO "ComboSlot" (
  "id", "comboId", "type", "name", "quantity", "sortOrder",
  "baseProductId", "sizeId", "flavorScope", "maxFlavors",
  "allowModifiers", "modifierPricingMode", "createdAt", "updatedAt"
)
SELECT
  'cs_' || md5(combo."id" || ':pizza-configuravel'),
  combo."id", 'CONFIGURABLE_PIZZA', 'Escolha sua pizza', 1, 0,
  pizza."id", size."id", 'ALL', size."maxFlavors", true, 'NORMAL',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Product" combo
JOIN "Product" pizza ON pizza."slug" = 'calabresa'
JOIN "PizzaSize" size ON size."slug" = 'media'
WHERE combo."slug" = 'combo-master';

INSERT INTO "ComboSlot" (
  "id", "comboId", "type", "name", "quantity", "sortOrder",
  "flavorScope", "allowModifiers", "modifierPricingMode",
  "createdAt", "updatedAt"
)
SELECT
  'cs_' || md5(combo."id" || ':' || component."slug"),
  combo."id", 'FIXED_PRODUCT', component."name", 1,
  CASE component."slug" WHEN 'guarana-2l' THEN 1 ELSE 2 END,
  'ALL', false, 'NORMAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Product" combo
JOIN "Product" component
  ON component."slug" IN ('guarana-2l', 'brownie-master')
WHERE combo."slug" = 'combo-master';

INSERT INTO "ComboSlotProduct" (
  "id", "slotId", "productId", "sizeId", "priceAdjustment", "sortOrder"
)
SELECT
  'csp_' || md5(combo."id" || ':' || component."slug"),
  'cs_' || md5(combo."id" || ':' || component."slug"),
  component."id", NULL, 0, 0
FROM "Product" combo
JOIN "Product" component
  ON component."slug" IN ('guarana-2l', 'brownie-master')
WHERE combo."slug" = 'combo-master';

-- Novo combo: pizza configurável, Brownie fixo e escolha entre refrigerantes.
INSERT INTO "Product" (
  "id", "name", "slug", "description", "price", "image", "badge",
  "available", "sortOrder", "isCombo", "categoryId", "createdAt", "updatedAt"
)
SELECT
  'combo_' || md5('combo-escolha-master'),
  'Combo Escolha Master',
  'combo-escolha-master',
  'Monte sua pizza, leve um Brownie Master e escolha o refrigerante do combo.',
  69.90,
  '/images/products/combo-calabresa-guarana-brownie.webp',
  'Combo configurável',
  true,
  12,
  true,
  category."id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Category" category
WHERE category."slug" = 'combos'
  AND EXISTS (SELECT 1 FROM "Product" WHERE "slug" = 'calabresa')
  AND EXISTS (SELECT 1 FROM "PizzaSize" WHERE "slug" = 'media')
  AND EXISTS (SELECT 1 FROM "Product" WHERE "slug" = 'brownie-master')
  AND EXISTS (SELECT 1 FROM "Product" WHERE "slug" IN ('guarana-2l', 'pepsi-2l', 'coca-cola-2l'))
ON CONFLICT ("slug") DO UPDATE
SET
  "isCombo" = true,
  "categoryId" = EXCLUDED."categoryId",
  "subcategoryId" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP;

DELETE FROM "ComboSlot"
WHERE "comboId" IN (
  SELECT "id" FROM "Product" WHERE "slug" = 'combo-escolha-master'
)
AND EXISTS (SELECT 1 FROM "Product" WHERE "slug" = 'calabresa')
AND EXISTS (SELECT 1 FROM "PizzaSize" WHERE "slug" = 'media')
AND EXISTS (SELECT 1 FROM "Product" WHERE "slug" = 'brownie-master')
AND EXISTS (SELECT 1 FROM "Product" WHERE "slug" IN ('guarana-2l', 'pepsi-2l', 'coca-cola-2l'));

INSERT INTO "ComboSlot" (
  "id", "comboId", "type", "name", "quantity", "sortOrder",
  "baseProductId", "sizeId", "flavorScope", "maxFlavors",
  "allowModifiers", "modifierPricingMode", "createdAt", "updatedAt"
)
SELECT
  'cs_' || md5(combo."id" || ':pizza-configuravel'),
  combo."id", 'CONFIGURABLE_PIZZA', 'Escolha sua pizza', 1, 0,
  pizza."id", size."id", 'ALL', size."maxFlavors", true, 'NORMAL',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Product" combo
JOIN "Product" pizza ON pizza."slug" = 'calabresa'
JOIN "PizzaSize" size ON size."slug" = 'media'
WHERE combo."slug" = 'combo-escolha-master';

INSERT INTO "ComboSlot" (
  "id", "comboId", "type", "name", "quantity", "sortOrder",
  "flavorScope", "allowModifiers", "modifierPricingMode",
  "createdAt", "updatedAt"
)
SELECT
  'cs_' || md5(combo."id" || ':brownie-fixo'),
  combo."id", 'FIXED_PRODUCT', 'Brownie Master', 1, 1,
  'ALL', false, 'NORMAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Product" combo
WHERE combo."slug" = 'combo-escolha-master';

INSERT INTO "ComboSlotProduct" (
  "id", "slotId", "productId", "sizeId", "priceAdjustment", "sortOrder"
)
SELECT
  'csp_' || md5(combo."id" || ':brownie-fixo'),
  'cs_' || md5(combo."id" || ':brownie-fixo'),
  brownie."id", NULL, 0, 0
FROM "Product" combo
JOIN "Product" brownie ON brownie."slug" = 'brownie-master'
WHERE combo."slug" = 'combo-escolha-master';

INSERT INTO "ComboSlot" (
  "id", "comboId", "type", "name", "quantity", "sortOrder",
  "flavorScope", "allowModifiers", "modifierPricingMode",
  "createdAt", "updatedAt"
)
SELECT
  'cs_' || md5(combo."id" || ':refrigerante-escolha'),
  combo."id", 'PRODUCT_CHOICE', 'Escolha seu refrigerante', 1, 2,
  'ALL', false, 'NORMAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Product" combo
WHERE combo."slug" = 'combo-escolha-master';

INSERT INTO "ComboSlotProduct" (
  "id", "slotId", "productId", "sizeId", "priceAdjustment", "sortOrder"
)
SELECT
  'csp_' || md5(combo."id" || ':refrigerante:' || drink."slug"),
  'cs_' || md5(combo."id" || ':refrigerante-escolha'),
  drink."id", NULL,
  CASE drink."slug" WHEN 'coca-cola-2l' THEN 2 ELSE 0 END,
  CASE drink."slug"
    WHEN 'guarana-2l' THEN 0
    WHEN 'pepsi-2l' THEN 1
    ELSE 2
  END
FROM "Product" combo
JOIN "Product" drink
  ON drink."slug" IN ('guarana-2l', 'pepsi-2l', 'coca-cola-2l')
WHERE combo."slug" = 'combo-escolha-master';

COMMIT;
