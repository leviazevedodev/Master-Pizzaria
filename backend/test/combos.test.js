import test from "node:test";
import assert from "node:assert/strict";
import {
  collectOrderStockNeeds,
  comboComponentIsAvailable,
  comboIsAvailableAt,
  snapshotComboItems,
} from "../src/combos.js";

const availableProduct = (patch = {}) => ({
  id: "product-1",
  name: "Pizza",
  available: true,
  deletedAt: null,
  pausedUntil: null,
  availableDays: null,
  availableStartTime: null,
  availableEndTime: null,
  stockTracked: false,
  stockQuantity: 0,
  productSizes: [],
  ...patch,
});

test("snapshot do combo preserva produto, tamanho e quantidade vendidos", () => {
  assert.deepEqual(
    snapshotComboItems({
      isCombo: true,
      comboItems: [
        {
          productId: "pizza",
          quantity: 2,
          sizeId: "grande",
          size: { name: "Grande" },
          product: { name: "Calabresa" },
        },
      ],
    }),
    [
      {
        productId: "pizza",
        name: "Calabresa",
        quantity: 2,
        sizeId: "grande",
        sizeName: "Grande",
      },
    ],
  );
});

test("combo respeita tamanho obrigatório e estoque de todas as unidades", () => {
  const date = new Date("2026-09-14T20:00:00Z");
  const entry = {
    product: availableProduct({
      stockTracked: true,
      stockQuantity: 3,
      productSizes: [{ sizeId: "grande", size: { active: true } }],
    }),
    sizeId: "grande",
    quantity: 2,
  };

  assert.equal(comboComponentIsAvailable(entry, date, "UTC", 1), true);
  assert.equal(comboComponentIsAvailable(entry, date, "UTC", 2), false);
  assert.equal(comboComponentIsAvailable({ ...entry, sizeId: null }, date, "UTC"), false);
  assert.equal(
    comboIsAvailableAt({ isCombo: true, comboItems: [entry, { ...entry, productId: "second" }] }, date, "UTC"),
    true,
  );
});

test("baixa do pedido soma componentes do combo e personalizações", () => {
  const needs = collectOrderStockNeeds([
    {
      productId: "combo",
      quantity: 2,
      comboItems: [
        { productId: "pizza", quantity: 1 },
        { productId: "drink", quantity: 2 },
      ],
      flavors: [{ flavorId: "flavor", productId: "flavor-product" }],
      options: [{ optionId: "extra" }],
    },
  ]);

  assert.deepEqual(Object.fromEntries(needs.products), {
    combo: 2,
    pizza: 2,
    drink: 4,
    "flavor-product": 2,
  });
  assert.equal(needs.flavors.get("flavor"), 2);
  assert.equal(needs.options.get("extra"), 2);
});

test("carrinho agrega estoque quando combos diferentes compartilham um componente", () => {
  const needs = collectOrderStockNeeds([
    {
      productId: "combo-pizza",
      quantity: 2,
      comboItems: [{ productId: "refrigerante", quantity: 1 }],
    },
    {
      productId: "combo-lanche",
      quantity: 2,
      comboItems: [{ productId: "refrigerante", quantity: 1 }],
    },
  ]);

  assert.equal(needs.products.get("refrigerante"), 4);
});
