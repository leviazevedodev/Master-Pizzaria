const DEFAULT_BASE_URL = "https://www.compresemfila.com.br";
const DEFAULT_LOG_URL = "https://integrator-logs.onrender.com/api/log-sync/";

const truthy = new Set(["1", "true", "yes", "sim", "on"]);
const falsey = new Set(["0", "false", "no", "nao", "não", "off", ""]);

function envBoolean(value, fallback = false) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (truthy.has(normalized)) return true;
  if (falsey.has(normalized)) return false;
  return fallback;
}

function boundedNumber(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max
    ? parsed
    : fallback;
}

function httpsUrl(value, fallback) {
  try {
    const url = new URL(String(value || fallback));
    if (url.protocol !== "https:" || url.username || url.password) throw new Error();
    return url.href.replace(/\/$/, "");
  } catch {
    return fallback.replace(/\/$/, "");
  }
}

export function readCompreSemFilaConfig(env = process.env) {
  const storeId = String(env.CSF_STORE_ID || "").trim();
  const apiKey = String(env.CSF_API_KEY || "").trim();
  const configured = Boolean(storeId && apiKey);
  return {
    storeId,
    apiKey,
    configured,
    enabled: configured && envBoolean(env.CSF_ENABLED, false),
    productSyncEnabled: envBoolean(env.CSF_PRODUCT_SYNC_ENABLED, false),
    orderSyncEnabled: envBoolean(env.CSF_ORDER_SYNC_ENABLED, false),
    logSyncEnabled: envBoolean(env.CSF_LOG_SYNC_ENABLED, false),
    baseUrl: httpsUrl(env.CSF_BASE_URL, DEFAULT_BASE_URL),
    logUrl: `${httpsUrl(env.CSF_LOG_URL, DEFAULT_LOG_URL)}/`,
    timeoutMs: Math.round(
      boundedNumber(env.CSF_TIMEOUT_MS, 15_000, 1_000, 60_000),
    ),
    productIntervalMs:
      Math.round(
        boundedNumber(env.CSF_PRODUCT_SYNC_INTERVAL_MINUTES, 20, 20, 1440),
      ) * 60_000,
    orderIntervalMs:
      Math.round(
        boundedNumber(env.CSF_ORDER_SYNC_INTERVAL_SECONDS, 60, 30, 3600),
      ) * 1_000,
    unlimitedStock: Math.round(
      boundedNumber(env.CSF_UNLIMITED_STOCK, 999, 1, 999_999),
    ),
  };
}

export class CompreSemFilaError extends Error {
  constructor(message, { status = 502, code = "CSF_REQUEST_FAILED", details } = {}) {
    super(message);
    this.name = "CompreSemFilaError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function providerMessage(payload, fallback) {
  const candidate =
    payload?.ResponseDetail?.Message ||
    payload?.ResponseDetail?.message ||
    payload?.message ||
    payload?.Message ||
    payload?.error;
  return String(candidate || fallback || "Falha na comunicação com o Compre Sem Fila")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 2_000) };
  }
}

export function createCompreSemFilaClient({
  config,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!config) throw new TypeError("A configuração do Compre Sem Fila é obrigatória.");
  if (typeof fetchImpl !== "function") throw new TypeError("fetch não está disponível.");

  async function request(
    path,
    { method = "GET", body, absoluteUrl, authenticate = true } = {},
  ) {
    if (!config.configured)
      throw new CompreSemFilaError(
        "Configure CSF_STORE_ID e CSF_API_KEY antes de usar a integração.",
        { status: 503, code: "CSF_NOT_CONFIGURED" },
      );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    timer.unref?.();
    try {
      const response = await fetchImpl(
        absoluteUrl || new URL(path, `${config.baseUrl}/`).href,
        {
          method,
          signal: controller.signal,
          headers: {
            ...(authenticate
              ? { "loja-id": config.storeId, key: config.apiKey }
              : {}),
            Accept: "application/json",
            ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        },
      );
      const payload = await parseResponse(response);
      if (!response.ok)
        throw new CompreSemFilaError(providerMessage(payload), {
          status: response.status,
          code:
            response.status === 429
              ? "CSF_RATE_LIMITED"
              : response.status === 403
                ? "CSF_INVALID_CREDENTIALS"
                : "CSF_REQUEST_FAILED",
          details: payload,
        });
      return payload;
    } catch (error) {
      if (error instanceof CompreSemFilaError) throw error;
      if (error?.name === "AbortError")
        throw new CompreSemFilaError("O Compre Sem Fila excedeu o tempo de resposta.", {
          status: 504,
          code: "CSF_TIMEOUT",
        });
      throw new CompreSemFilaError("Não foi possível acessar o Compre Sem Fila.", {
        status: 502,
        code: "CSF_UNAVAILABLE",
      });
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    listOrders: () => request("api/orders/list/"),
    getOrder: (orderId) =>
      request(`api/orders/get/?pedido_id=${encodeURIComponent(orderId)}`),
    updateOrderStatus: (orderId, status) =>
      request("api/orders/patch/", {
        method: "PATCH",
        body: { pedido_id: Number(orderId), status },
      }),
    listProducts: () => request("api/products/list/"),
    linkProduct: (productId, externalId) =>
      request("api/products/patch/", {
        method: "PATCH",
        body: { product_id: Number(productId), external_id: Number(externalId) },
      }),
    updateProducts: (products) =>
      request("api/update_produtos_v4", {
        method: "POST",
        body: { products },
      }),
    sendSyncLog: (payload) =>
      request("", {
        method: "POST",
        body: payload,
        absoluteUrl: config.logUrl,
        authenticate: false,
      }),
  };
}

export function unwrapCompreSemFilaInfo(payload) {
  const value =
    payload?.ResponseDetail?.info ??
    payload?.responseDetail?.info ??
    payload?.ResponseDetail ??
    payload?.responseDetail ??
    payload?.info ??
    payload;
  return Array.isArray(value) && value.length === 1 ? value[0] : value;
}

function firstValue(source, paths) {
  for (const path of paths) {
    let current = source;
    for (const part of path.split(".")) current = current?.[part];
    if (current !== undefined && current !== null && current !== "") return current;
  }
  return undefined;
}

function integer(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function money(value) {
  if (typeof value === "string") value = value.replace(",", ".");
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : null;
}

function text(value, max = 220) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function normalizeCompreSemFilaOrderList(payload) {
  const info = unwrapCompreSemFilaInfo(payload);
  const rows = Array.isArray(info)
    ? info
    : Array.isArray(info?.orders)
      ? info.orders
      : Array.isArray(info?.pedidos)
        ? info.pedidos
        : [];
  return rows
    .map((row) => ({
      id: integer(firstValue(row, ["id", "pedido_id", "pedidoId", "order_id"])),
      status: text(firstValue(row, ["status", "Status"]), 40).toLowerCase(),
      raw: row,
    }))
    .filter((row) => row.id && row.status);
}

function normalizedFulfillment(value) {
  const normalized = text(value, 80).toLowerCase();
  if (/retir|pickup|balc[aã]o/.test(normalized)) return "PICKUP";
  if (/entrega|delivery|deliver/.test(normalized)) return "DELIVERY";
  return null;
}

function normalizedPayment(value) {
  const normalized = text(value, 80).toLowerCase();
  if (/dinheiro|cash/.test(normalized)) return "CASH";
  if (/pix/.test(normalized)) return "PIX";
  if (/d[eé]bito|debit/.test(normalized)) return "DEBIT";
  if (/cr[eé]dito|credit|cart[aã]o|card/.test(normalized)) return "CREDIT";
  return null;
}

export function normalizeCompreSemFilaOrderDetails(payload, fallbackId) {
  const info = unwrapCompreSemFilaInfo(payload);
  const source = Array.isArray(info) ? info[0] : info;
  if (!source || typeof source !== "object")
    return { ok: false, issues: ["Resposta sem objeto de pedido."], raw: source };

  const orderId =
    integer(firstValue(source, ["id", "pedido_id", "pedidoId", "order_id"])) ||
    integer(fallbackId);
  const customerName = text(
    firstValue(source, [
      "customer.name",
      "cliente.nome",
      "customer_name",
      "customerName",
      "nome_cliente",
      "nome",
    ]),
  );
  const customerPhone = text(
    firstValue(source, [
      "customer.phone",
      "cliente.telefone",
      "customer_phone",
      "customerPhone",
      "telefone",
      "phone",
    ]),
    40,
  );
  const fulfillmentType = normalizedFulfillment(
    firstValue(source, [
      "fulfillment_type",
      "fulfillmentType",
      "tipo_entrega",
      "delivery_type",
      "tipo",
    ]),
  );
  const paymentRaw = firstValue(source, [
    "payment.method",
    "pagamento.forma",
    "payment_method",
    "paymentMethod",
    "forma_pagamento",
  ]);
  const paymentMethod = normalizedPayment(paymentRaw);
  const rawItems = firstValue(source, ["items", "itens", "products", "produtos"]);
  const items = (Array.isArray(rawItems) ? rawItems : []).map((item) => ({
    externalId: integer(
      firstValue(item, [
        "external_id",
        "externalId",
        "CodigoInterno",
        "codigoInterno",
        "codigo_interno",
      ]),
    ),
    csfProductId: integer(
      firstValue(item, ["product_id", "productId", "produto_id", "id"]),
    ),
    name: text(firstValue(item, ["name", "nome", "Nome"])),
    quantity: integer(firstValue(item, ["quantity", "quantidade", "qtd"])) || 1,
    unitPrice: money(
      firstValue(item, [
        "unit_price",
        "unitPrice",
        "preco_unitario",
        "preco",
        "price",
      ]),
    ),
    notes: text(firstValue(item, ["notes", "observacao", "observacoes"]), 500),
    raw: item,
  }));
  const subtotal = money(firstValue(source, ["subtotal", "sub_total"]));
  const deliveryFee =
    money(firstValue(source, ["delivery_fee", "deliveryFee", "taxa_entrega", "frete"])) ??
    0;
  const total = money(firstValue(source, ["total", "valor_total", "total_value"]));
  const address = firstValue(source, ["address", "endereco"]) || source;
  const normalizedAddress = {
    postalCode: text(firstValue(address, ["postal_code", "postalCode", "cep"]), 16),
    street: text(firstValue(address, ["street", "rua", "logradouro"])),
    number: text(firstValue(address, ["number", "numero", "address_number"]), 40),
    complement: text(firstValue(address, ["complement", "complemento"])),
    neighborhood: text(firstValue(address, ["neighborhood", "bairro"])),
    city: text(firstValue(address, ["city", "cidade"])),
    state: text(firstValue(address, ["state", "uf", "estado"]), 40),
    referencePoint: text(
      firstValue(address, ["reference_point", "referencePoint", "referencia"]),
    ),
  };
  const issues = [];
  if (!orderId) issues.push("ID do pedido ausente ou inválido.");
  if (!customerName) issues.push("Nome do cliente ausente.");
  if (!customerPhone) issues.push("Telefone do cliente ausente.");
  if (!fulfillmentType) issues.push("Tipo de entrega ou retirada não reconhecido.");
  if (!paymentMethod) issues.push("Forma de pagamento não reconhecida.");
  if (!items.length) issues.push("Pedido sem itens.");
  if (items.some((item) => !item.externalId && !item.csfProductId))
    issues.push("Há item sem identificador de produto.");
  if (items.some((item) => item.unitPrice == null))
    issues.push("Há item sem preço unitário.");
  if (total == null) issues.push("Total do pedido ausente.");
  if (fulfillmentType === "DELIVERY") {
    if (!normalizedAddress.street) issues.push("Rua de entrega ausente.");
    if (!normalizedAddress.number) issues.push("Número do endereço ausente.");
    if (!normalizedAddress.neighborhood) issues.push("Bairro ausente.");
    if (!normalizedAddress.city) issues.push("Cidade ausente.");
  }
  return {
    ok: issues.length === 0,
    issues,
    order: {
      orderId,
      customerName,
      customerPhone,
      fulfillmentType,
      paymentMethod,
      paymentMethodLabel: text(paymentRaw, 80),
      subtotal: subtotal ?? Math.max(0, Number(total || 0) - deliveryFee),
      deliveryFee,
      total,
      notes: text(firstValue(source, ["notes", "observacao", "observacoes"]), 1000),
      address: normalizedAddress,
      items,
    },
    raw: source,
  };
}

export function masterStatusToCompreSemFila(status) {
  return (
    {
      RECEIVED: "accept",
      PREPARING: "preparing",
      READY_FOR_DELIVERY: "ready",
      READY_FOR_PICKUP: "ready",
      OUT_FOR_DELIVERY: "retreat",
      DELIVERED: "finalize",
      CANCELED: "cancel",
    }[String(status || "").toUpperCase()] || null
  );
}

export function internalEan13(id) {
  const digits = String(Math.max(0, Number(id) || 0)).replace(/\D/g, "").slice(-9);
  const base = `299${digits.padStart(9, "0")}`;
  const sum = [...base].reduce(
    (total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3),
    0,
  );
  return `${base}${(10 - (sum % 10)) % 10}`;
}

export function flattenCompreSemFilaProducts(payload) {
  const result = [];
  const seen = new Set();
  function visit(value) {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object") return;
    const id = integer(firstValue(value, ["id", "product_id", "productId", "produto_id"]));
    if (id && !seen.has(id)) {
      seen.add(id);
      result.push({
        id,
        name: text(firstValue(value, ["name", "nome", "title", "Nome"])),
        externalId: integer(
          firstValue(value, [
            "external_id",
            "externalId",
            "CodigoInterno",
            "codigoInterno",
          ]),
        ),
        raw: value,
      });
    }
    for (const child of Object.values(value))
      if (child && typeof child === "object") visit(child);
  }
  visit(unwrapCompreSemFilaInfo(payload));
  return result;
}
