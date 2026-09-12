import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const adminPageUrl = new URL("../src/pages/AdminPage.jsx", import.meta.url);
const advancedUrl = new URL(
  "../src/components/AdvancedAdminSections.jsx",
  import.meta.url,
);
const stylesUrl = new URL("../src/styles.css", import.meta.url);

test("atendimento pode avançar o fluxo completo de um pedido presencial", async () => {
  const source = await readFile(adminPageUrl, "utf8");

  assert.match(source, /if \(order\.status === "RECEIVED"\) return "PREPARING"/);
  assert.match(
    source,
    /if \(order\.status === "PREPARING"\) return "READY_FOR_TABLE"/,
  );
  assert.match(source, /`\/admin\/kitchen\/orders\/\$\{id\}\/advance`/);
  assert.match(source, /"Marcar pronto para servir"/);
});

test("cozinha oferece telas cheias distintas e salão filtra pedidos presenciais", async () => {
  const source = await readFile(advancedUrl, "utf8");
  const css = await readFile(stylesUrl, "utf8");

  assert.match(source, /Tela cheia da cozinha/);
  assert.match(source, /Tela cheia do salão/);
  assert.match(
    source,
    /orders\.filter\(\(order\) => order\.fulfillmentType === "DINE_IN"\)/,
  );
  assert.match(source, /sem dados pessoais, valores ou formas de pagamento/);
  assert.match(css, /\.kitchen-page\.focus-screen/);
  assert.match(css, /\.kitchen-page\.salon-screen/);
});

test("editor de promoções e resumo financeiro usam os novos componentes visuais", async () => {
  const admin = await readFile(adminPageUrl, "utf8");
  const advanced = await readFile(advancedUrl, "utf8");
  const css = await readFile(stylesUrl, "utf8");

  assert.match(admin, /promotion-product-editor/);
  assert.match(admin, /promo-money-input/);
  assert.match(css, /\.promotion-product-identity/);
  assert.match(advanced, /Total vendido/);
  assert.match(advanced, /Devolvido aos clientes/);
  assert.match(advanced, /Receita após estornos/);
});
