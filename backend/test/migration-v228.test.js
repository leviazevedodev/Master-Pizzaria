import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../prisma/migrations/20260912000000_operational_orders_and_combos/migration.sql",
  import.meta.url,
);

test("migration v2.28 é atômica e tolera estrutura criada anteriormente por db push", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /BEGIN;/);
  assert.match(sql, /COMMIT;/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "isCombo"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "ComboItem"/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "stockSnapshot"/);
  assert.match(sql, /IF NOT EXISTS \(SELECT 1 FROM pg_constraint/);
});
