import test from "node:test";
import assert from "node:assert/strict";
import {
  customizerBlockReason,
  initialModifierSelections,
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
