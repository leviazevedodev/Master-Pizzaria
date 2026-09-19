import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  comboSnapshotDetailLines,
  comboSnapshotItemLabel,
  comboSnapshotText,
} from "../src/lib/comboSnapshot.js";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("snapshot V2 preserva etapa, sabores e adicionais na apresentação", () => {
  const item = {
    slotId: "pizza",
    slotName: "Escolha sua pizza",
    name: "Pizza base",
    quantity: 1,
    sizeName: "Grande",
    flavors: [{ flavorId: "calabresa", name: "Calabresa" }],
    options: [
      { optionId: "catupiry", groupName: "Borda", optionName: "Catupiry" },
    ],
  };
  assert.equal(comboSnapshotItemLabel(item, 2), "2× Pizza base • Grande");
  assert.deepEqual(comboSnapshotDetailLines(item), [
    "Escolha: Escolha sua pizza",
    "Sabores: Calabresa",
    "Adicionais: Borda: Catupiry",
  ]);
  assert.match(comboSnapshotText(item), /Sabores: Calabresa/);
});

test("runtime roteia combo configurável sem condicionar hooks do legado", async () => {
  const modal = await source("../src/components/PizzaBuilderModal.jsx");
  assert.match(modal, /function LegacyPizzaBuilderModal/);
  assert.match(modal, /<ConfigurableComboFlow \{\.\.\.props\} \/>/);
  assert.match(modal, /some\(\(slot\) => slot\?\.type !== "FIXED_PRODUCT"\)/);
});

test("todos os emissores de pedido encaminham comboSelections", async () => {
  const files = await Promise.all([
    source("../src/pages/CheckoutPage.jsx"),
    source("../src/pages/DigitalTableCheckoutPage.jsx"),
    source("../src/components/TablesAdmin.jsx"),
  ]);
  for (const contents of files) {
    assert.match(contents, /comboSelections: item\.comboSelections/);
  }
});

test("itens fixos do combo exibem foto, quantidade, nome e fallback responsivo", async () => {
  const [component, styles] = await Promise.all([
    source("../src/components/ConfigurableComboFlow.jsx"),
    source("../src/styles/configurable-combo.css"),
  ]);
  assert.match(component, /product\?\.image/);
  assert.match(component, /combo-fixed-item-fallback/);
  assert.match(component, /\{entry\.quantity\}x incluído/);
  assert.match(component, /product\?\.name \|\| entry\.name/);
  assert.match(styles, /\.combo-fixed-item-media[\s\S]*aspect-ratio:\s*4 \/ 3/);
  assert.match(styles, /@media \(max-width: 620px\)[\s\S]*\.combo-fixed-chips[\s\S]*grid-template-columns:\s*1fr/);
});
