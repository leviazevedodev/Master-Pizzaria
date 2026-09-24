import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("cliente recebe Web Push e service worker trata evento em segundo plano", async () => {
  const [notifications, worker] = await Promise.all([
    source("../src/components/CustomerOrderNotifications.jsx"),
    source("../public/sw.js"),
  ]);
  assert.match(notifications, /pushManager\.subscribe/);
  assert.match(notifications, /\/push\/subscriptions/);
  assert.match(notifications, /display-mode: standalone/);
  assert.match(worker, /addEventListener\("push"/);
  assert.match(worker, /showNotification/);
});

test("acompanhamento atualiza em cinco segundos e ao voltar para a tela", async () => {
  const pages = await Promise.all([
    source("../src/pages/TrackOrderPage.jsx"),
    source("../src/pages/GuestOrdersPage.jsx"),
    source("../src/pages/AccountPage.jsx"),
  ]);
  for (const page of pages) {
    assert.match(page, /setInterval\(refresh, 5000\)/);
    assert.match(page, /visibilitychange/);
    assert.doesNotMatch(page, /20000/);
  }
});

test("atalho PWA usa apenas ícone e tutorial iOS segue menu e compartilhamento", async () => {
  const header = await source("../src/components/Header.jsx");
  assert.match(header, /<Ellipsis size=\{21\}/);
  assert.match(header, /<Share size=\{21\}/);
  assert.match(header, /três pontos/);
  assert.doesNotMatch(header, /<span>Instalar \{storeName\}<\/span>/);
});

test("cozinha e avaliação não exibem os textos removidos", async () => {
  const [kitchen, tracking] = await Promise.all([
    source("../src/components/admin/advanced/KitchenAdmin.jsx"),
    source("../src/pages/TrackOrderPage.jsx"),
  ]);
  assert.doesNotMatch(kitchen, /Atualização automática/);
  assert.doesNotMatch(tracking, /A avaliação só aparece no site depois de aprovada/);
});

test("painel adapta os grids à largura útil durante o zoom", async () => {
  const styles = await source("../src/styles.css");
  assert.match(styles, /container: admin-content \/ inline-size/);
  assert.match(styles, /@container admin-content \(max-width: 1080px\)/);
  assert.match(styles, /\.advanced-delivery-areas article/);
  assert.match(styles, /\.staff-admin-layout/);
  assert.match(styles, /\.product-editor-grid/);
});
