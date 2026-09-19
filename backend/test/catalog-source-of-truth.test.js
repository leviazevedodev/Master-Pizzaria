import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const serverUrl = new URL("../src/server.js", import.meta.url);
const migrationUrl = new URL(
  "../prisma/migrations/20260918000000_catalog_reward_flavor_consistency/migration.sql",
  import.meta.url,
);

test("produto marcado é a fonte oficial do sabor e vínculos automáticos", async () => {
  const source = await readFile(serverUrl, "utf8");

  assert.match(source, /async function syncProductSourceFlavor/);
  assert.match(source, /sourceProductId:\s*product\.id/);
  assert.match(source, /async function syncAutomaticSourceFlavorLinks/);
  assert.match(source, /PRODUCT_MANAGED_FLAVOR/);
  assert.match(source, /await syncProductSourceFlavor\(tx, req\.params\.id\)/);
});

test("migração corrige Combo Master e normaliza modos equivalentes sem apagar histórico", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /"slug" = 'combo-master'/);
  assert.match(sql, /"isCombo" = true/);
  assert.match(sql, /IN \('PROPORTIONAL', 'SUM'\)/);
  assert.match(sql, /"flavorPricingMode" = 'AVERAGE'/);
  assert.match(sql, /Produtos que apenas aceitam divisão não viram sabores/);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE/);
});
