ALTER TABLE "Promotion"
ADD COLUMN "sizePrices" JSONB;

ALTER TABLE "BusinessSettings"
ALTER COLUMN "storeName" SET DEFAULT 'Master Pizzaria';

UPDATE "BusinessSettings"
SET "storeName" = 'Master Pizzaria'
WHERE lower(trim("storeName")) = 'master pizza';
