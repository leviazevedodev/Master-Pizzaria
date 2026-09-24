import {
  CompreSemFilaError,
  createCompreSemFilaClient,
  flattenCompreSemFilaProducts,
  internalEan13,
  masterStatusToCompreSemFila,
  normalizeCompreSemFilaOrderDetails,
  normalizeCompreSemFilaOrderList,
} from "./compre-sem-fila.js";

const PRODUCT_LOCK = "master-pizzaria:csf:products";
const ORDER_LOCK = "master-pizzaria:csf:orders";

function errorMessage(error) {
  return String(error?.message || error || "Erro desconhecido")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 800);
}

function responseSummary(payload) {
  try {
    const serialized = JSON.stringify(payload);
    return serialized.length <= 20_000
      ? payload
      : { truncated: true, preview: serialized.slice(0, 20_000) };
  } catch {
    return { unreadable: true };
  }
}

function promotionIsActive(promotion, now = new Date()) {
  return Boolean(
    promotion?.active &&
      (!promotion.startAt || new Date(promotion.startAt) <= now) &&
      (!promotion.endAt || new Date(promotion.endAt) >= now),
  );
}

function promotionSizePrice(promotion, sizeId) {
  if (!sizeId || !promotion?.sizePrices || Array.isArray(promotion.sizePrices))
    return null;
  const value = Number(promotion.sizePrices[sizeId]);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function variantKey(productId, sizeId) {
  return `${productId}:${sizeId || "base"}`;
}

function productPayload(link, config, now = new Date()) {
  const product = link.product;
  const productSize = link.sizeId
    ? product.productSizes.find((entry) => entry.sizeId === link.sizeId)
    : null;
  const fullPrice = Number(productSize?.price ?? product.price ?? 0);
  const promotionActive = promotionIsActive(product.promotion, now);
  const configuredPromo = promotionSizePrice(product.promotion, link.sizeId);
  const promoPrice = promotionActive
    ? Number(configuredPromo ?? product.promotion?.promoPrice ?? fullPrice)
    : 0;
  const active =
    product.available !== false &&
    !product.deletedAt &&
    (!product.pausedUntil || new Date(product.pausedUntil) <= now) &&
    (!link.size || link.size.active !== false);
  const stock = !active
    ? 0
    : product.stockTracked
      ? Math.max(0, Math.floor(Number(product.stockQuantity || 0)))
      : config.unlimitedStock;
  return {
    CodigoBarras: link.barcode || internalEan13(link.id),
    Nome: link.size?.name ? `${product.name} - ${link.size.name}` : product.name,
    PrecoCheio: Math.max(0, fullPrice),
    PrecoFinal:
      promotionActive && Number.isFinite(promoPrice) && promoPrice >= 0
        ? promoPrice
        : 0,
    IsPromocao: promotionActive,
    Estoque: stock,
    CodigoInterno: String(link.id),
  };
}

async function advisoryLock(prisma, name) {
  const rows = await prisma.$queryRawUnsafe(
    "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
    name,
  );
  return Boolean(rows?.[0]?.locked);
}

async function advisoryUnlock(prisma, name) {
  await prisma
    .$queryRawUnsafe("SELECT pg_advisory_unlock(hashtext($1))", name)
    .catch(() => {});
}

async function createRun(prisma, kind, source) {
  return prisma.compreSemFilaSyncRun.create({ data: { kind, source } });
}

async function finishRun(prisma, run, patch) {
  return prisma.compreSemFilaSyncRun.update({
    where: { id: run.id },
    data: { ...patch, completedAt: new Date() },
  });
}

export function createCompreSemFilaService({
  prisma,
  config,
  fetchImpl = globalThis.fetch,
  getSettings,
  writeTechnicalLog,
}) {
  const client = createCompreSemFilaClient({ config, fetchImpl });
  let productInProgress = false;
  let orderInProgress = false;
  let lastProductAttemptAt = 0;
  let lastOrderAttemptAt = 0;

  async function ensureProductLinks() {
    const products = await prisma.product.findMany({
      include: {
        productSizes: { include: { size: true } },
      },
    });
    const links = products.flatMap((product) => {
      const activeSizes = product.productSizes.filter(
        (entry) => entry.size?.active !== false,
      );
      const variants = activeSizes.length
        ? activeSizes.map((entry) => entry.sizeId)
        : [null];
      return variants.map((sizeId) => ({
        variantKey: variantKey(product.id, sizeId),
        productId: product.id,
        sizeId,
      }));
    });
    if (links.length)
      await prisma.compreSemFilaProductLink.createMany({
        data: links,
        skipDuplicates: true,
      });
    return links.length;
  }

  async function latestSuccessfulRun(kind) {
    return prisma.compreSemFilaSyncRun.findFirst({
      where: { kind, status: { in: ["SUCCESS", "PARTIAL"] } },
      orderBy: { completedAt: "desc" },
    });
  }

  async function assertProductInterval(source) {
    const latest = await latestSuccessfulRun("PRODUCTS");
    if (!latest?.completedAt) return;
    const nextAllowedAt = new Date(
      latest.completedAt.getTime() + config.productIntervalMs,
    );
    if (nextAllowedAt <= new Date()) return;
    throw new CompreSemFilaError(
      "A API v4 permite no máximo uma sincronização de produtos a cada 20 minutos.",
      {
        status: 429,
        code: source === "AUTO" ? "CSF_PRODUCT_SYNC_NOT_DUE" : "CSF_RATE_LIMITED",
        details: { nextAllowedAt },
      },
    );
  }

  async function syncProducts({ source = "MANUAL" } = {}) {
    if (!config.enabled)
      throw new CompreSemFilaError("A integração Compre Sem Fila está desativada.", {
        status: 503,
        code: "CSF_DISABLED",
      });
    if (productInProgress)
      throw new CompreSemFilaError("Já existe uma sincronização de produtos em andamento.", {
        status: 409,
        code: "CSF_SYNC_IN_PROGRESS",
      });
    await assertProductInterval(source);
    productInProgress = true;
    let locked = false;
    let run;
    try {
      locked = await advisoryLock(prisma, PRODUCT_LOCK);
      if (!locked)
        throw new CompreSemFilaError(
          "Outra instância já está sincronizando os produtos.",
          { status: 409, code: "CSF_SYNC_IN_PROGRESS" },
        );
      await assertProductInterval(source);
      run = await createRun(prisma, "PRODUCTS", source);
      await ensureProductLinks();
      const links = await prisma.compreSemFilaProductLink.findMany({
        where: { enabled: true },
        include: {
          size: true,
          product: { include: { promotion: true, productSizes: true } },
        },
        orderBy: { id: "asc" },
      });
      const payload = links.map((link) => productPayload(link, config));
      const providerResponse = await client.updateProducts(payload);
      const syncedAt = new Date();
      if (links.length)
        await prisma.compreSemFilaProductLink.updateMany({
          where: { id: { in: links.map((link) => link.id) } },
          data: { lastSyncedAt: syncedAt, lastSyncError: null },
        });

      let logError = null;
      if (config.logSyncEnabled) {
        try {
          const settings = await getSettings?.();
          await client.sendSyncLog({
            store_id: config.storeId,
            pharmacy: settings?.storeName || "Master Pizzaria",
            city: settings?.address || "",
            version: "v4",
            type_access: "API",
            system: "Master Pizzaria",
            item_quantity: payload.length,
          });
        } catch (error) {
          logError = errorMessage(error);
          await writeTechnicalLog?.("CSF_LOG_SYNC_ERROR", error);
        }
      }
      return finishRun(prisma, run, {
        status: logError ? "PARTIAL" : "SUCCESS",
        processed: payload.length,
        succeeded: payload.length,
        failed: 0,
        details: {
          providerResponse: responseSummary(providerResponse),
          ...(logError ? { logError } : {}),
        },
      });
    } catch (error) {
      if (run)
        await finishRun(prisma, run, {
          status: "FAILED",
          failed: 1,
          error: errorMessage(error),
          details: responseSummary(error?.details),
        }).catch(() => {});
      await writeTechnicalLog?.("CSF_PRODUCT_SYNC_ERROR", error);
      throw error;
    } finally {
      if (locked) await advisoryUnlock(prisma, PRODUCT_LOCK);
      productInProgress = false;
      lastProductAttemptAt = Date.now();
    }
  }

  async function resolveOrderItems(items) {
    const resolved = [];
    const issues = [];
    for (const item of items) {
      const link = item.externalId
        ? await prisma.compreSemFilaProductLink.findUnique({
            where: { id: item.externalId },
            include: { product: true, size: true },
          })
        : await prisma.compreSemFilaProductLink.findUnique({
            where: { csfProductId: item.csfProductId },
            include: { product: true, size: true },
          });
      if (!link || !link.enabled || link.product.deletedAt) {
        issues.push(
          `Produto ${item.externalId || item.csfProductId || "sem ID"} não está vinculado.`,
        );
        continue;
      }
      resolved.push({ item, link });
    }
    return { resolved, issues };
  }

  async function importOrder(summary) {
    const detailsPayload = await client.getOrder(summary.id);
    const normalized = normalizeCompreSemFilaOrderDetails(
      detailsPayload,
      summary.id,
    );
    const baseUpdate = {
      csfStatus: summary.status,
      payload: responseSummary(detailsPayload),
      lastPulledAt: new Date(),
    };
    if (!normalized.ok) {
      const message = normalized.issues.join(" ").slice(0, 800);
      await prisma.compreSemFilaOrder.upsert({
        where: { csfOrderId: summary.id },
        update: { ...baseUpdate, mappingStatus: "AWAITING_MAPPING", lastError: message },
        create: {
          csfOrderId: summary.id,
          ...baseUpdate,
          mappingStatus: "AWAITING_MAPPING",
          lastError: message,
        },
      });
      return { imported: false, error: message };
    }
    const existing = await prisma.compreSemFilaOrder.findUnique({
      where: { csfOrderId: summary.id },
    });
    if (existing?.orderId) {
      await prisma.compreSemFilaOrder.update({
        where: { csfOrderId: summary.id },
        data: { ...baseUpdate, mappingStatus: "IMPORTED", lastError: null },
      });
      return { imported: false, existing: true, orderId: existing.orderId };
    }
    const itemResolution = await resolveOrderItems(normalized.order.items);
    if (itemResolution.issues.length) {
      const message = itemResolution.issues.join(" ").slice(0, 800);
      await prisma.compreSemFilaOrder.upsert({
        where: { csfOrderId: summary.id },
        update: { ...baseUpdate, mappingStatus: "AWAITING_PRODUCTS", lastError: message },
        create: {
          csfOrderId: summary.id,
          ...baseUpdate,
          mappingStatus: "AWAITING_PRODUCTS",
          lastError: message,
        },
      });
      return { imported: false, error: message };
    }
    const row = normalized.order;
    const order = await prisma.$transaction(async (tx) => {
      const mapping = await tx.compreSemFilaOrder.upsert({
        where: { csfOrderId: summary.id },
        update: baseUpdate,
        create: { csfOrderId: summary.id, ...baseUpdate },
      });
      if (mapping.orderId) return tx.order.findUnique({ where: { id: mapping.orderId } });
      const created = await tx.order.create({
        data: {
          customerName: row.customerName,
          customerPhone: row.customerPhone,
          fulfillmentType: row.fulfillmentType,
          postalCode: row.fulfillmentType === "DELIVERY" ? row.address.postalCode || null : null,
          street: row.fulfillmentType === "DELIVERY" ? row.address.street : null,
          addressNumber: row.fulfillmentType === "DELIVERY" ? row.address.number : null,
          complement: row.fulfillmentType === "DELIVERY" ? row.address.complement || null : null,
          neighborhood: row.fulfillmentType === "DELIVERY" ? row.address.neighborhood : null,
          city: row.fulfillmentType === "DELIVERY" ? row.address.city : null,
          state: row.fulfillmentType === "DELIVERY" ? row.address.state || null : null,
          referencePoint:
            row.fulfillmentType === "DELIVERY" ? row.address.referencePoint || null : null,
          notes: row.notes || null,
          subtotal: row.subtotal,
          deliveryFee: row.deliveryFee,
          total: row.total,
          orderOrigin: "COMPRE_SEM_FILA",
          paymentMethod: row.paymentMethod,
          paymentMethodLabel: row.paymentMethodLabel || "Compre Sem Fila",
          paymentStatus: "CASH_PENDING",
          status: "RECEIVED",
          acceptedAt: new Date(),
          items: {
            create: itemResolution.resolved.map(({ item, link }) => ({
              productId: link.productId,
              name: item.name || link.product.name,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              notes: item.notes || null,
              sizeId: link.sizeId || null,
              sizeName: link.size?.name || null,
              sizePrice: link.sizeId ? item.unitPrice : null,
            })),
          },
          history: {
            create: {
              status: "RECEIVED",
              changedByName: "Compre Sem Fila",
              changedByRole: "INTEGRATION",
            },
          },
        },
      });
      await tx.compreSemFilaOrder.update({
        where: { id: mapping.id },
        data: {
          orderId: created.id,
          mappingStatus: "IMPORTED",
          lastError: null,
        },
      });
      return created;
    });
    try {
      await client.updateOrderStatus(summary.id, "accept");
      await prisma.compreSemFilaOrder.update({
        where: { csfOrderId: summary.id },
        data: { csfStatus: "accept", lastPushedAt: new Date(), lastError: null },
      });
    } catch (error) {
      await prisma.compreSemFilaOrder.update({
        where: { csfOrderId: summary.id },
        data: { lastError: errorMessage(error) },
      });
    }
    return { imported: true, orderId: order.id };
  }

  async function syncOrders({ source = "MANUAL" } = {}) {
    if (!config.enabled)
      throw new CompreSemFilaError("A integração Compre Sem Fila está desativada.", {
        status: 503,
        code: "CSF_DISABLED",
      });
    if (orderInProgress)
      throw new CompreSemFilaError("Já existe uma consulta de pedidos em andamento.", {
        status: 409,
        code: "CSF_SYNC_IN_PROGRESS",
      });
    orderInProgress = true;
    let locked = false;
    let run;
    try {
      locked = await advisoryLock(prisma, ORDER_LOCK);
      if (!locked)
        throw new CompreSemFilaError("Outra instância já está consultando os pedidos.", {
          status: 409,
          code: "CSF_SYNC_IN_PROGRESS",
        });
      run = await createRun(prisma, "ORDERS", source);
      const providerResponse = await client.listOrders();
      const orders = normalizeCompreSemFilaOrderList(providerResponse);
      let succeeded = 0;
      let failed = 0;
      const failures = [];
      for (const summary of orders) {
        if (["finalize", "cancel"].includes(summary.status)) {
          await prisma.compreSemFilaOrder.upsert({
            where: { csfOrderId: summary.id },
            update: {
              csfStatus: summary.status,
              payload: summary.raw,
              lastPulledAt: new Date(),
            },
            create: {
              csfOrderId: summary.id,
              csfStatus: summary.status,
              payload: summary.raw,
              lastPulledAt: new Date(),
              mappingStatus: "CLOSED_EXTERNALLY",
            },
          });
          succeeded += 1;
          continue;
        }
        try {
          const result = await importOrder(summary);
          if (result.error) {
            failed += 1;
            failures.push({ orderId: summary.id, error: result.error });
          } else succeeded += 1;
        } catch (error) {
          failed += 1;
          failures.push({ orderId: summary.id, error: errorMessage(error) });
          await prisma.compreSemFilaOrder.upsert({
            where: { csfOrderId: summary.id },
            update: {
              csfStatus: summary.status,
              payload: summary.raw,
              lastPulledAt: new Date(),
              mappingStatus: "ERROR",
              lastError: errorMessage(error),
            },
            create: {
              csfOrderId: summary.id,
              csfStatus: summary.status,
              payload: summary.raw,
              lastPulledAt: new Date(),
              mappingStatus: "ERROR",
              lastError: errorMessage(error),
            },
          });
        }
      }
      return finishRun(prisma, run, {
        status: failed ? (succeeded ? "PARTIAL" : "FAILED") : "SUCCESS",
        processed: orders.length,
        succeeded,
        failed,
        details: {
          failures: failures.slice(0, 100),
          providerOrderCount: orders.length,
        },
      });
    } catch (error) {
      if (run)
        await finishRun(prisma, run, {
          status: "FAILED",
          failed: 1,
          error: errorMessage(error),
          details: responseSummary(error?.details),
        }).catch(() => {});
      await writeTechnicalLog?.("CSF_ORDER_SYNC_ERROR", error);
      throw error;
    } finally {
      if (locked) await advisoryUnlock(prisma, ORDER_LOCK);
      orderInProgress = false;
      lastOrderAttemptAt = Date.now();
    }
  }

  async function pushOrderStatus(order) {
    if (!config.enabled || !config.orderSyncEnabled || !order?.id) return null;
    const mapping = await prisma.compreSemFilaOrder.findUnique({
      where: { orderId: order.id },
    });
    const status = masterStatusToCompreSemFila(order.status);
    if (!mapping || !status || mapping.csfStatus === status) return null;
    try {
      const result = await client.updateOrderStatus(mapping.csfOrderId, status);
      await prisma.compreSemFilaOrder.update({
        where: { id: mapping.id },
        data: { csfStatus: status, lastPushedAt: new Date(), lastError: null },
      });
      return result;
    } catch (error) {
      await prisma.compreSemFilaOrder.update({
        where: { id: mapping.id },
        data: { lastError: errorMessage(error) },
      });
      await writeTechnicalLog?.("CSF_STATUS_SYNC_ERROR", error, {
        orderId: order.id,
        csfOrderId: mapping.csfOrderId,
        status,
      });
      return null;
    }
  }

  async function providerProducts() {
    const payload = await client.listProducts();
    return flattenCompreSemFilaProducts(payload);
  }

  async function linkProviderProduct(linkId, csfProductId) {
    const id = Number(linkId);
    const providerId = Number(csfProductId);
    if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(providerId) || providerId < 1)
      throw new CompreSemFilaError("Informe IDs válidos para vincular o produto.", {
        status: 400,
        code: "CSF_INVALID_PRODUCT_LINK",
      });
    const link = await prisma.compreSemFilaProductLink.findUnique({
      where: { id },
    });
    if (!link)
      throw new CompreSemFilaError("Vínculo interno de produto não encontrado.", {
        status: 404,
        code: "CSF_PRODUCT_LINK_NOT_FOUND",
      });
    const conflict = await prisma.compreSemFilaProductLink.findFirst({
      where: { csfProductId: providerId, id: { not: id } },
    });
    if (conflict)
      throw new CompreSemFilaError("Esse produto do Compre Sem Fila já está vinculado.", {
        status: 409,
        code: "CSF_PRODUCT_ALREADY_LINKED",
      });
    await client.linkProduct(providerId, id);
    return prisma.compreSemFilaProductLink.update({
      where: { id },
      data: { csfProductId: providerId, lastSyncError: null },
      include: { product: true, size: true },
    });
  }

  async function updateProductLink(linkId, patch) {
    const id = Number(linkId);
    if (!Number.isSafeInteger(id) || id < 1)
      throw new CompreSemFilaError("Vínculo de produto inválido.", {
        status: 400,
        code: "CSF_INVALID_PRODUCT_LINK",
      });
    const data = {};
    if (patch?.enabled !== undefined) data.enabled = Boolean(patch.enabled);
    if (patch?.barcode !== undefined) {
      const barcode = String(patch.barcode || "").replace(/\s+/g, "").trim();
      if (barcode && !/^[A-Za-z0-9._-]{3,64}$/.test(barcode))
        throw new CompreSemFilaError("Código de barras inválido.", {
          status: 400,
          code: "CSF_INVALID_BARCODE",
        });
      data.barcode = barcode || null;
    }
    return prisma.compreSemFilaProductLink.update({
      where: { id },
      data,
      include: { product: true, size: true },
    });
  }

  async function status() {
    const [latestRuns, linkCount, linkedCount, pendingOrders, recentOrders] =
      await Promise.all([
        prisma.compreSemFilaSyncRun.findMany({
          orderBy: { startedAt: "desc" },
          take: 12,
        }),
        prisma.compreSemFilaProductLink.count(),
        prisma.compreSemFilaProductLink.count({
          where: { csfProductId: { not: null } },
        }),
        prisma.compreSemFilaOrder.count({
          where: { mappingStatus: { in: ["PENDING", "AWAITING_MAPPING", "AWAITING_PRODUCTS", "ERROR"] } },
        }),
        prisma.compreSemFilaOrder.findMany({
          orderBy: { updatedAt: "desc" },
          take: 20,
          include: { order: { select: { id: true, status: true, customerName: true } } },
        }),
      ]);
    const latestProductRun = latestRuns.find(
      (run) => run.kind === "PRODUCTS" && ["SUCCESS", "PARTIAL"].includes(run.status),
    );
    return {
      configured: config.configured,
      enabled: config.enabled,
      productSyncEnabled: config.productSyncEnabled,
      orderSyncEnabled: config.orderSyncEnabled,
      logSyncEnabled: config.logSyncEnabled,
      storeId: config.storeId ? `${config.storeId.slice(0, 3)}***` : "",
      productIntervalMinutes: config.productIntervalMs / 60_000,
      orderIntervalSeconds: config.orderIntervalMs / 1_000,
      nextProductSyncAt: latestProductRun?.completedAt
        ? new Date(latestProductRun.completedAt.getTime() + config.productIntervalMs)
        : null,
      products: { total: linkCount, linked: linkedCount },
      pendingOrders,
      latestRuns,
      recentOrders,
      inProgress: { products: productInProgress, orders: orderInProgress },
    };
  }

  async function productLinks() {
    await ensureProductLinks();
    const rows = await prisma.compreSemFilaProductLink.findMany({
      include: { product: true, size: true },
      orderBy: [{ product: { name: "asc" } }, { id: "asc" }],
    });
    return rows.map((row) => ({
      ...row,
      effectiveBarcode: row.barcode || internalEan13(row.id),
      product: {
        id: row.product.id,
        name: row.product.name,
        available: row.product.available,
        deletedAt: row.product.deletedAt,
      },
    }));
  }

  async function runScheduledSyncs() {
    if (!config.enabled) return;
    const now = Date.now();
    if (
      config.productSyncEnabled &&
      !productInProgress &&
      now - lastProductAttemptAt >= config.productIntervalMs
    ) {
      lastProductAttemptAt = now;
      syncProducts({ source: "AUTO" }).catch((error) => {
        if (error?.code !== "CSF_PRODUCT_SYNC_NOT_DUE")
          writeTechnicalLog?.("CSF_PRODUCT_SYNC_ERROR", error);
      });
    }
    if (
      config.orderSyncEnabled &&
      !orderInProgress &&
      now - lastOrderAttemptAt >= config.orderIntervalMs
    ) {
      lastOrderAttemptAt = now;
      syncOrders({ source: "AUTO" }).catch((error) =>
        writeTechnicalLog?.("CSF_ORDER_SYNC_ERROR", error),
      );
    }
  }

  return {
    config,
    linkProviderProduct,
    productLinks,
    providerProducts,
    pushOrderStatus,
    runScheduledSyncs,
    status,
    syncOrders,
    syncProducts,
    updateProductLink,
  };
}

function routeError(res, error) {
  const status = Number(error?.status);
  res.status(Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500).json({
    message: errorMessage(error),
    code: error?.code || "CSF_INTEGRATION_ERROR",
    ...(error?.details ? { details: error.details } : {}),
  });
}

export function registerCompreSemFilaAdminRoutes({ app, auth, admin, service }) {
  app.get("/api/admin/compre-sem-fila/status", auth, admin, async (_req, res) => {
    try {
      res.json(await service.status());
    } catch (error) {
      routeError(res, error);
    }
  });
  app.get("/api/admin/compre-sem-fila/products", auth, admin, async (_req, res) => {
    try {
      res.json(await service.productLinks());
    } catch (error) {
      routeError(res, error);
    }
  });
  app.get(
    "/api/admin/compre-sem-fila/provider-products",
    auth,
    admin,
    async (_req, res) => {
      try {
        res.json(await service.providerProducts());
      } catch (error) {
        routeError(res, error);
      }
    },
  );
  app.patch(
    "/api/admin/compre-sem-fila/products/:id",
    auth,
    admin,
    async (req, res) => {
      try {
        res.json(await service.updateProductLink(req.params.id, req.body));
      } catch (error) {
        routeError(res, error);
      }
    },
  );
  app.post(
    "/api/admin/compre-sem-fila/products/:id/link",
    auth,
    admin,
    async (req, res) => {
      try {
        res.json(
          await service.linkProviderProduct(req.params.id, req.body?.csfProductId),
        );
      } catch (error) {
        routeError(res, error);
      }
    },
  );
  app.post(
    "/api/admin/compre-sem-fila/products/sync",
    auth,
    admin,
    async (_req, res) => {
      try {
        res.json(await service.syncProducts({ source: "MANUAL" }));
      } catch (error) {
        routeError(res, error);
      }
    },
  );
  app.post(
    "/api/admin/compre-sem-fila/orders/sync",
    auth,
    admin,
    async (_req, res) => {
      try {
        res.json(await service.syncOrders({ source: "MANUAL" }));
      } catch (error) {
        routeError(res, error);
      }
    },
  );
}
