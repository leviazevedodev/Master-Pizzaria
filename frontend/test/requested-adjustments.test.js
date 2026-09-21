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

test("avaliação usa estrelas, coleta entrega antes de comida e publica só comida", async () => {
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
  assert.match(home, /<h2>Avaliações<\/h2>/);
  assert.match(home, /review\.foodRating/);
  assert.doesNotMatch(home, /review\.deliveryRating/);
});

test("vitrine oferece trilhos dinâmicos e contador de entregues", async () => {
  const [home, marketing] = await Promise.all([
    source("../src/pages/HomePage.jsx"),
    source("../src/components/admin/MarketingAdmin.jsx"),
  ]);

  assert.match(home, /homeCatalogLayout === "CAROUSEL"/);
  assert.match(home, /categories\.map/);
  assert.match(home, /scrollBy/);
  assert.match(home, /Mais de \{Number\(highlights\.deliveredOrdersCount/);
  assert.match(marketing, /deliveredOrdersCounterEnabled/);
  assert.match(marketing, /Trilhos horizontais com setas/);
  assert.match(marketing, /Excluir esta avaliação definitivamente/);
});

test("trilhos usam setas laterais condicionais e incluem favoritos e avaliações", async () => {
  const [home, styles, app, toast, store] = await Promise.all([
    source("../src/pages/HomePage.jsx"),
    source("../src/styles.css"),
    source("../src/App.jsx"),
    source("../src/components/Toast.jsx"),
    source("../src/components/admin/StoreSettings.jsx"),
  ]);

  assert.match(home, /track\.scrollWidth > track\.clientWidth/);
  assert.match(home, /hasOverflow &&/);
  assert.match(home, /left: direction > 0 \? 0 : maximum/);
  assert.match(home, /className="storefront-rail-arrow previous"/);
  assert.match(home, /className="storefront-rail-arrow next"/);
  assert.match(home, /title="Favoritos dos clientes"[\s\S]*product-horizontal-track/);
  assert.match(home, /title="Avaliações"[\s\S]*review-horizontal-track/);
  assert.match(home, /<b>Facebook<\/b>[\s\S]*facebookName/);
  assert.match(styles, /\.storefront-rail-arrow\.previous[\s\S]*left: 9px/);
  assert.match(styles, /\.storefront-rail-arrow\.next[\s\S]*right: 9px/);
  assert.match(toast, /avoid-floating-bag/);
  assert.match(app, /avoidFloatingBag=\{/);
  assert.match(styles, /\.toast\.avoid-floating-bag/);
  assert.match(store, /"Ícone do aplicativo"/);
  assert.match(store, /maxWidth: 512/);
});

test("cozinha oculta prontos e fullscreen ignora o tema claro", async () => {
  const [kitchen, operationsCss] = await Promise.all([
    source("../src/components/admin/advanced/KitchenAdmin.jsx"),
    source("../src/styles/operations-v228.css"),
  ]);

  assert.match(kitchen, /Ocultar prontos/);
  assert.match(kitchen, /Mostrar prontos/);
  assert.match(kitchen, /master-pizza-kitchen-show-ready/);
  assert.match(kitchen, /order\.status === "SCHEDULED"/);
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
  assert.match(workspace, /\["SCHEDULED", "DELIVERED", "CANCELED"\]\.includes\(order\.status\)/);
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
  assert.match(header, /Instalar \{storeName\}/);
  assert.match(header, /Adicionar à Tela de Início/);
  assert.match(header, /showIosInstall/);
  assert.match(footer, /facebookName/);
  assert.match(store, /Nome no Facebook/);
  assert.doesNotMatch(store, /Fila inteligente de entregadores/);
  assert.match(management, /Fila inteligente de entregadores/);
});
