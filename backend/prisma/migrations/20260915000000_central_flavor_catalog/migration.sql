-- Centraliza sabores sem remover a representação antiga baseada em Product.
-- A migração é expansiva e idempotente para instalações que já usaram db push.
BEGIN;

CREATE TABLE IF NOT EXISTS "FlavorGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FlavorGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FlavorGroup_categoryId_slug_key" ON "FlavorGroup"("categoryId", "slug");

ALTER TABLE "Flavor" ADD COLUMN IF NOT EXISTS "slug" TEXT;
ALTER TABLE "Flavor" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Flavor" ADD COLUMN IF NOT EXISTS "ingredients" JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "Flavor" ADD COLUMN IF NOT EXISTS "groupId" TEXT;
ALTER TABLE "Flavor" ADD COLUMN IF NOT EXISTS "sourceProductId" TEXT;
ALTER TABLE "Flavor" ADD COLUMN IF NOT EXISTS "featured" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Flavor" ADD COLUMN IF NOT EXISTS "allowHalfAndHalf" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PizzaSize" ADD COLUMN IF NOT EXISTS "maxFlavors" INTEGER NOT NULL DEFAULT 4;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "sizeId" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "priceBreakdown" JSONB;

UPDATE "PizzaSize"
SET "maxFlavors" = CASE
  WHEN "slug" IN ('broto', 'individual', 'pequena') THEN 1
  WHEN "slug" = 'media' THEN 2
  WHEN "slug" = 'grande' THEN 3
  WHEN "slug" IN ('familia', 'familia-grande') THEN 4
  ELSE LEAST(4, GREATEST(1, "maxFlavors"))
END;

CREATE TABLE IF NOT EXISTS "FlavorSize" (
    "flavorId" TEXT NOT NULL,
    "sizeId" TEXT NOT NULL,
    "pricingMode" TEXT NOT NULL DEFAULT 'FIXED',
    "price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FlavorSize_pkey" PRIMARY KEY ("flavorId", "sizeId")
);

-- Um grupo por subcategoria de pizza; itens sem subcategoria ficam em "Sabores".
INSERT INTO "FlavorGroup" (
  "id", "name", "slug", "description", "categoryId", "active", "sortOrder", "createdAt", "updatedAt"
)
SELECT DISTINCT ON (p."categoryId", COALESCE(s."slug", 'sabores'))
  'fg_' || md5(p."categoryId" || ':' || COALESCE(s."id", 'sem-subcategoria')),
  COALESCE(s."name", 'Sabores'),
  COALESCE(s."slug", 'sabores'),
  'Grupo criado automaticamente ao centralizar os sabores existentes.',
  p."categoryId",
  true,
  COALESCE(s."sortOrder", 0),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Product" p
LEFT JOIN "Subcategory" s ON s."id" = p."subcategoryId"
WHERE (p."isFlavorOption" = true OR p."allowFlavorSplit" = true)
ORDER BY p."categoryId", COALESCE(s."slug", 'sabores'), p."sortOrder", p."id"
ON CONFLICT DO NOTHING;

-- Reaproveita um Flavor antigo quando o nome corresponde a exatamente um produto.
WITH source_products AS (
  SELECT
    p.*,
    lower(btrim(p."name")) AS normalized_name,
    count(*) OVER (PARTITION BY lower(btrim(p."name"))) AS same_name_count
  FROM "Product" p
  WHERE p."isFlavorOption" = true OR p."allowFlavorSplit" = true
), unique_sources AS (
  SELECT * FROM source_products WHERE same_name_count = 1
)
UPDATE "Flavor" f
SET
  "sourceProductId" = s."id",
  "description" = CASE WHEN f."description" = '' THEN s."description" ELSE f."description" END,
  "image" = COALESCE(f."image", s."image"),
  "price" = s."price",
  "active" = s."available" AND s."deletedAt" IS NULL,
  "featured" = s."featured",
  "sortOrder" = s."sortOrder",
  "stockTracked" = s."stockTracked",
  "stockQuantity" = s."stockQuantity",
  "stockLowThreshold" = s."stockLowThreshold",
  "updatedAt" = CURRENT_TIMESTAMP
FROM unique_sources s
WHERE f."sourceProductId" IS NULL
  AND lower(btrim(f."name")) = s.normalized_name
  AND f."id" = (
    SELECT candidate."id"
    FROM "Flavor" candidate
    WHERE candidate."sourceProductId" IS NULL
      AND lower(btrim(candidate."name")) = s.normalized_name
    ORDER BY candidate."createdAt", candidate."id"
    LIMIT 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM "Flavor" occupied WHERE occupied."sourceProductId" = s."id"
  );

-- Cria somente os sabores que ainda não puderam ser associados. Nomes repetidos
-- recebem um sufixo estável para que nenhum produto legado seja descartado.
WITH source_products AS (
  SELECT
    p.*,
    count(*) OVER (PARTITION BY lower(btrim(p."name"))) AS same_name_count
  FROM "Product" p
  WHERE p."isFlavorOption" = true OR p."allowFlavorSplit" = true
)
INSERT INTO "Flavor" (
  "id", "name", "slug", "description", "ingredients", "sourceProductId",
  "price", "promoPrice", "promoActive", "promoStartAt", "promoEndAt",
  "image", "active", "featured", "allowHalfAndHalf", "sortOrder",
  "stockTracked", "stockQuantity", "stockLowThreshold", "createdAt", "updatedAt"
)
SELECT
  'fl_' || md5(p."id"),
  CASE
    WHEN p.same_name_count = 1
      AND NOT EXISTS (SELECT 1 FROM "Flavor" named WHERE lower(btrim(named."name")) = lower(btrim(p."name")))
      THEN p."name"
    ELSE p."name" || ' · ' || substr(md5(p."id"), 1, 8)
  END,
  CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM "Flavor" slugged WHERE slugged."slug" = p."slug"
    ) THEN p."slug"
    ELSE p."slug" || '-' || md5(p."id")
  END,
  p."description",
  '[]'::jsonb,
  p."id",
  p."price",
  NULL,
  false,
  NULL,
  NULL,
  p."image",
  p."available" AND p."deletedAt" IS NULL,
  p."featured",
  true,
  p."sortOrder",
  p."stockTracked",
  p."stockQuantity",
  p."stockLowThreshold",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM source_products p
WHERE NOT EXISTS (
  SELECT 1 FROM "Flavor" linked WHERE linked."sourceProductId" = p."id"
)
ON CONFLICT DO NOTHING;

-- Registros Flavor sem produto de origem continuam disponíveis para consulta e
-- recebem um slug interno estável; nada é apagado.
UPDATE "Flavor"
SET "slug" = 'sabor-legacy-' || md5("id")
WHERE "slug" IS NULL OR btrim("slug") = '';

-- Bancos que receberam o schema via db push podem conter dados parciais antes
-- destes índices. Mantém o registro mais antigo e torna os demais valores
-- únicos sem apagar nenhum sabor.
WITH ranked_sources AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "sourceProductId"
      ORDER BY "createdAt", "id"
    ) AS position
  FROM "Flavor"
  WHERE "sourceProductId" IS NOT NULL
)
UPDATE "Flavor" f
SET "sourceProductId" = NULL
FROM ranked_sources ranked
WHERE f."id" = ranked."id" AND ranked.position > 1;

WITH ranked_slugs AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "slug"
      ORDER BY "createdAt", "id"
    ) AS position
  FROM "Flavor"
)
UPDATE "Flavor" f
SET "slug" = f."slug" || '-' || md5(f."id")
FROM ranked_slugs ranked
WHERE f."id" = ranked."id" AND ranked.position > 1;

ALTER TABLE "Flavor" ALTER COLUMN "slug" SET NOT NULL;

-- Associa os grupos derivados das subcategorias.
UPDATE "Flavor" f
SET "groupId" = fg."id"
FROM "Product" p
LEFT JOIN "Subcategory" s ON s."id" = p."subcategoryId"
JOIN "FlavorGroup" fg
  ON fg."categoryId" = p."categoryId"
 AND fg."slug" = COALESCE(s."slug", 'sabores')
WHERE f."sourceProductId" = p."id" AND f."groupId" IS NULL;

-- Copia os preços normais por tamanho. Promoções continuam preservadas no
-- produto de origem durante a fase de compatibilidade.
INSERT INTO "FlavorSize" (
  "flavorId", "sizeId", "pricingMode", "price", "available", "sortOrder", "createdAt", "updatedAt"
)
SELECT
  f."id", ps."sizeId", 'FIXED', ps."price", sz."active", ps."sortOrder", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Flavor" f
JOIN "ProductSize" ps ON ps."productId" = f."sourceProductId"
JOIN "PizzaSize" sz ON sz."id" = ps."sizeId"
ON CONFLICT ("flavorId", "sizeId") DO NOTHING;

-- Reproduz a elegibilidade atual: o sabor-base e todos os produtos marcados
-- como sabor dentro da mesma categoria. Vínculos já personalizados são mantidos.
INSERT INTO "ProductFlavor" ("productId", "flavorId", "sortOrder")
SELECT
  base."id",
  f."id",
  source."sortOrder"
FROM "Product" base
JOIN "Product" source
  ON source."categoryId" = base."categoryId"
 AND (source."isFlavorOption" = true OR source."id" = base."id")
JOIN "Flavor" f ON f."sourceProductId" = source."id"
WHERE base."allowFlavorSplit" = true
ON CONFLICT ("productId", "flavorId") DO NOTHING;

-- Pedidos antigos conservam productId e snapshots; flavorId é preenchido
-- quando a origem é inequívoca para permitir a leitura pelo catálogo central.
UPDATE "OrderItemFlavor" oif
SET "flavorId" = f."id"
FROM "Flavor" f
WHERE oif."flavorId" IS NULL
  AND oif."productId" = f."sourceProductId";

-- IDs sobrevivem a renomeações futuras; sizeName continua como snapshot
-- legível do momento da venda.
UPDATE "OrderItem" item
SET "sizeId" = product_size."sizeId"
FROM "ProductSize" product_size
JOIN "PizzaSize" size ON size."id" = product_size."sizeId"
WHERE item."sizeId" IS NULL
  AND item."productId" = product_size."productId"
  AND lower(btrim(item."sizeName")) = lower(btrim(size."name"));

CREATE UNIQUE INDEX IF NOT EXISTS "Flavor_slug_key" ON "Flavor"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "Flavor_sourceProductId_key" ON "Flavor"("sourceProductId");
CREATE INDEX IF NOT EXISTS "FlavorGroup_categoryId_active_sortOrder_idx" ON "FlavorGroup"("categoryId", "active", "sortOrder");
CREATE INDEX IF NOT EXISTS "Flavor_groupId_active_sortOrder_idx" ON "Flavor"("groupId", "active", "sortOrder");
CREATE INDEX IF NOT EXISTS "FlavorSize_sizeId_available_idx" ON "FlavorSize"("sizeId", "available");
CREATE INDEX IF NOT EXISTS "FlavorSize_flavorId_available_idx" ON "FlavorSize"("flavorId", "available");
CREATE INDEX IF NOT EXISTS "OrderItem_sizeId_idx" ON "OrderItem"("sizeId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FlavorGroup_categoryId_fkey' AND conrelid = '"FlavorGroup"'::regclass) THEN
    ALTER TABLE "FlavorGroup" ADD CONSTRAINT "FlavorGroup_categoryId_fkey"
      FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Flavor_groupId_fkey' AND conrelid = '"Flavor"'::regclass) THEN
    ALTER TABLE "Flavor" ADD CONSTRAINT "Flavor_groupId_fkey"
      FOREIGN KEY ("groupId") REFERENCES "FlavorGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Flavor_sourceProductId_fkey' AND conrelid = '"Flavor"'::regclass) THEN
    ALTER TABLE "Flavor" ADD CONSTRAINT "Flavor_sourceProductId_fkey"
      FOREIGN KEY ("sourceProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FlavorSize_flavorId_fkey' AND conrelid = '"FlavorSize"'::regclass) THEN
    ALTER TABLE "FlavorSize" ADD CONSTRAINT "FlavorSize_flavorId_fkey"
      FOREIGN KEY ("flavorId") REFERENCES "Flavor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FlavorSize_sizeId_fkey' AND conrelid = '"FlavorSize"'::regclass) THEN
    ALTER TABLE "FlavorSize" ADD CONSTRAINT "FlavorSize_sizeId_fkey"
      FOREIGN KEY ("sizeId") REFERENCES "PizzaSize"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderItem_sizeId_fkey' AND conrelid = '"OrderItem"'::regclass) THEN
    ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_sizeId_fkey"
      FOREIGN KEY ("sizeId") REFERENCES "PizzaSize"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FlavorSize_pricingMode_check' AND conrelid = '"FlavorSize"'::regclass) THEN
    ALTER TABLE "FlavorSize" ADD CONSTRAINT "FlavorSize_pricingMode_check"
      CHECK ("pricingMode" IN ('FIXED', 'SURCHARGE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FlavorSize_price_check' AND conrelid = '"FlavorSize"'::regclass) THEN
    ALTER TABLE "FlavorSize" ADD CONSTRAINT "FlavorSize_price_check" CHECK ("price" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PizzaSize_maxFlavors_check' AND conrelid = '"PizzaSize"'::regclass) THEN
    ALTER TABLE "PizzaSize" ADD CONSTRAINT "PizzaSize_maxFlavors_check" CHECK ("maxFlavors" BETWEEN 1 AND 4);
  END IF;
END $$;

COMMIT;
