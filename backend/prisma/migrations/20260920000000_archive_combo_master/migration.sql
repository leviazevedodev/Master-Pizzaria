-- O combo defeituoso sai do catálogo sem apagar referências de pedidos antigos.
BEGIN;

UPDATE "Promotion"
SET
  "active" = false,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "productId" IN (
  SELECT "id"
  FROM "Product"
  WHERE "slug" = 'combo-master'
);

UPDATE "Product"
SET
  "available" = false,
  "featured" = false,
  "deletedAt" = COALESCE("deletedAt", CURRENT_TIMESTAMP),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'combo-master';

COMMIT;
