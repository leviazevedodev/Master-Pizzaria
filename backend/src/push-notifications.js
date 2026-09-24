import webPush from "web-push";
import { cleanText } from "./sanitization.js";
import { customerVisibleStatus } from "./customer-order.js";

const STATUS_LABELS = {
  SCHEDULED: "foi agendado",
  RECEIVED: "foi recebido pela loja",
  PREPARING: "está em preparação",
  READY_FOR_DELIVERY: "está pronto para entrega",
  OUT_FOR_DELIVERY: "saiu para entrega",
  READY_FOR_PICKUP: "está pronto para retirada",
  READY_FOR_TABLE: "está pronto para servir",
  SERVED: "foi servido",
  DELIVERED: "foi concluído",
  CANCELED: "foi cancelado",
};

export function readWebPushConfig(env = process.env) {
  const publicKey = String(env.WEB_PUSH_PUBLIC_KEY || "").trim();
  const privateKey = String(env.WEB_PUSH_PRIVATE_KEY || "").trim();
  const subject = String(env.WEB_PUSH_SUBJECT || "").trim();
  const configured = Boolean(
    publicKey &&
      privateKey &&
      /^(mailto:|https:\/\/)/i.test(subject),
  );
  return { publicKey, privateKey, subject, configured };
}

export function normalizePushSubscription(value) {
  const endpoint = cleanText(value?.endpoint, 2000);
  const p256dh = cleanText(value?.keys?.p256dh, 300);
  const auth = cleanText(value?.keys?.auth, 200);
  try {
    const url = new URL(endpoint);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !p256dh ||
      !auth
    )
      return null;
  } catch {
    return null;
  }
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(p256dh) || !/^[A-Za-z0-9_-]+={0,2}$/.test(auth))
    return null;
  return { endpoint, p256dh, auth };
}

export function buildOrderPushPayload(order, storeName = "Pizzaria") {
  const shortCode = cleanText(order?.shortCode, 20) || "";
  const status = cleanText(order?.status, 40).toUpperCase();
  const trackingCode = cleanText(order?.trackingCode, 100);
  return {
    title: `${cleanText(storeName, 80) || "Pizzaria"} · pedido #${shortCode}`,
    body: `Seu pedido ${STATUS_LABELS[status] || "teve o status atualizado"}.`,
    tag: `master-pizzaria-order-${trackingCode || order?.id || "status"}`,
    data: {
      url: trackingCode ? `/pedido/${encodeURIComponent(trackingCode)}` : "/seus-pedidos",
    },
  };
}

export function createPushNotificationService({
  prisma,
  config,
  getSettings,
  writeTechnicalLog,
}) {
  if (config.configured)
    webPush.setVapidDetails(config.subject, config.publicKey, config.privateKey);

  async function saveSubscription({ subscription, trackingCodes, userAgent }) {
    const normalized = normalizePushSubscription(subscription);
    if (!normalized)
      throw Object.assign(new Error("Assinatura de notificação inválida."), {
        status: 400,
      });
    const codes = [...new Set((Array.isArray(trackingCodes) ? trackingCodes : [])
      .map((value) => cleanText(value, 100))
      .filter(Boolean))].slice(0, 20);
    const orders = codes.length
      ? await prisma.order.findMany({
          where: { trackingCode: { in: codes } },
          select: { id: true },
        })
      : [];
    const row = await prisma.pushSubscription.upsert({
      where: { endpoint: normalized.endpoint },
      update: {
        p256dh: normalized.p256dh,
        auth: normalized.auth,
        userAgent: cleanText(userAgent, 300) || null,
        lastSeenAt: new Date(),
      },
      create: {
        ...normalized,
        userAgent: cleanText(userAgent, 300) || null,
      },
    });
    if (orders.length)
      await prisma.pushOrderSubscription.createMany({
        data: orders.map((order) => ({
          subscriptionId: row.id,
          orderId: order.id,
        })),
        skipDuplicates: true,
      });
    return { subscribedOrders: orders.length };
  }

  async function removeSubscription(endpointValue) {
    const endpoint = cleanText(endpointValue, 2000);
    if (!endpoint) return;
    await prisma.pushSubscription.deleteMany({ where: { endpoint } });
  }

  async function notifyOrderStatus(order) {
    if (!config.configured || !order?.id || order.fulfillmentType === "DINE_IN")
      return { sent: 0 };
    const visibleStatus = customerVisibleStatus(order.status);
    if (visibleStatus !== order.status) return { sent: 0 };
    const links = await prisma.pushOrderSubscription.findMany({
      where: { orderId: order.id },
      include: { subscription: true },
    });
    if (!links.length) return { sent: 0 };
    const settings = await getSettings();
    if (settings.browserNotificationsEnabled === false) return { sent: 0 };
    const payload = JSON.stringify({
      ...buildOrderPushPayload({ ...order, status: visibleStatus }, settings.storeName),
      icon: settings.faviconImage || settings.logoImage || "/images/store-placeholder.svg",
      badge: settings.faviconImage || settings.logoImage || "/images/store-placeholder.svg",
    });
    let sent = 0;
    await Promise.all(
      links.map(async ({ subscription }) => {
        try {
          await webPush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            payload,
            { TTL: 60 * 60, urgency: "high" },
          );
          sent += 1;
        } catch (error) {
          if ([404, 410].includes(Number(error?.statusCode)))
            await prisma.pushSubscription.deleteMany({
              where: { id: subscription.id },
            });
          else await writeTechnicalLog?.("WEB_PUSH_SEND_ERROR", error);
        }
      }),
    );
    return { sent };
  }

  return {
    configured: config.configured,
    publicKey: config.configured ? config.publicKey : "",
    saveSubscription,
    removeSubscription,
    notifyOrderStatus,
  };
}

export function registerPushNotificationRoutes({ app, service, rateLimit }) {
  app.get("/api/push/config", rateLimit, (req, res) => {
    res.json({ enabled: service.configured, publicKey: service.publicKey });
  });
  app.post("/api/push/subscriptions", rateLimit, async (req, res) => {
    if (!service.configured)
      return res.status(503).json({
        code: "WEB_PUSH_NOT_CONFIGURED",
        message: "Notificações em segundo plano ainda não foram configuradas.",
      });
    try {
      const result = await service.saveSubscription({
        subscription: req.body?.subscription,
        trackingCodes: req.body?.trackingCodes,
        userAgent: req.get("user-agent"),
      });
      res.status(201).json(result);
    } catch (error) {
      res.status(error?.status || 500).json({
        message: error?.status ? error.message : "Não foi possível ativar as notificações.",
      });
    }
  });
  app.delete("/api/push/subscriptions", rateLimit, async (req, res) => {
    await service.removeSubscription(req.body?.endpoint);
    res.status(204).end();
  });
}
