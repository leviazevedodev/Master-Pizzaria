import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("home limita ofertas e favoritos e oferece acesso ao cardápio", async () => {
  const home = await source("../src/pages/HomePage.jsx");

  assert.match(home, /promotions\.slice\(0, 6\)/);
  assert.match(home, /promotions\.length > 6/);
  assert.match(home, /Abrir o cardápio para ver mais/);
  assert.match(home, /highlights\.bestSellers\.slice\(0, 4\)/);
});

test("marketing reúne cupons e promoções também aceita sabores", async () => {
  const [admin, marketing, management, promotions] = await Promise.all([
    source("../src/pages/AdminPage.jsx"),
    source("../src/components/admin/MarketingAdmin.jsx"),
    source("../src/components/admin/advanced/ManagementHub.jsx"),
    source("../src/components/admin/PromotionsAdmin.jsx"),
  ]);

  assert.match(marketing, /<CouponsAdmin/);
  assert.doesNotMatch(management, /\/admin\/coupons|Cupons de desconto/);
  assert.match(promotions, /Sabores/);
  assert.match(promotions, /updateFlavor/);
  assert.match(
    admin,
    /can\("products"\) \|\| can\("alterations"\) \|\| can\("promotions"\)[\s\S]*jobs\.flavors/,
  );
});

test("avaliação usa estrelas, entrega antes de comida e respeita pedido avaliado", async () => {
  const [tracking, home] = await Promise.all([
    source("../src/pages/TrackOrderPage.jsx"),
    source("../src/pages/HomePage.jsx"),
  ]);
  const deliveryIndex = tracking.indexOf('label="Entrega"');
  const foodIndex = tracking.indexOf('label="Comida"');

  assert.match(tracking, /star-rating-buttons/);
  assert.match(tracking, /fill=\{star <= value \? "currentColor" : "none"\}/);
  assert.ok(deliveryIndex >= 0 && deliveryIndex < foodIndex);
  assert.match(tracking, /!order\.reviewed/);
  assert.match(tracking, /foodRating:\s*0/);
  assert.match(tracking, /deliveryRating:\s*0/);
  assert.match(home, /Média da comida/);
  assert.match(home, /Entrega:/);
  assert.match(home, /Comida:/);
});

test("cozinha oculta prontos e fullscreen ignora o tema claro", async () => {
  const [kitchen, operationsCss] = await Promise.all([
    source("../src/components/admin/advanced/KitchenAdmin.jsx"),
    source("../src/styles/operations-v228.css"),
  ]);

  assert.match(kitchen, /Ocultar prontos/);
  assert.match(kitchen, /Mostrar prontos/);
  assert.match(kitchen, /master-pizza-kitchen-show-ready/);
  assert.match(
    operationsCss,
    /\.admin-shell:not\(\.admin-dark\) \.kitchen-page\.focus-screen/,
  );
});

test("pedidos usam relógio e deixam de exibir alertas de atenção", async () => {
  const [workspace, dashboard] = await Promise.all([
    source("../src/components/admin/OrderWorkspace.jsx"),
    source("../src/components/admin/AdminDashboardSections.jsx"),
  ]);

  assert.match(workspace, /kitchenCountdown/);
  assert.match(workspace, /\["DELIVERED", "CANCELED"\]\.includes\(order\.status\)/);
  assert.doesNotMatch(workspace, /deadline-alert|attention-pulse/);
  assert.doesNotMatch(dashboard, /Em alerta de prazo|Prazo atrasado/);
});

test("instalação PWA, Facebook e fila de entregadores ficam nos locais definidos", async () => {
  const [header, footer, store, management] = await Promise.all([
    source("../src/components/Header.jsx"),
    source("../src/components/Footer.jsx"),
    source("../src/components/admin/StoreSettings.jsx"),
    source("../src/components/admin/advanced/ManagementHub.jsx"),
  ]);

  assert.match(header, /beforeinstallprompt/);
  assert.match(header, /Adicionar à tela inicial/);
  assert.match(footer, /facebookName/);
  assert.match(store, /Nome no Facebook/);
  assert.doesNotMatch(store, /Fila inteligente de entregadores/);
  assert.match(management, /Fila inteligente de entregadores/);
});
