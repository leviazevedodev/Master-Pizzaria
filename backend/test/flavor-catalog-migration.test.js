import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schemaUrl = new URL("../prisma/schema.prisma", import.meta.url);
const migrationUrl = new URL(
  "../prisma/migrations/20260915000000_central_flavor_catalog/migration.sql",
  import.meta.url,
);
const serverUrl = new URL("../src/server.js", import.meta.url);
const seedUrl = new URL("../prisma/seed.js", import.meta.url);

test("catálogo central modela grupo, tamanho, preço e compatibilidade legada", async () => {
  const schema = await readFile(schemaUrl, "utf8");
  assert.match(schema, /model FlavorGroup \{/);
  assert.match(schema, /model FlavorSize \{/);
  assert.match(schema, /sourceProductId\s+String\?\s+@unique/);
  assert.match(schema, /allowHalfAndHalf\s+Boolean\s+@default\(true\)/);
  assert.match(schema, /@@id\(\[flavorId, sizeId\]\)/);
  assert.match(schema, /pricingMode\s+String\s+@default\("FIXED"\)/);
});

test("migration de sabores é atômica, expansiva e preserva histórico", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /BEGIN;/);
  assert.match(sql, /COMMIT;/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "FlavorGroup"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "FlavorSize"/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "sourceProductId"/);
  assert.match(sql, /INSERT INTO "ProductFlavor"/);
  assert.match(sql, /UPDATE "OrderItemFlavor"/);
  assert.match(sql, /ON CONFLICT DO NOTHING/);
  assert.doesNotMatch(sql, /DROP TABLE|DROP COLUMN|DELETE FROM "Order|TRUNCATE/i);
});

test("API administrativa cobre grupos e sabores com regras por tamanho", async () => {
  const server = await readFile(serverUrl, "utf8");
  assert.match(server, /app\.get\("\/api\/admin\/flavor-groups"/);
  assert.match(server, /app\.post\("\/api\/admin\/flavor-groups"/);
  assert.match(server, /app\.patch\("\/api\/admin\/flavor-groups\/:id"/);
  assert.match(server, /app\.get\("\/api\/admin\/flavors"/);
  assert.match(server, /async function syncFlavorSizes/);
  assert.match(server, /entry\?\.pricingMode === "SURCHARGE"/);
});

test("seed cria o catálogo central e não desativa todos os sabores", async () => {
  const seed = await readFile(seedUrl, "utf8");
  assert.match(seed, /prisma\.flavorGroup\.upsert/);
  assert.match(seed, /prisma\.flavor\.upsert/);
  assert.match(seed, /prisma\.flavorSize\.upsert/);
  assert.match(seed, /prisma\.productFlavor\.upsert/);
  assert.doesNotMatch(seed, /flavor\.updateMany\(\{ data: \{ active: false \} \}\)/);
});
