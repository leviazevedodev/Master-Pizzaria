-- Consolida decisões de catálogo sem apagar dados históricos.
BEGIN;

-- PROPORTIONAL e SUM sempre executaram a mesma média aritmética de AVERAGE.
UPDATE "Product"
SET "flavorPricingMode" = 'AVERAGE', "updatedAt" = CURRENT_TIMESTAMP
WHERE "flavorPricingMode" IN ('PROPORTIONAL', 'SUM');

-- O Combo Master pertence exclusivamente ao cadastro de combos.
UPDATE "Product" product
SET
  "isCombo" = true,
  "categoryId" = category."id",
  "subcategoryId" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
FROM "Category" category
WHERE product."slug" = 'combo-master'
  AND category."slug" = 'combos';

-- Recupera slots fixos caso uma instalação antiga tenha somente ComboItem.
INSERT INTO "ComboSlot" (
  "id", "comboId", "type", "name", "quantity", "sortOrder", "sizeId",
  "flavorScope", "allowModifiers", "modifierPricingMode", "createdAt", "updatedAt"
)
SELECT
  'cs_' || md5(item."comboId" || ':' || item."productId"),
  item."comboId", 'FIXED_PRODUCT', component."name", item."quantity",
  item."sortOrder", item."sizeId", 'ALL', false, 'NORMAL',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "ComboItem" item
JOIN "Product" component ON component."id" = item."productId"
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "ComboSlotProduct" (
  "id", "slotId", "productId", "sizeId", "priceAdjustment", "sortOrder"
)
SELECT
  'csp_' || md5(item."comboId" || ':' || item."productId"),
  'cs_' || md5(item."comboId" || ':' || item."productId"),
  item."productId", item."sizeId", 0, 0
FROM "ComboItem" item
ON CONFLICT ("id") DO NOTHING;

-- Um grupo automático por subcategoria para todo produto oficialmente marcado
-- como sabor. Produtos que apenas aceitam divisão não viram sabores.
INSERT INTO "FlavorGroup" (
  "id", "name", "slug", "description", "categoryId", "active", "sortOrder",
  "createdAt", "updatedAt"
)
SELECT DISTINCT ON (product."categoryId", COALESCE(subcategory."slug", 'sabores'))
  'fg_' || md5(product."categoryId" || ':' || COALESCE(subcategory."id", 'sem-subcategoria')),
  COALESCE(subcategory."name", 'Sabores'),
  COALESCE(subcategory."slug", 'sabores'),
  'Grupo mantido automaticamente a partir dos produtos.',
  product."categoryId", true, COALESCE(subcategory."sortOrder", 0),
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Product" product
LEFT JOIN "Subcategory" subcategory ON subcategory."id" = product."subcategoryId"
WHERE product."isFlavorOption" = true AND product."isCombo" = false
ORDER BY product."categoryId", COALESCE(subcategory."slug", 'sabores'), product."sortOrder", product."id"
ON CONFLICT ("categoryId", "slug") DO UPDATE
SET "active" = true, "updatedAt" = CURRENT_TIMESTAMP;

-- Cria o sabor central que ainda não existe, usando um sufixo estável apenas
-- quando nome ou slug já pertencem a outro sabor independente.
INSERT INTO "Flavor" (
  "id", "name", "slug", "description", "ingredients", "groupId",
  "sourceProductId", "price", "promoPrice", "promoActive", "promoStartAt",
  "promoEndAt", "image", "active", "featured", "allowHalfAndHalf",
  "sortOrder", "stockTracked", "stockQuantity", "stockLowThreshold",
  "createdAt", "updatedAt"
)
SELECT
  'fl_' || md5(product."id"),
  CASE
    WHEN EXISTS (
      SELECT 1 FROM "Flavor" named
      WHERE lower(btrim(named."name")) = lower(btrim(product."name"))
    ) THEN product."name" || ' · ' || substr(md5(product."id"), 1, 8)
    ELSE product."name"
  END,
  CASE
    WHEN EXISTS (SELECT 1 FROM "Flavor" slugged WHERE slugged."slug" = product."slug")
      THEN product."slug" || '-' || substr(md5(product."id"), 1, 8)
    ELSE product."slug"
  END,
  product."description", '[]'::jsonb, flavor_group."id", product."id",
  product."price", NULL, false, NULL, NULL, product."image",
  product."available" AND product."deletedAt" IS NULL,
  product."featured", true, product."sortOrder", product."stockTracked",
  product."stockQuantity", product."stockLowThreshold",
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Product" product
LEFT JOIN "Subcategory" subcategory ON subcategory."id" = product."subcategoryId"
JOIN "FlavorGroup" flavor_group
  ON flavor_group."categoryId" = product."categoryId"
 AND flavor_group."slug" = COALESCE(subcategory."slug", 'sabores')
WHERE product."isFlavorOption" = true
  AND product."isCombo" = false
  AND NOT EXISTS (
    SELECT 1 FROM "Flavor" linked WHERE linked."sourceProductId" = product."id"
  )
ON CONFLICT DO NOTHING;

-- O produto passa a ser a fonte oficial de todos os campos compartilhados.
UPDATE "Flavor" flavor
SET
  "name" = CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM "Flavor" other
      WHERE other."id" <> flavor."id"
        AND lower(btrim(other."name")) = lower(btrim(product."name"))
    ) THEN product."name"
    ELSE flavor."name"
  END,
  "slug" = CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM "Flavor" other
      WHERE other."id" <> flavor."id" AND other."slug" = product."slug"
    ) THEN product."slug"
    ELSE flavor."slug"
  END,
  "description" = product."description",
  "groupId" = COALESCE(flavor_group."id", flavor."groupId"),
  "price" = product."price",
  "promoPrice" = NULL,
  "promoActive" = false,
  "promoStartAt" = NULL,
  "promoEndAt" = NULL,
  "image" = product."image",
  "active" = product."isFlavorOption" AND NOT product."isCombo"
    AND product."available" AND product."deletedAt" IS NULL,
  "featured" = product."featured",
  "allowHalfAndHalf" = true,
  "sortOrder" = product."sortOrder",
  "stockTracked" = product."stockTracked",
  "stockQuantity" = product."stockQuantity",
  "stockLowThreshold" = product."stockLowThreshold",
  "updatedAt" = CURRENT_TIMESTAMP
FROM "Product" product
LEFT JOIN "Subcategory" subcategory ON subcategory."id" = product."subcategoryId"
LEFT JOIN "FlavorGroup" flavor_group
  ON flavor_group."categoryId" = product."categoryId"
 AND flavor_group."slug" = COALESCE(subcategory."slug", 'sabores')
WHERE flavor."sourceProductId" = product."id";

DELETE FROM "FlavorSize" size_rule
USING "Flavor" flavor, "Product" product
WHERE size_rule."flavorId" = flavor."id"
  AND flavor."sourceProductId" = product."id"
  AND product."isFlavorOption" = true
  AND product."isCombo" = false;

INSERT INTO "FlavorSize" (
  "flavorId", "sizeId", "pricingMode", "price", "available", "sortOrder",
  "createdAt", "updatedAt"
)
SELECT
  flavor."id", product_size."sizeId", 'FIXED', product_size."price",
  pizza_size."active", product_size."sortOrder", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Flavor" flavor
JOIN "Product" product ON product."id" = flavor."sourceProductId"
JOIN "ProductSize" product_size ON product_size."productId" = product."id"
JOIN "PizzaSize" pizza_size ON pizza_size."id" = product_size."sizeId"
WHERE product."isFlavorOption" = true AND product."isCombo" = false
ON CONFLICT ("flavorId", "sizeId") DO UPDATE
SET
  "pricingMode" = EXCLUDED."pricingMode",
  "price" = EXCLUDED."price",
  "available" = EXCLUDED."available",
  "sortOrder" = EXCLUDED."sortOrder",
  "updatedAt" = CURRENT_TIMESTAMP;

-- Remove apenas vínculos automáticos e os recompõe. Sabores independentes
-- escolhidos manualmente continuam intocados.
DELETE FROM "ProductFlavor" product_flavor
USING "Flavor" flavor
WHERE product_flavor."flavorId" = flavor."id"
  AND flavor."sourceProductId" IS NOT NULL;

INSERT INTO "ProductFlavor" ("productId", "flavorId", "sortOrder")
SELECT
  target."id",
  flavor."id",
  100 + row_number() OVER (
    PARTITION BY target."id" ORDER BY source."sortOrder", source."name", source."id"
  )::integer
FROM "Product" target
JOIN "Product" source
  ON source."categoryId" = target."categoryId"
 AND source."isFlavorOption" = true
 AND source."isCombo" = false
 AND source."available" = true
 AND source."deletedAt" IS NULL
JOIN "Flavor" flavor
  ON flavor."sourceProductId" = source."id" AND flavor."active" = true
WHERE target."allowFlavorSplit" = true
  AND target."isCombo" = false
  AND target."deletedAt" IS NULL
ON CONFLICT ("productId", "flavorId") DO UPDATE
SET "sortOrder" = EXCLUDED."sortOrder";

COMMIT;
