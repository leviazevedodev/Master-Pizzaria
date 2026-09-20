import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL(
    "../prisma/migrations/20260916000000_configurable_combo_slots/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const seed = readFileSync(new URL("../prisma/seed.js", import.meta.url), "utf8");

test("migration de combos é atômica, expansiva e preserva ComboItem", () => {
  assert.match(sql, /^\s*--[\s\S]*?BEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "ComboSlot"/);
  assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM "ComboItem"|TRUNCATE/i);
});

test("componentes fixos existentes são copiados para slots equivalentes", () => {
  assert.match(sql, /FROM "ComboItem" item/);
  assert.match(sql, /'FIXED_PRODUCT'/);
  assert.match(sql, /INSERT INTO "ComboSlotProduct"/);
  assert.match(sql, /ON CONFLICT \("id"\) DO NOTHING/);
});

test("regras comerciais e limites recebem constraints no banco", () => {
  assert.match(sql, /ComboSlot_type_check/);
  assert.match(sql, /ComboSlot_flavorScope_check/);
  assert.match(sql, /ComboSlot_maxFlavors_check/);
  assert.match(sql, /ComboSlotFlavorRule_pricingRule_check/);
  assert.match(sql, /ComboSlotModifierRule_pricingRule_check/);
});

test("instalação nova mantém apenas o combo configurável saudável", () => {
  assert.match(seed, /isCombo:\s*Boolean\(product\.isCombo\)/);
  assert.doesNotMatch(seed, /const defaultCombo = bySlug\["combo-master"\]/);
  assert.match(seed, /createdProductIds\.has\(choiceCombo\.id\)/);
  assert.match(seed, /tx\.comboSlot\.create/);
  assert.match(seed, /type:\s*"CONFIGURABLE_PIZZA"/);
  assert.match(seed, /type:\s*"FIXED_PRODUCT"/);
  assert.match(seed, /type:\s*"PRODUCT_CHOICE"/);
});
