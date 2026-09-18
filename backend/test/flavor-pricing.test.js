import test from "node:test";
import assert from "node:assert/strict";
import {
  FlavorPricingError,
  normalizePizzaFlavorPricingMode,
  quoteFlavorSelection,
  roundMoney,
} from "../src/flavor-pricing.js";

const flavor = (id, price, patch = {}) => ({
  id,
  name: `Sabor ${id}`,
  active: true,
  allowHalfAndHalf: true,
  sizes: [
    {
      sizeId: "large",
      pricingMode: "FIXED",
      price,
      available: true,
      size: { active: true },
    },
  ],
  ...patch,
});

const quote = (patch = {}) =>
  quoteFlavorSelection({
    basePrice: 40,
    sizeId: "large",
    flavorIds: ["calabresa"],
    flavors: [flavor("calabresa", 42.9)],
    maxFlavors: 2,
    allowFlavorSplit: true,
    pricingMode: "MAX",
    ...patch,
  });

function expectCode(code, callback) {
  assert.throws(callback, (error) => {
    assert.equal(error instanceof FlavorPricingError, true);
    assert.equal(error.code, code);
    assert.match(error.message, /\S/);
    return true;
  });
}

test("FIXED usa o preço absoluto do tamanho e MAX escolhe o maior sabor", () => {
  const result = quote({
    flavorIds: ["calabresa", "premium"],
    flavors: [flavor("calabresa", 42.9), flavor("premium", 49.9)],
  });

  assert.equal(result.price, 49.9);
  assert.equal(result.unitPrice, 49.9);
  assert.equal(result.pricingMode, "MAX");
  assert.deepEqual(
    result.breakdown.map((entry) => ({
      id: entry.flavorId,
      configured: entry.configuredPrice,
      effective: entry.effectivePrice,
    })),
    [
      { id: "calabresa", configured: 42.9, effective: 42.9 },
      { id: "premium", configured: 49.9, effective: 49.9 },
    ],
  );
});

test("SURCHARGE soma somente o acréscimo configurado no backend ao preço base", () => {
  const result = quote({
    basePrice: 39.9,
    flavors: [
      flavor("calabresa", 999, {
        price: 0.01,
        clientPrice: 0.01,
        sizes: [
          {
            sizeId: "large",
            pricingMode: "SURCHARGE",
            price: 5.25,
            available: true,
            size: { active: true },
          },
        ],
      }),
    ],
  });

  assert.equal(result.price, 45.15);
  assert.equal(result.breakdown[0].configuredPrice, 5.25);
  assert.equal(result.breakdown[0].basePriceApplied, 39.9);
  assert.equal(result.breakdown[0].effectivePrice, 45.15);
});

test("AVERAGE, PROPORTIONAL e SUM calculam a média e arredondam em centavos", () => {
  const flavors = [flavor("a", 40), flavor("b", 40.01)];
  for (const pricingMode of ["AVERAGE", "PROPORTIONAL", "SUM"]) {
    const result = quote({
      flavorIds: ["a", "b"],
      flavors,
      pricingMode,
    });
    assert.equal(result.price, 40.01);
    assert.equal(result.pricingMode, pricingMode === "SUM" ? "AVERAGE" : pricingMode);
    assert.equal(result.legacySumMode, pricingMode === "SUM");
  }
  assert.equal(normalizePizzaFlavorPricingMode("sum"), "AVERAGE");
  assert.equal(roundMoney(19.995), 20);
});

test("rejeita IDs repetidos e seleção acima do limite", () => {
  expectCode("DUPLICATE_FLAVOR_ID", () =>
    quote({ flavorIds: ["calabresa", "calabresa"] }),
  );
  expectCode("FLAVOR_LIMIT_EXCEEDED", () =>
    quote({
      flavorIds: ["a", "b", "c"],
      flavors: [flavor("a", 40), flavor("b", 41), flavor("c", 42)],
      maxFlavors: 2,
    }),
  );
});

test("rejeita sabor inexistente, inativo ou sem autorização para meio a meio", () => {
  expectCode("FLAVOR_NOT_FOUND", () =>
    quote({ flavorIds: ["unknown"] }),
  );
  expectCode("FLAVOR_INACTIVE", () =>
    quote({ flavors: [flavor("calabresa", 42.9, { active: false })] }),
  );
  expectCode("FLAVOR_HALF_NOT_ALLOWED", () =>
    quote({
      flavorIds: ["a", "b"],
      flavors: [
        flavor("a", 40),
        flavor("b", 41, { allowHalfAndHalf: false }),
      ],
    }),
  );
  expectCode("FLAVOR_SPLIT_NOT_ALLOWED", () =>
    quote({
      flavorIds: ["a", "b"],
      flavors: [flavor("a", 40), flavor("b", 41)],
      allowFlavorSplit: false,
    }),
  );
});

test("exige uma regra ativa e disponível para o tamanho selecionado", () => {
  expectCode("FLAVOR_SIZE_NOT_CONFIGURED", () =>
    quote({ flavors: [flavor("calabresa", 42.9, { sizes: [] })] }),
  );
  expectCode("FLAVOR_SIZE_UNAVAILABLE", () =>
    quote({
      flavors: [
        flavor("calabresa", 42.9, {
          sizes: [
            {
              sizeId: "large",
              pricingMode: "FIXED",
              price: 42.9,
              available: false,
              size: { active: true },
            },
          ],
        }),
      ],
    }),
  );
  expectCode("FLAVOR_SIZE_UNAVAILABLE", () =>
    quote({
      flavors: [
        flavor("calabresa", 42.9, {
          sizes: [
            {
              sizeId: "large",
              pricingMode: "FIXED",
              price: 42.9,
              available: true,
              size: { active: false },
            },
          ],
        }),
      ],
    }),
  );
});

test("falha com códigos claros diante de configuração monetária inválida", () => {
  expectCode("INVALID_BASE_PRICE", () => quote({ basePrice: -1 }));
  expectCode("INVALID_PIZZA_PRICING_MODE", () =>
    quote({ pricingMode: "invented" }),
  );
  expectCode("INVALID_FLAVOR_SIZE_PRICING_MODE", () =>
    quote({
      flavors: [
        flavor("calabresa", 42.9, {
          sizes: [
            {
              sizeId: "large",
              pricingMode: "CLIENT_PRICE",
              price: 0.01,
              available: true,
            },
          ],
        }),
      ],
    }),
  );
  expectCode("INVALID_FLAVOR_SIZE_PRICE", () =>
    quote({
      flavors: [
        flavor("calabresa", 42.9, {
          sizes: [
            {
              sizeId: "large",
              pricingMode: "FIXED",
              price: Number.NaN,
              available: true,
            },
          ],
        }),
      ],
    }),
  );
});
