import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Combo Master é arquivado sem apagar o histórico", async () => {
  const migration = await source(
    "../prisma/migrations/20260920000000_archive_combo_master/migration.sql",
  );

  assert.match(migration, /^\s*--[\s\S]*?BEGIN;/);
  assert.match(migration, /"available" = false/);
  assert.match(migration, /"deletedAt" = COALESCE/);
  assert.match(migration, /"active" = false/);
  assert.match(migration, /'combo-master'/);
  assert.doesNotMatch(migration, /\bDELETE\s+FROM\b|\bDROP\s+TABLE\b|\bTRUNCATE\b/i);
  assert.match(migration, /COMMIT;\s*$/);
});

test("seed não recria o Combo Master removido", async () => {
  const seed = await source("../prisma/seed.js");
  assert.doesNotMatch(seed, /slug:\s*"combo-master"/);
  assert.doesNotMatch(seed, /title:\s*"Combo Master"/);
  assert.match(seed, /slug:\s*"combo-escolha-master"/);
  assert.match(seed, /storeName:\s*"Pizzaria"/);
  assert.doesNotMatch(seed, /storeName:\s*"Master Pizzaria"/);
});

test("defaults genéricos não sobrescrevem configurações existentes", async () => {
  const migration = await source(
    "../prisma/migrations/20260920010000_generic_store_identity_defaults/migration.sql",
  );
  assert.match(migration, /ALTER COLUMN "storeName" SET DEFAULT 'Pizzaria'/);
  assert.match(migration, /ALTER COLUMN "shortName" SET DEFAULT 'Pizzaria'/);
  assert.doesNotMatch(migration, /UPDATE\s+"BusinessSettings"/i);
});
