import React, { useEffect, useRef, useState } from "react";
import { Bell, BellRing, X } from "lucide-react";
import { api } from "../lib/api";

const STORAGE_KEY = "master-pizzaria-customer-order-notifications";
const STATUS_LABEL = {
  SCHEDULED: "Agendado",
  RECEIVED: "Recebido pela loja",
  PREPARING: "Em preparação",
  READY_FOR_DELIVERY: "Pronto para entrega",
  OUT_FOR_DELIVERY: "Saiu para entrega",
  READY_FOR_PICKUP: "Pronto para retirada",
  READY_FOR_TABLE: "Pronto para servir",
  SERVED: "Servido - aguardando fechamento",
  DELIVERED: "Concluído",
  CANCELED: "Cancelado",
};

function initialEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function applicationServerKey(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bytes = atob(base64);
  return Uint8Array.from(bytes, (character) => character.charCodeAt(0));
}

function trackingCodesFor(orders) {
  return [...new Set(orders.map((order) => order.trackingCode).filter(Boolean))].slice(0, 20);
}

function isIosOutsideInstalledApp() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
  return ios && !standalone;
}

async function currentPushSubscription() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return registration?.pushManager.getSubscription() || null;
}

export default function CustomerOrderNotifications({
  orders = [],
  ready = true,
  settings = {},
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [permission, setPermission] = useState(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );
  const [notice, setNotice] = useState(null);
  const previous = useRef(new Map());
  const primed = useRef(false);
  const storeName = settings.storeName || "Pizzaria";
  const trackingCodes = trackingCodesFor(orders);
  const trackingKey = trackingCodes.join("|");

  useEffect(() => {
    if (!ready) return;
    const current = new Map(
      orders.map((order) => [
        order.id || order.trackingCode,
        `${order.status}|${order.paymentStatus}|${order.updatedAt || ""}`,
      ]),
    );
    if (!primed.current) {
      previous.current = current;
      primed.current = true;
      return;
    }
    const changed = orders.filter((order) => {
      const key = order.id || order.trackingCode;
      return previous.current.has(key) && previous.current.get(key) !== current.get(key);
    });
    previous.current = current;
    if (!enabled || !changed.length) return;

    const order = changed[0];
    const title = `Pedido #${order.shortCode || ""} atualizado`;
    const body = STATUS_LABEL[order.status] || "O status do seu pedido mudou.";
    setNotice({ title, body });
  }, [orders, ready, enabled]);

  useEffect(() => {
    if (!enabled || !ready) return;
    let canceled = false;
    async function syncOrders() {
      try {
        const subscription = await currentPushSubscription();
        if (canceled) return;
        if (!subscription) {
          setEnabled(false);
          try { localStorage.setItem(STORAGE_KEY, "false"); } catch {}
          return;
        }
        await api.post("/push/subscriptions", {
          subscription: subscription.toJSON(),
          trackingCodes,
        });
      } catch {
        if (!canceled)
          setNotice({
            title: "Notificações temporariamente indisponíveis",
            body: "Abra esta tela novamente para sincronizar os avisos dos seus pedidos.",
          });
      }
    }
    void syncOrders();
    return () => { canceled = true; };
  }, [enabled, ready, trackingKey]);

  async function toggle() {
    if (enabled) {
      const subscription = await currentPushSubscription().catch(() => null);
      if (subscription) {
        await api.delete("/push/subscriptions", {
          data: { endpoint: subscription.endpoint },
        }).catch(() => {});
        await subscription.unsubscribe().catch(() => {});
      }
      setEnabled(false);
      setNotice(null);
      try {
        localStorage.setItem(STORAGE_KEY, "false");
      } catch {}
      return;
    }
    if (
      typeof Notification === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      setPermission("unsupported");
      setNotice({
        title: "Navegador sem suporte",
        body: "Este navegador não oferece notificações em segundo plano.",
      });
      return;
    }
    if (settings.pwaEnabled === false) {
      setNotice({
        title: "Aplicativo desativado",
        body: "A loja precisa ativar o aplicativo instalável para enviar notificações em segundo plano.",
      });
      return;
    }
    if (settings.browserNotificationsEnabled === false) {
      setNotice({
        title: "Notificações desativadas pela loja",
        body: "A pizzaria precisa ativar as notificações no painel antes deste aparelho.",
      });
      return;
    }
    if (isIosOutsideInstalledApp()) {
      setNotice({
        title: "Instale o app primeiro",
        body: "No iPhone, instale a pizzaria na Tela de Início e abra o app instalado para ativar os avisos.",
      });
      return;
    }
    const nextPermission =
      Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;
    setPermission(nextPermission);
    if (nextPermission !== "granted") return;
    try {
      const { data: config } = await api.get("/push/config");
      if (!config?.enabled || !config?.publicKey)
        throw new Error("WEB_PUSH_NOT_CONFIGURED");
      await navigator.serviceWorker.register("/sw.js");
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey(config.publicKey),
        }));
      await api.post("/push/subscriptions", {
        subscription: subscription.toJSON(),
        trackingCodes,
      });
      setEnabled(true);
      try {
        localStorage.setItem(STORAGE_KEY, "true");
      } catch {}
      setNotice({
        title: `Notificações da ${storeName} ativadas`,
        body: "Você receberá avisos mesmo com o app em segundo plano.",
      });
    } catch {
      setEnabled(false);
      try { localStorage.setItem(STORAGE_KEY, "false"); } catch {}
      setNotice({
        title: "Não foi possível ativar",
        body: "Confira a conexão e tente novamente. A loja também precisa configurar as chaves de notificação.",
      });
    }
  }

  return (
    <>
      <button
        type="button"
        className={`order-notification-toggle customer-notification-toggle ${enabled ? "active" : ""}`}
        onClick={toggle}
        title={
          permission === "denied"
            ? "Libere as notificações nas configurações do navegador"
            : "Receber avisos quando o pedido mudar"
        }
      >
        {enabled ? <BellRing size={17} /> : <Bell size={17} />}
        {enabled
          ? "Notificações ativas"
          : permission === "denied"
            ? "Notificações bloqueadas"
            : "Ativar notificações"}
      </button>
      {notice && (
        <aside className="order-live-notice customer-live-notice" aria-live="assertive">
          <span className="order-live-icon"><BellRing /></span>
          <div>
            <small>ATUALIZAÇÃO DO SEU PEDIDO</small>
            <b>{notice.title}</b>
            <p>{notice.body}</p>
          </div>
          <button
            type="button"
            aria-label="Fechar notificação"
            onClick={() => setNotice(null)}
          >
            <X />
          </button>
        </aside>
      )}
    </>
  );
}
