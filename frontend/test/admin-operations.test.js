import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { nextStatusForOrder } from "../src/lib/adminOrders.js";

const adminPageUrl = new URL("../src/pages/AdminPage.jsx", import.meta.url);
const orderWorkspaceUrl = new URL(
  "../src/components/admin/OrderWorkspace.jsx",
  import.meta.url,
);
const promotionsUrl = new URL(
  "../src/components/admin/PromotionsAdmin.jsx",
  import.meta.url,
);
const kitchenAdminUrl = new URL(
  "../src/components/admin/advanced/KitchenAdmin.jsx",
  import.meta.url,
);
const reportsAdminUrl = new URL(
  "../src/components/admin/advanced/ReportsAdmin.jsx",
  import.meta.url,
);
const managementHubUrl = new URL(
  "../src/components/admin/advanced/ManagementHub.jsx",
  import.meta.url,
);
const advancedSectionsUrl = new URL(
  "../src/components/AdvancedAdminSections.jsx",
  import.meta.url,
);
const stylesUrl = new URL("../src/styles.css", import.meta.url);

test("atendimento pode avançar o fluxo completo de um pedido presencial", async () => {
  const [adminSource, orderSource] = await Promise.all([
    readFile(adminPageUrl, "utf8"),
    readFile(orderWorkspaceUrl, "utf8"),
  ]);

  assert.equal(nextStatusForOrder({ fulfillmentType: "DINE_IN", status: "RECEIVED" }), "PREPARING");
  assert.equal(nextStatusForOrder({ fulfillmentType: "DINE_IN", status: "PREPARING" }), "READY_FOR_TABLE");
  assert.equal(nextStatusForOrder({ fulfillmentType: "DINE_IN", status: "READY_FOR_TABLE" }), "SERVED");
  assert.match(adminSource, /`\/admin\/kitchen\/orders\/\$\{id\}\/advance`/);
  assert.match(orderSource, /"Marcar pronto para servir"/);
});

test("cozinha oferece telas cheias distintas e salão filtra pedidos presenciais", async () => {
  const source = await readFile(kitchenAdminUrl, "utf8");
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
  const promotions = await readFile(promotionsUrl, "utf8");
  const reports = await readFile(reportsAdminUrl, "utf8");
  const css = await readFile(stylesUrl, "utf8");

  assert.match(promotions, /promotion-product-editor/);
  assert.match(promotions, /promo-money-input/);
  assert.match(css, /\.promotion-product-identity/);
  assert.match(reports, /Total vendido/);
  assert.match(reports, /Devolvido aos clientes/);
  assert.match(reports, /Receita após estornos/);
});

test("paleta operacional carrega junto do painel, sem depender de seção lazy", async () => {
  const [adminSource, barrelSource] = await Promise.all([
    readFile(adminPageUrl, "utf8"),
    readFile(advancedSectionsUrl, "utf8"),
  ]);

  assert.match(adminSource, /import "\.\.\/styles\/operations-v228\.css"/);
  assert.doesNotMatch(barrelSource, /operations-v228\.css/);
});

test("Gestão 360 limita e preserva a ordem das consultas", async () => {
  const source = await readFile(managementHubUrl, "utf8");

  assert.match(source, /import \{ settleWithConcurrency \} from "\.\.\/\.\.\/\.\.\/lib\/async"/);
  assert.match(source, /const entries = keys\.map\(\(key\) => \[/);
  assert.match(source, /settleWithConcurrency\(entries, 1\)/);
  assert.doesNotMatch(source, /Promise\.allSettled/);
});
