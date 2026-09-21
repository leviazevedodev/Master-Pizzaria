import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBranding,
  buildDynamicManifest,
  safeBrandColor,
  safePublicUrl,
} from "../src/lib/branding.js";

test("branding usa identidade configurada e produz Restaurant JSON-LD", () => {
  const branding = buildBranding(
    {
      storeName: "Pizzaria do Bairro",
      shortName: "Do Bairro",
      heroSubtitle: "Pizza artesanal feita na hora.",
      phone: "+5579000000000",
      address: "Rua Central, 10",
      instagramUrl: "https://instagram.com/pizzaria",
      primaryColor: "#AA1122",
      secondaryColor: "#101214",
      accentColor: "#ffcc00",
    },
    {
      origin: "https://pizzaria.example",
      pathname: "/cardapio",
      logoUrl: "https://cdn.example/logo.png",
    },
  );

  assert.equal(branding.title, "Pizzaria do Bairro");
  assert.equal(branding.socialTitle, "Pizzaria do Bairro");
  assert.equal(branding.canonical, "https://pizzaria.example/cardapio");
  assert.equal(branding.primaryColor, "#aa1122");
  assert.equal(branding.jsonLd["@type"], "Restaurant");
  assert.equal(branding.jsonLd.name, "Pizzaria do Bairro");
  assert.deepEqual(branding.jsonLd.sameAs, [
    "https://instagram.com/pizzaria",
  ]);
});

test("compartilhamento usa o nome da loja mesmo com título SEO antigo", () => {
  const branding = buildBranding(
    { storeName: "Pizzaria Ex", seoTitle: "Cardápio Online" },
    { origin: "https://loja.example", pathname: "/" },
  );
  assert.equal(branding.title, "Cardápio Online");
  assert.equal(branding.socialTitle, "Pizzaria Ex");
});

test("páginas administrativas recebem noindex", () => {
  const branding = buildBranding(
    { storeName: "Loja" },
    { origin: "https://loja.example", pathname: "/gestao/pedidos" },
  );
  assert.equal(branding.robots, "noindex,nofollow,noarchive");
});

test("cores e URLs inseguras não são propagadas", () => {
  assert.equal(safeBrandColor("red", "#000000"), "#000000");
  assert.equal(safePublicUrl("javascript:alert(1)"), "");
  const branding = buildBranding(
    { storeName: "Loja", logoImage: "javascript:alert(1)" },
    { origin: "https://loja.example", pathname: "/" },
  );
  assert.equal(branding.logo, "");
});

test("manifest acompanha nome, cores e ícone da marca", () => {
  const branding = buildBranding(
    {
      storeName: "Pizzaria Azul",
      shortName: "Azul",
      primaryColor: "#0055aa",
      secondaryColor: "#001122",
    },
    {
      origin: "https://azul.example",
      pathname: "/",
      logoUrl: "https://azul.example/logo.png",
      faviconUrl: "https://azul.example/icon.png",
    },
  );
  const manifest = buildDynamicManifest(branding);
  assert.equal(manifest.name, "Pizzaria Azul");
  assert.equal(manifest.short_name, "Pizzaria Azul");
  assert.equal(manifest.theme_color, "#0055aa");
  assert.equal(manifest.icons[0].src, "https://azul.example/icon.png");
  assert.equal(manifest.icons[0].sizes, "512x512");
  assert.equal(manifest.icons[0].purpose, "any");
});

test("branding sem nome configurado usa fallback público seguro", () => {
  const branding = buildBranding({}, { origin: "https://loja.example", pathname: "/" });
  assert.equal(branding.storeName, "Pizzaria");
  const manifest = buildDynamicManifest(branding);
  assert.equal(manifest.short_name, "Pizzaria");
  assert.equal(manifest.icons[0].src, "/images/store-placeholder.svg");
});
