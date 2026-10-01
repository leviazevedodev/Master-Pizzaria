import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { syncProductFlavors } from "../src/product-flavors.js";

function memoryTx() {
  const rows = new Map();
  return {
    rows,
    productFlavor: {
      async updateMany({ where, data }) {
        for (const row of rows.values())
          if (row.productId === where.productId && !where.flavorId.notIn.includes(row.flavorId))
            Object.assign(row, data);
      },
      async upsert({ where, create, update }) {
        const key = `${where.productId_flavorId.productId}:${where.productId_flavorId.flavorId}`;
        rows.set(key, { ...(rows.get(key) || create), ...(rows.has(key) ? update : {}) });
      },
    },
  };
}

test("sabor pode ser marcado, desmarcado, recarregado e reativado com preço salvo", async () => {
  const tx = memoryTx();
  await syncProductFlavors(tx, "small", ["catupiry"], [{ flavorId: "catupiry", priceMode: "SURCHARGE", surcharge: 2 }]);
  assert.equal(tx.rows.get("small:catupiry").enabled, true);
  await syncProductFlavors(tx, "small", [], []);
  assert.equal(tx.rows.get("small:catupiry").enabled, false);
  assert.equal(tx.rows.get("small:catupiry").surcharge, 2);
  await syncProductFlavors(tx, "small", ["catupiry"], [{ flavorId: "catupiry", priceMode: "SURCHARGE", surcharge: 2 }]);
  assert.equal(tx.rows.get("small:catupiry").enabled, true);
  await syncProductFlavors(tx, "large", ["catupiry"], [{ flavorId: "catupiry", priceMode: "SURCHARGE", surcharge: 4 }]);
  assert.equal(tx.rows.get("large:catupiry").surcharge, 4);
  assert.equal(tx.rows.get("small:catupiry").surcharge, 2);
});

test("sabor existente mantém preço base e modos inválidos são recusados", async () => {
  const tx = memoryTx();
  await syncProductFlavors(tx, "pizza", ["calabresa"], []);
  assert.equal(tx.rows.get("pizza:calabresa").priceMode, "BASE_PRICE");
  await syncProductFlavors(tx, "pizza", ["calabresa"], [{ flavorId: "calabresa", priceMode: "HIDDEN_PRICE" }]);
  assert.equal(tx.rows.get("pizza:calabresa").priceMode, "HIDDEN_PRICE");
  await syncProductFlavors(tx, "pizza", ["calabresa"], []);
  assert.equal(tx.rows.get("pizza:calabresa").priceMode, "HIDDEN_PRICE");
  await assert.rejects(syncProductFlavors(tx, "pizza", ["calabresa"], [{ flavorId: "calabresa", priceMode: "BOGUS" }]));
  await assert.rejects(syncProductFlavors(tx, "pizza", ["calabresa"], [{ flavorId: "calabresa", priceMode: "SURCHARGE", surcharge: 2.005 }]));
});

test("migration preserva dados e aplica defaults de preço dentro de uma transação", async () => {
  const sql = await readFile(new URL("../prisma/migrations/20260930000000_product_flavor_pricing/migration.sql", import.meta.url), "utf8");
  assert.match(sql, /BEGIN;/);
  assert.match(sql, /COMMIT;/);
  assert.match(sql, /"enabled" BOOLEAN NOT NULL DEFAULT true/);
  assert.match(sql, /"priceMode" TEXT NOT NULL DEFAULT 'BASE_PRICE'/);
  assert.match(sql, /"surcharge" DECIMAL\(10,2\) NOT NULL DEFAULT 0/);
  assert.doesNotMatch(sql, /\b(DROP|TRUNCATE|DELETE)\b/i);
});
