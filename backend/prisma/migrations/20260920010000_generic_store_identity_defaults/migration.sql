-- Novas instalações começam com identidade genérica; dados configurados não são alterados.
BEGIN;

ALTER TABLE "BusinessSettings"
  ALTER COLUMN "storeName" SET DEFAULT 'Pizzaria',
  ALTER COLUMN "shortName" SET DEFAULT 'Pizzaria';

COMMIT;
