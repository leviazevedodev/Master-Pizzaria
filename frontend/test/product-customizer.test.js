import test from "node:test";
import assert from "node:assert/strict";
import {
  customizerBlockReason,
  initialModifierSelections,
  isTableCatalogProduct,
} from "../src/lib/productCustomizer.js";

test("pré-seleciona a borda padrão gratuita", () => {
  const groups = [
    {
      id: "crust",
      name: "Borda da pizza",
      required: true,
      minSelect: 1,
      options: [
        { id: "paid", name: "Catupiry", price: 6 },
        { id: "plain", name: "Sem borda", price: 0 },
      ],
    },
  ];

  assert.deepEqual(initialModifierSelections(groups), { crust: ["plain"] });
});

test("pizza vendável continua no catálogo mesmo sendo opção de sabor", () => {
  assert.equal(
    isTableCatalogProduct({
      id: "calabresa",
      available: true,
      stockAvailable: true,
      isFlavorOption: true,
    }),
    true,
  );
  assert.equal(isTableCatalogProduct({ available: false }), false);
});

test("explica exatamente o que falta para liberar a inclusão", () => {
  assert.equal(
    customizerBlockReason({
      sizes: [{ id: "large" }],
      selectedSize: { id: "large" },
      hasFlavorChoice: true,
      chosenCount: 1,
      targetCount: 2,
    }),
    "Escolha 2 sabor(es) para continuar.",
  );
});
