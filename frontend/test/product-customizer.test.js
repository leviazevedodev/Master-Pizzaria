import test from "node:test";
import assert from "node:assert/strict";
import {
  customizerBlockReason,
  initialModifierSelections,
  isTableCatalogProduct,
  originalFlavorId,
} from "../src/lib/productCustomizer.js";
import { readFile } from "node:fs/promises";

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

test("mantém o sabor original de um produto-sabor pré-selecionado e bloqueado", () => {
  const flavors = [{ id: "flavor-calabresa" }, { id: "flavor-marguerita" }];
  assert.equal(
    originalFlavorId(
      {
        id: "product-calabresa",
        isFlavorOption: true,
        flavorCatalogMode: "CENTRAL",
        defaultFlavorId: "flavor-calabresa",
      },
      flavors,
    ),
    "flavor-calabresa",
  );
  assert.equal(
    originalFlavorId(
      { id: "product-calabresa", isFlavorOption: false },
      flavors,
    ),
    null,
  );
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

test("painel expõe somente regras de preço realmente distintas", async () => {
  const source = await readFile(
    new URL("../src/components/admin/ProductEditorModal.jsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /Cobrar o sabor mais caro/);
  assert.match(source, /Média dos sabores/);
  assert.doesNotMatch(source, /PROPORTIONAL|Proporcional às partes/);
});
