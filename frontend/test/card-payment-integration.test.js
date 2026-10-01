import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { loadMercadoPagoSdk, mountMercadoPagoCard, CardSetupError } from "../src/lib/mercadoPagoCard.js";

const checkoutUrl = new URL("../src/pages/CheckoutPage.jsx", import.meta.url);

test("checkout mantém envio único e separa cartão de PIX", async () => {
  const source = await readFile(checkoutUrl, "utf8");
  assert.match(source, /<CardPaymentBrick/);
  assert.match(source, /const submitCard = useCallback/);
  assert.match(source, /const cardRequestRef = useRef\(null\)/);
  assert.match(source, /if \(cardRequestRef\.current\) return cardRequestRef\.current/);
  assert.match(source, /onApprovedRef\.current\?\.\(data\)/);
  assert.match(source, /Pagamento reiniciado pelo cliente/);
  assert.match(source, /onReady=\{handleCardReady\}/);
  assert.match(source, /payment\.type === "PIX"/);
  assert.doesNotMatch(source, /types:\s*\{\s*included:/);
});

const tick = () => new Promise((resolve) => setImmediate(resolve));
function setup(create) {
  const win = {
    setTimeout, clearTimeout,
    MercadoPago: class {
      constructor(key, options) { assert.equal(key, "PUBLIC_TEST"); assert.equal(options.locale, "pt-BR"); }
      bricks() { return { create }; }
    },
  };
  return { win, container: { id: "card-test", isConnected: true } };
}

test("cartão inicia Brick, sinaliza pronto e desmonta", async () => {
  let ready = 0;
  let unmounted = 0;
  const { win, container } = setup(async (type, id, settings) => {
    assert.equal(type, "cardPayment");
    assert.equal(id, "card-test");
    assert.equal(settings.initialization.amount, 35);
    settings.callbacks.onReady();
    return { unmount: () => { unmounted++; } };
  });
  const stop = mountMercadoPagoCard({ container, win, publicKey: "PUBLIC_TEST", amount: 35, payerEmail: "cliente@example.com", callbacks: { onReady: () => { ready++; }, onError: (error) => { throw error; }, onSubmit: () => {} } });
  await tick();
  assert.equal(ready, 1);
  stop();
  await tick();
  assert.equal(unmounted, 1);
});

test("rejeição real do SDK chega ao callback sem virar apenas timeout", async () => {
  const { win, container } = setup(async () => { throw new CardSetupError("CARD_TEST_FAILURE"); });
  let received;
  const stop = mountMercadoPagoCard({ container, win, publicKey: "PUBLIC_TEST", amount: 35, payerEmail: "cliente@example.com", callbacks: { onReady: () => {}, onError: (error) => { received = error; }, onSubmit: () => {} } });
  await tick();
  assert.equal(received?.code, "CARD_TEST_FAILURE");
  stop();
});

test("cartão pode ser montado novamente após sair e voltar do checkout", async () => {
  let mounted = 0;
  let unmounted = 0;
  const { win, container } = setup(async (_type, _id, settings) => {
    mounted++;
    settings.callbacks.onReady();
    return { unmount: () => { unmounted++; } };
  });
  const options = { container, win, publicKey: "PUBLIC_TEST", amount: 35, payerEmail: "cliente@example.com", callbacks: { onReady: () => {}, onError: (error) => { throw error; }, onSubmit: () => {} } };
  const stopFirst = mountMercadoPagoCard(options);
  await tick();
  stopFirst();
  const stopSecond = mountMercadoPagoCard(options);
  await tick();
  assert.equal(mounted, 2);
  assert.equal(unmounted, 1);
  stopSecond();
  await tick();
  assert.equal(unmounted, 2);
});

test("SDK compartilha o carregamento e permite tentar novamente após erro de rede", async () => {
  const scripts = [];
  const doc = {
    createElement() {
      const events = new Map();
      return {
        dataset: {}, events,
        addEventListener: (name, handler) => events.set(name, handler),
        removeEventListener: (name) => events.delete(name),
        remove() { this.removed = true; },
      };
    },
    addEventListener() {}, removeEventListener() {},
    head: { appendChild(script) { scripts.push(script); } },
  };
  const win = { setTimeout, clearTimeout };
  const first = loadMercadoPagoSdk(doc, win);
  assert.equal(loadMercadoPagoSdk(doc, win), first);
  assert.equal(scripts.length, 1);
  scripts[0].events.get("error")();
  await assert.rejects(first, { code: "CARD_SDK_LOAD_FAILED" });
  assert.equal(scripts[0].removed, true);
  const retry = loadMercadoPagoSdk(doc, win);
  assert.equal(scripts.length, 2);
  win.MercadoPago = class {};
  scripts[1].events.get("load")();
  assert.equal(await retry, win.MercadoPago);
});

test("remontagem aguarda a criação e desmontagem da tentativa anterior", async () => {
  let mounted = 0;
  let unmounted = 0;
  let resolveFirst;
  const { win, container } = setup(async (_type, _id, settings) => {
    mounted++;
    if (mounted === 1) return new Promise((resolve) => { resolveFirst = resolve; });
    settings.callbacks.onReady();
    return { unmount: () => { unmounted++; } };
  });
  const options = { container, win, publicKey: "PUBLIC_TEST", amount: 35, payerEmail: "cliente@example.com", callbacks: { onReady: () => {}, onError: (error) => { throw error; }, onSubmit: () => {} } };
  const stopFirst = mountMercadoPagoCard(options);
  await tick();
  stopFirst();
  const stopSecond = mountMercadoPagoCard(options);
  await tick();
  assert.equal(mounted, 1);
  resolveFirst({ unmount: () => { unmounted++; } });
  await tick();
  assert.equal(unmounted, 1);
  assert.equal(mounted, 2);
  stopSecond();
  await tick();
  assert.equal(unmounted, 2);
});
