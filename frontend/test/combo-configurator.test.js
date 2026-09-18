import test from "node:test";
import assert from "node:assert/strict";
import {
  availableComboFlavors,
  availableComboModifierOptions,
  comboCartKey,
  comboFlavorRule,
  comboSelectionBlockReason,
  initialComboSelections,
  localComboAdjustment,
  serializeComboSelections,
} from "../src/lib/comboConfigurator.js";

const flavor = (id, groupId) => ({
  id,
  name: id,
  group: { id: groupId },
  active: true,
  stockAvailable: true,
  availableSizes: [{ sizeId: "grande", available: true }],
});

const combo = {
  id: "combo",
  price: 60,
  comboSlots: [
    {
      id: "pizza",
      type: "CONFIGURABLE_PIZZA",
      name: "Pizza Grande",
      quantity: 1,
      sizeId: "grande",
      size: { maxFlavors: 2 },
      flavorScope: "GROUPS",
      flavorGroupRules: [
        {
          flavorGroupId: "tradicionais",
          pricingRule: "INCLUDED",
          amount: 0,
        },
        {
          flavorGroupId: "premium",
          pricingRule: "SURCHARGE",
          amount: 10,
        },
      ],
      flavorRules: [
        {
          flavorId: "camarao",
          pricingRule: "SURCHARGE",
          amount: 7,
        },
      ],
      allowModifiers: false,
      modifierRules: [],
      baseProduct: {
        maxFlavors: 4,
        availableFlavors: [
          flavor("calabresa", "tradicionais"),
          flavor("camarao", "premium"),
          flavor("doce", "doces"),
        ],
        availableModifierGroups: [],
      },
    },
    {
      id: "bebida",
      type: "PRODUCT_CHOICE",
      name: "Bebida",
      quantity: 1,
      products: [
        {
          id: "coca-choice",
          productId: "coca",
          sizeId: null,
          priceAdjustment: 2,
          product: { available: true, stockAvailable: true },
        },
      ],
    },
  ],
};

test("grupo inclui novos sabores e exceção individual vence o grupo", () => {
  const pizza = combo.comboSlots[0];
  assert.deepEqual(
    availableComboFlavors(pizza).map((entry) => entry.id),
    ["calabresa", "camarao"],
  );
  assert.equal(
    comboFlavorRule(pizza, flavor("nova", "tradicionais")).pricingRule,
    "INCLUDED",
  );
  assert.equal(
    comboFlavorRule(pizza, flavor("camarao", "premium")).amount,
    7,
  );
});

test("seleção inicial e bloqueio respeitam cada slot", () => {
  const selections = initialComboSelections(combo);
  assert.equal(selections.bebida.choiceId, "coca-choice");
  assert.deepEqual(selections.pizza.flavorIds, ["calabresa"]);
  assert.equal(
    comboSelectionBlockReason(combo.comboSlots[0], selections.pizza),
    "",
  );
});

test("ajuste local é apenas prévia e usa exceção proporcional", () => {
  const selections = initialComboSelections(combo);
  selections.pizza.flavorIds = ["calabresa", "camarao"];
  selections.pizza.targetCount = 2;
  assert.equal(localComboAdjustment(combo, selections), 5.5);
});

test("serializer não transporta preço e cartKey é canônica", () => {
  const selections = initialComboSelections(combo);
  const payload = serializeComboSelections(combo, selections);
  assert.equal(Object.hasOwn(payload[0], "price"), false);
  const keyA = comboCartKey("combo", payload, "Sem cebola");
  const keyB = comboCartKey("combo", [...payload].reverse(), "sem cebola");
  assert.equal(keyA, keyB);
});

test("opções bloqueadas não entram nos padrões nem validam o slot", () => {
  const configured = structuredClone(combo);
  const pizza = configured.comboSlots[0];
  pizza.allowModifiers = true;
  pizza.baseProduct.availableModifierGroups = [
    {
      id: "borda",
      name: "Borda",
      required: true,
      minSelect: 1,
      maxSelect: 1,
      options: [{ id: "sem-borda", name: "Sem borda", price: 0 }],
    },
  ];
  pizza.modifierRules = [
    { optionId: "sem-borda", pricingRule: "BLOCKED", amount: 0 },
  ];

  assert.deepEqual(availableComboModifierOptions(pizza, pizza.baseProduct.availableModifierGroups[0]), []);
  const selections = initialComboSelections(configured);
  assert.deepEqual(selections.pizza.optionIds, []);
  assert.match(comboSelectionBlockReason(pizza, selections.pizza), /Borda/);
});

test("escolha de produto pausado e sabor sem meio a meio são bloqueados", () => {
  const configured = structuredClone(combo);
  const drink = configured.comboSlots[1];
  drink.products[0].product.stockAvailable = false;
  assert.match(
    comboSelectionBlockReason(drink, { choiceId: "coca-choice" }),
    /Escolha uma opção/,
  );

  const pizza = configured.comboSlots[0];
  pizza.baseProduct.availableFlavors[0].allowHalfAndHalf = false;
  assert.match(
    comboSelectionBlockReason(pizza, {
      flavorIds: ["calabresa", "camarao"],
      optionIds: [],
      targetCount: 2,
    }),
    /não permite meio a meio/,
  );
});
