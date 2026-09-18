import test from "node:test";
import assert from "node:assert/strict";
import {
  ComboConfigurationError,
  collectOrderStockNeeds,
  comboComponentIsAvailable,
  comboIsAvailableAt,
  resolveComboFlavorRule,
  resolveComboSelection,
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
  });
  assert.equal(needs.flavors.get("flavor"), 2);
  assert.equal(needs.options.get("extra"), 2);
});

test("sabor central não baixa uma segunda pizza inteira e legado permanece compatível", () => {
  const needs = collectOrderStockNeeds([
    {
      productId: "pizza-base",
      quantity: 2,
      flavors: [
        { flavorId: "calabresa", productId: "produto-calabresa" },
        { flavorId: "frango", productId: "produto-frango" },
      ],
    },
    {
      productId: "pizza-legada",
      quantity: 1,
      flavors: [{ flavorId: null, productId: "produto-sabor-legado" }],
    },
  ]);

  assert.deepEqual(Object.fromEntries(needs.products), {
    "pizza-base": 2,
    "pizza-legada": 1,
    "produto-sabor-legado": 1,
  });
  assert.deepEqual(Object.fromEntries(needs.flavors), {
    calabresa: 2,
    frango: 2,
  });
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

const centralFlavor = (id, groupId, patch = {}) => ({
  id,
  name: id,
  groupId,
  active: true,
  allowHalfAndHalf: true,
  stockTracked: false,
  sizes: [{ sizeId: "grande", available: true, size: { active: true } }],
  ...patch,
});

const configurableCombo = () => {
  const calabresa = centralFlavor("calabresa", "tradicionais");
  const camarao = centralFlavor("camarao", "premium");
  return {
    id: "combo",
    isCombo: true,
    comboSlots: [
      {
        id: "pizza",
        type: "CONFIGURABLE_PIZZA",
        name: "Pizza Grande",
        quantity: 1,
        sizeId: "grande",
        size: { name: "Grande", maxFlavors: 2 },
        flavorScope: "GROUPS",
        maxFlavors: null,
        allowModifiers: false,
        modifierPricingMode: "NORMAL",
        products: [],
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
        modifierRules: [],
        baseProduct: availableProduct({
          id: "pizza-base",
          allowFlavorSplit: true,
          maxFlavors: 4,
          productSizes: [
            { sizeId: "grande", size: { active: true, maxFlavors: 2 } },
          ],
          productFlavors: [{ flavor: calabresa }, { flavor: camarao }],
          modifierGroups: [],
        }),
      },
    ],
  };
};

test("exceção do sabor vence grupo e acréscimo do meio a meio é proporcional", () => {
  const combo = configurableCombo();
  const quote = resolveComboSelection(
    combo,
    [{ slotId: "pizza", flavorIds: ["calabresa", "camarao"] }],
    new Date("2026-09-16T18:00:00Z"),
    "UTC",
  );

  assert.equal(quote.adjustment, 3.5);
  assert.equal(quote.snapshots[0].flavors[1].pricingRule, "SURCHARGE");
  assert.equal(quote.snapshots[0].flavors[1].unitPrice, 3.5);
  assert.equal(quote.snapshots[0].flavors[1].ruleAmount, 7);
  assert.equal(
    resolveComboFlavorRule(combo.comboSlots[0], centralFlavor("nova", "tradicionais"))
      .pricingRule,
    "INCLUDED",
  );
});

test("backend ignora preço enviado e usa somente o ajuste da opção cadastrada", () => {
  const drink = availableProduct({ id: "coca", name: "Coca-Cola 2L" });
  const combo = {
    id: "combo",
    isCombo: true,
    comboSlots: [
      {
        id: "bebida",
        type: "PRODUCT_CHOICE",
        name: "Escolha a bebida",
        quantity: 1,
        products: [
          {
            id: "choice-coca",
            productId: "coca",
            product: drink,
            sizeId: null,
            size: null,
            priceAdjustment: 2,
          },
        ],
      },
    ],
  };
  const quote = resolveComboSelection(
    combo,
    [
      {
        slotId: "bebida",
        choiceId: "choice-coca",
        productId: "coca",
        price: -999,
      },
    ],
    new Date("2026-09-16T18:00:00Z"),
    "UTC",
  );
  assert.equal(quote.adjustment, 2);
});

test("sabor bloqueado no combo retorna erro comercial claro", () => {
  const combo = configurableCombo();
  combo.comboSlots[0].flavorRules = [
    { flavorId: "camarao", pricingRule: "BLOCKED", amount: 0 },
  ];
  assert.throws(
    () =>
      resolveComboSelection(
        combo,
        [{ slotId: "pizza", flavorIds: ["camarao"] }],
        new Date("2026-09-16T18:00:00Z"),
        "UTC",
      ),
    (error) =>
      error instanceof ComboConfigurationError &&
      error.code === "COMBO_FLAVOR_NOT_ALLOWED",
  );
});

test("estoque do snapshot configurável considera somente escolhas realizadas", () => {
  const needs = collectOrderStockNeeds([
    {
      productId: "combo",
      quantity: 2,
      comboItems: [
        {
          productId: "pizza-base",
          quantity: 1,
          flavors: [{ flavorId: "calabresa" }],
          options: [{ optionId: "borda" }],
        },
      ],
    },
  ]);
  assert.equal(needs.products.get("pizza-base"), 2);
  assert.equal(needs.flavors.get("calabresa"), 2);
  assert.equal(needs.flavors.has("camarao"), false);
  assert.equal(needs.options.get("borda"), 2);
});

test("cotação considera a quantidade total no estoque da pizza base", () => {
  const combo = configurableCombo();
  Object.assign(combo.comboSlots[0].baseProduct, {
    stockTracked: true,
    stockQuantity: 1,
  });

  assert.throws(
    () =>
      resolveComboSelection(
        combo,
        [{ slotId: "pizza", flavorIds: ["calabresa"] }],
        new Date("2026-09-16T18:00:00Z"),
        "UTC",
        2,
      ),
    (error) =>
      error instanceof ComboConfigurationError &&
      error.code === "COMBO_SLOT_UNAVAILABLE",
  );
});

test("cotação rejeita adicional sem estoque antes do checkout", () => {
  const combo = configurableCombo();
  const slot = combo.comboSlots[0];
  slot.allowModifiers = true;
  slot.baseProduct.modifierGroups = [
    {
      groupId: "bordas",
      group: {
        id: "bordas",
        name: "Bordas",
        active: true,
        required: false,
        minSelect: 0,
        maxSelect: 1,
        options: [
          {
            id: "borda-cheddar",
            groupId: "bordas",
            name: "Cheddar",
            active: true,
            price: 8,
            stockTracked: true,
            stockQuantity: 0,
          },
        ],
      },
    },
  ];

  assert.throws(
    () =>
      resolveComboSelection(
        combo,
        [
          {
            slotId: "pizza",
            flavorIds: ["calabresa"],
            optionIds: ["borda-cheddar"],
          },
        ],
        new Date("2026-09-16T18:00:00Z"),
        "UTC",
      ),
    (error) =>
      error instanceof ComboConfigurationError && error.code === "OUT_OF_STOCK",
  );
});
