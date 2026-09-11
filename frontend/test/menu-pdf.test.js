import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMenuSections,
  normalizeMenuUrl,
  printedPriceRows,
} from "../src/lib/menuPdf.js";

test("aceita somente links HTTP ou HTTPS sem credenciais", () => {
  assert.equal(normalizeMenuUrl("https://pizzaria.example/cardapio"), "https://pizzaria.example/cardapio");
  assert.equal(normalizeMenuUrl("javascript:alert(1)"), "");
  assert.equal(normalizeMenuUrl("https://usuario:senha@example.com"), "");
});

test("organiza produtos ativos por categoria e subcategoria", () => {
  const sections = buildMenuSections(
    [
      { id: "2", name: "Cola", categoryId: "drinks", sortOrder: 2, available: true },
      { id: "1", name: "Calabresa", categoryId: "pizzas", subcategoryId: "trad", sortOrder: 1, available: true },
      { id: "3", name: "Oculto", categoryId: "pizzas", available: false },
    ],
    [
      { id: "pizzas", name: "Pizzas", sortOrder: 1 },
      { id: "drinks", name: "Bebidas", sortOrder: 2 },
    ],
    [{ id: "trad", name: "Tradicionais", categoryId: "pizzas", sortOrder: 1 }],
  );
  assert.deepEqual(sections.map((section) => section.name), ["Pizzas", "Bebidas"]);
  assert.equal(sections[0].groups[0].name, "Tradicionais");
  assert.deepEqual(sections.flatMap((section) => section.groups.flatMap((group) => group.products.map((product) => product.id))), ["1", "2"]);
});

test("promoção reduz o mesmo desconto dos tamanhos somente quando escolhida", () => {
  const product = {
    price: 40,
    promotion: {
      active: true,
      activeNow: true,
      originalPrice: 40,
      promoPrice: 35,
    },
    availableSizes: [
      { name: "Média", price: 42, sortOrder: 1, active: true },
      { name: "Grande", price: 50, sortOrder: 2, active: true },
    ],
  };
  assert.deepEqual(
    printedPriceRows(product, true).map(({ base, price, promotional }) => ({ base, price, promotional })),
    [
      { base: 42, price: 37, promotional: true },
      { base: 50, price: 45, promotional: true },
    ],
  );
  assert.deepEqual(
    printedPriceRows(product, false).map(({ base, price, promotional }) => ({ base, price, promotional })),
    [
      { base: 42, price: 42, promotional: false },
      { base: 50, price: 50, promotional: false },
    ],
  );
});
