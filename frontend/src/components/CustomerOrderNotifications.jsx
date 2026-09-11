import React, { useEffect, useRef, useState } from "react";
import { Bell, BellRing, X } from "lucide-react";

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

export default function CustomerOrderNotifications({ orders = [], ready = true }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [permission, setPermission] = useState(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );
  const [notice, setNotice] = useState(null);
  const previous = useRef(new Map());
  const primed = useRef(false);

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
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        const notification = new Notification(title, {
          body,
          tag: `master-pizzaria-customer-${order.trackingCode || order.id}`,
          renotify: true,
          requireInteraction: true,
        });
        notification.onclick = () => {
          window.focus();
          if (order.trackingCode)
            window.location.assign(`/pedido/${order.trackingCode}`);
          notification.close();
        };
      } catch {
        // O aviso grande dentro do site continua disponível em navegadores
        // que concedem a permissão, mas não implementam todas as opções.
      }
    }
  }, [orders, ready, enabled]);

  async function toggle() {
    if (enabled) {
      setEnabled(false);
      setNotice(null);
      try {
        localStorage.setItem(STORAGE_KEY, "false");
      } catch {}
      return;
    }
    if (typeof Notification === "undefined") {
      setPermission("unsupported");
      return;
    }
    const nextPermission =
      Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;
    setPermission(nextPermission);
    if (nextPermission !== "granted") return;
    setEnabled(true);
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {}
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
