-- Ajusta as prioridades padrão solicitadas para catálogos já existentes.
UPDATE "Product" SET "sortOrder" = 7 WHERE "slug" = 'brownie-master';
UPDATE "Product" SET "sortOrder" = 10 WHERE "slug" = 'calabresa';
