import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import storeMeta from "../netlify/edge-functions/store-meta.js";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("cache público libera a página imediatamente e atualiza em segundo plano", async () => {
  const app = await source("../src/App.jsx");

  assert.match(app, /master-pizza-public-cache-v27/);
  assert.match(app, /useState\(Boolean\(initialPublic\)\)/);
  assert.match(app, /initialPublic\?\.settings \|\| DEMO_SETTINGS/);
  assert.match(app, /api\.get\("\/public\/bootstrap"\)/);
  assert.match(app, /publicSnapshotRef\.current = snapshot/);
  assert.match(app, /window\.addEventListener\("online", refresh\)/);
});

test("áreas públicas usam o nome principal da loja como fonte de verdade", async () => {
  const files = await Promise.all([
    source("../src/pages/HomePage.jsx"),
    source("../src/pages/AuthPage.jsx"),
    source("../src/pages/CartPage.jsx"),
  ]);
  for (const contents of files) {
    assert.doesNotMatch(contents, /settings\??\.shortName/);
    assert.match(contents, /settings\??\.storeName/);
  }
});

test("manifesto e compartilhamento recebem a identidade configurada no servidor", async () => {
  const [edge, html, serviceWorker] = await Promise.all([
    source("../netlify/edge-functions/store-meta.js"),
    source("../index.html"),
    source("../public/sw.js"),
  ]);

  assert.match(edge, /VITE_API_URL/);
  assert.match(edge, /WhatsApp/);
  assert.match(edge, /short_name: identity\.storeName/);
  assert.match(edge, /squareIcon\s*\|\|\s*logo\s*\|\|\s*safeHttpUrl/);
  assert.match(edge, /og:title/);
  assert.doesNotMatch(html, /<title>Cardápio online<\/title>/);
  assert.match(serviceWorker, /request\.destination === "image"/);
  assert.doesNotMatch(serviceWorker, /APP_SHELL = \["\/", "\/manifest\.webmanifest"\]/);
});

test("endpoint de manifesto usa nome e logo atuais da API", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.Netlify = {
    env: { get: (key) => (key === "VITE_API_URL" ? "https://api.example/api" : undefined) },
  };
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        storeName: "Pizzaria Ex",
        seoTitle: "Cardápio Online",
        logoImage: "/api/uploads/logo-ex.png",
        faviconImage: "/api/uploads/logo-ex-quadrada.webp",
        primaryColor: "#112233",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  try {
    const response = await storeMeta(
      new Request("https://pizzaria.example/manifest.webmanifest"),
      {},
    );
    const manifest = await response.json();
    assert.equal(manifest.name, "Pizzaria Ex");
    assert.equal(manifest.short_name, "Pizzaria Ex");
    assert.equal(manifest.icons[0].src, "https://api.example/api/uploads/logo-ex-quadrada.webp");
    assert.equal(manifest.icons[0].sizes, "512x512");

    const preview = await storeMeta(
      new Request("https://pizzaria.example/", {
        headers: { "user-agent": "WhatsApp/2.0" },
      }),
      {
        next: async () =>
          new Response(
            '<!doctype html><html><head><title>Pizzaria</title><meta property="og:title" content="Pizzaria" /></head><body></body></html>',
            { headers: { "content-type": "text/html" } },
          ),
      },
    );
    const previewHtml = await preview.text();
    assert.match(previewHtml, /property="og:title" content="Pizzaria Ex"/);
    assert.doesNotMatch(previewHtml, /property="og:title" content="Cardápio Online"/);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.Netlify;
  }
});

test("sabores vêm antes do tamanho e o editor de combo usa ícone próprio", async () => {
  const [builder, comboEditor] = await Promise.all([
    source("../src/components/PizzaBuilderModal.jsx"),
    source("../src/components/ComboSlotEditor.jsx"),
  ]);

  const flavors = builder.indexOf('chosen.map((flavor) => flavor.name).join(" / ")');
  const size = builder.indexOf("selectedSize?.name", flavors);
  assert.ok(flavors >= 0 && size > flavors);
  assert.match(comboEditor, /expanded \? <EyeOff/);
  assert.match(comboEditor, /: <Eye size/);
});
