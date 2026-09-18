import assert from "node:assert/strict";
import test from "node:test";
import { validateComboSlots } from "../src/combo-admin.js";

const flavor = {
  id: "calabresa",
  name: "Calabresa",
  groupId: "tradicionais",
  active: true,
  sizes: [{ sizeId: "grande", available: true }],
};
const pizza = {
  id: "pizza-base",
  name: "Pizza base",
  allowFlavorSplit: true,
  maxFlavors: 1,
  productSizes: [
    {
      sizeId: "grande",
      size: { id: "grande", name: "Grande", active: true, maxFlavors: 1 },
    },
  ],
  productFlavors: [{ flavorId: flavor.id, flavor }],
  modifierGroups: [],
};
const drink = {
  id: "bebida",
  name: "Bebida",
  allowFlavorSplit: false,
  maxFlavors: 1,
  productSizes: [],
  productFlavors: [],
  modifierGroups: [],
};
const tx = {
  product: {
    findMany: async () => [pizza, drink],
  },
};

const fixedSlot = {
  type: "FIXED_PRODUCT",
  quantity: 1,
  products: [{ productId: drink.id }],
};
const pizzaSlot = (patch = {}) => ({
  type: "CONFIGURABLE_PIZZA",
  quantity: 1,
  baseProductId: pizza.id,
  sizeId: "grande",
  flavorScope: "ALL",
  maxFlavors: 1,
  ...patch,
});

test("admin rejeita limite de sabores maior que produto e tamanho permitem", async () => {
  await assert.rejects(
    validateComboSlots(tx, [fixedSlot, pizzaSlot({ maxFlavors: 2 })]),
    (error) => error.code === "INVALID_COMBO" && /no máximo 1 sabor/.test(error.message),
  );
});

test("admin rejeita escopo restrito sem nenhum sabor permitido", async () => {
  await assert.rejects(
    validateComboSlots(tx, [fixedSlot, pizzaSlot({ flavorScope: "MANUAL" })]),
    (error) =>
      error.code === "INVALID_COMBO" && /não possui sabor permitido/.test(error.message),
  );
});

test("admin remove regras inaplicáveis de um produto fixo", async () => {
  const [fixed] = await validateComboSlots(tx, [
    {
      ...fixedSlot,
      flavorScope: "MANUAL",
      maxFlavors: 4,
      allowModifiers: true,
      modifierPricingMode: "INCLUDED",
    },
    pizzaSlot(),
  ]);

  assert.equal(fixed.flavorScope, "ALL");
  assert.equal(fixed.maxFlavors, null);
  assert.equal(fixed.allowModifiers, false);
  assert.equal(fixed.modifierPricingMode, "NORMAL");
});
