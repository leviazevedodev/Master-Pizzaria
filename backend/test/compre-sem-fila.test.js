import assert from "node:assert/strict";
import test from "node:test";
import {
  createCompreSemFilaClient,
  flattenCompreSemFilaProducts,
  internalEan13,
  masterStatusToCompreSemFila,
  normalizeCompreSemFilaOrderDetails,
  normalizeCompreSemFilaOrderList,
  readCompreSemFilaConfig,
} from "../src/compre-sem-fila.js";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("configuração exige loja e chave e preserva o limite mínimo de vinte minutos", () => {
  const missing = readCompreSemFilaConfig({ CSF_ENABLED: "true" });
  assert.equal(missing.configured, false);
  assert.equal(missing.enabled, false);

  const configured = readCompreSemFilaConfig({
    CSF_ENABLED: "true",
    CSF_STORE_ID: "loja-1",
    CSF_API_KEY: "segredo",
    CSF_PRODUCT_SYNC_INTERVAL_MINUTES: "5",
  });
  assert.equal(configured.configured, true);
  assert.equal(configured.enabled, true);
  assert.equal(configured.productIntervalMs, 20 * 60_000);
});

test("cliente usa os headers e contratos documentados sem expor a chave no log externo", async () => {
  const calls = [];
  const config = readCompreSemFilaConfig({
    CSF_ENABLED: "true",
    CSF_STORE_ID: "12345",
    CSF_API_KEY: "123acb",
  });
  const client = createCompreSemFilaClient({
    config,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ Success: true });
    },
  });

  await client.updateOrderStatus(11721218, "preparing");
  await client.updateProducts([
    {
      CodigoBarras: "2990000000018",
      Nome: "Pizza",
      PrecoCheio: 30,
      PrecoFinal: 0,
      IsPromocao: false,
      Estoque: 10,
      CodigoInterno: "1",
    },
  ]);
  await client.sendSyncLog({ store_id: "12345", item_quantity: 1 });

  assert.equal(calls[0].url, "https://www.compresemfila.com.br/api/orders/patch/");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    pedido_id: 11721218,
    status: "preparing",
  });
  assert.equal(calls[0].options.headers["loja-id"], "12345");
  assert.equal(calls[0].options.headers.key, "123acb");
  assert.equal(
    calls[1].url,
    "https://www.compresemfila.com.br/api/update_produtos_v4",
  );
  assert.equal(calls[2].url, "https://integrator-logs.onrender.com/api/log-sync/");
  assert.equal(calls[2].options.headers.key, undefined);
  assert.equal(calls[2].options.headers["loja-id"], undefined);
});

test("normaliza a lista resumida de pedidos do envelope da API", () => {
  assert.deepEqual(
    normalizeCompreSemFilaOrderList({
      Success: true,
      ResponseDetail: {
        info: [
          { id: 5307865, status: "pending" },
          { pedido_id: "5307866", status: "accept" },
        ],
      },
    }).map(({ id, status }) => ({ id, status })),
    [
      { id: 5307865, status: "pending" },
      { id: 5307866, status: "accept" },
    ],
  );
});

test("só libera a importação quando o pedido possui os dados comerciais necessários", () => {
  const normalized = normalizeCompreSemFilaOrderDetails({
    ResponseDetail: {
      info: {
        pedido_id: 42,
        cliente: { nome: "Maria", telefone: "79999999999" },
        tipo_entrega: "entrega",
        forma_pagamento: "Pix",
        endereco: {
          rua: "Rua A",
          numero: "10",
          bairro: "Centro",
          cidade: "Aracaju",
          uf: "SE",
        },
        itens: [
          {
            external_id: 7,
            nome: "Pizza grande",
            quantidade: 2,
            preco_unitario: 35,
          },
        ],
        subtotal: 70,
        taxa_entrega: 5,
        total: 75,
      },
    },
  });
  assert.equal(normalized.ok, true);
  assert.equal(normalized.order.fulfillmentType, "DELIVERY");
  assert.equal(normalized.order.paymentMethod, "PIX");
  assert.equal(normalized.order.items[0].externalId, 7);

  const incomplete = normalizeCompreSemFilaOrderDetails({
    ResponseDetail: { info: { pedido_id: 43, status: "pending" } },
  });
  assert.equal(incomplete.ok, false);
  assert.ok(incomplete.issues.includes("Pedido sem itens."));
  assert.ok(incomplete.issues.includes("Forma de pagamento não reconhecida."));
});

test("mapeia o fluxo interno para os status aceitos pela CSF", () => {
  assert.equal(masterStatusToCompreSemFila("RECEIVED"), "accept");
  assert.equal(masterStatusToCompreSemFila("PREPARING"), "preparing");
  assert.equal(masterStatusToCompreSemFila("READY_FOR_PICKUP"), "ready");
  assert.equal(masterStatusToCompreSemFila("OUT_FOR_DELIVERY"), "retreat");
  assert.equal(masterStatusToCompreSemFila("DELIVERED"), "finalize");
  assert.equal(masterStatusToCompreSemFila("SERVED"), null);
});

test("gera código EAN-13 interno estável e encontra produtos em categorias", () => {
  const barcode = internalEan13(215);
  assert.match(barcode, /^\d{13}$/);
  assert.equal(internalEan13(215), barcode);
  assert.deepEqual(
    flattenCompreSemFilaProducts({
      categories: [
        {
          title: "Pizzas",
          items: [{ id: 89451, nome: "Calabresa", external_id: 215 }],
        },
      ],
    }).map(({ id, name, externalId }) => ({ id, name, externalId })),
    [{ id: 89451, name: "Calabresa", externalId: 215 }],
  );
});
