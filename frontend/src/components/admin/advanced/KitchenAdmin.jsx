import React, { useEffect, useRef, useState } from "react";
import {
  Bell,
  BellOff,
  Check,
  ChefHat,
  Maximize2,
  Monitor,
  Eye,
  EyeOff,
  Printer,
  RefreshCw,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { api, authHeaders } from "../../../lib/api";
import { money } from "../../../lib/format";
import { kitchenCountdown, OPERATION_REFRESH_MS } from "../../../lib/operations";
import {
  comboSnapshotDetailLines,
  comboSnapshotItemLabel,
} from "../../../lib/comboSnapshot";
import ComboContents from "../../ComboContents";

function escapeReceiptHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
}
function printKitchenOrder(order) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  const items = (order.items || [])
    .map((item) => {
      const combo = Array.isArray(item.comboItems) && item.comboItems.length
        ? `<ul class="combo">${item.comboItems
            .map(
              (component) =>
                `<li><b>${escapeReceiptHtml(
                  comboSnapshotItemLabel(component, item.quantity),
                )}</b>${comboSnapshotDetailLines(component)
                  .map(
                    (detail) =>
                      `<small>${escapeReceiptHtml(detail)}</small>`,
                  )
                  .join("")}</li>`,
            )
            .join("")}</ul>`
        : "";
      return `<li><b>${escapeReceiptHtml(item.quantity)}x ${escapeReceiptHtml(item.name)}</b>${combo}${item.notes ? `<br><small>${escapeReceiptHtml(item.notes)}</small>` : ""}</li>`;
    })
    .join("");
  const destination =
    order.fulfillmentType === "DINE_IN"
      ? order.table?.name || `Mesa ${order.table?.number || ""}`
      : order.customerName;
  iframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><title>Pedido ${escapeReceiptHtml(order.shortCode)}</title><style>body{font-family:Arial,sans-serif;width:72mm;margin:0;padding:8mm 3mm;font-size:13px}h1{font-size:20px;margin:0 0 4px}ul{padding-left:18px}li{margin:8px 0}.combo{margin:3px 0 0;padding-left:16px;font-size:11px}.combo li{margin:2px 0}.combo small{display:block;margin-top:1px}.line{border-top:1px dashed #000;margin:10px 0}</style></head><body><h1>Pedido #${escapeReceiptHtml(order.shortCode)}</h1><b>${escapeReceiptHtml(destination)}</b><div class="line"></div><ul>${items}</ul><div class="line"></div><b>Total: ${escapeReceiptHtml(money(order.total))}</b></body></html>`;
  document.body.appendChild(iframe);
  iframe.onload = () => {
    setTimeout(() => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } finally {
        setTimeout(() => iframe.remove(), 1200);
      }
    }, 100);
  };
}

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator(),
      gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
    osc.onended = () => ctx.close();
  } catch {}
}

function KitchenCountdown({ order, now, fallbackMinutes }) {
  if (order.status === "SCHEDULED") return null;
  const timer = kitchenCountdown(order, now, fallbackMinutes);
  return (
    <div
      className={`kitchen-countdown ${timer.tone}`}
      style={{ "--countdown-angle": `${timer.ratio * 360}deg` }}
      title={timer.description}
      aria-label={timer.description}
    >
      <span>{timer.label}</span>
    </div>
  );
}

export function KitchenAdmin({
  session,
  settings,
  notify = () => {},
  fail = () => {},
}) {
  const headers = authHeaders(session.token);
  const [orders, setOrders] = useState([]);
  const [advancingId, setAdvancingId] = useState(null);
  const [focusView, setFocusView] = useState(null);
  const [showReady, setShowReady] = useState(() => {
    try {
      return localStorage.getItem("master-pizza-kitchen-show-ready") !== "off";
    } catch {
      return true;
    }
  });
  const [now, setNow] = useState(Date.now);
  const loadInFlight = useRef(false);
  const screenRef = useRef(null);
  const known = useRef(new Set());
  const [permission, setPermission] = useState(
    typeof Notification !== "undefined"
      ? Notification.permission
      : "unsupported",
  );
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    try {
      return (
        localStorage.getItem("master-pizza-kitchen-notifications") !== "off"
      );
    } catch {
      return true;
    }
  });
  async function load(first = false) {
    if (loadInFlight.current) return;
    loadInFlight.current = true;
    try {
      const { data } = await api.get("/admin/kitchen/orders", headers);
      const ids = new Set(data.map((o) => o.id));
      const fresh = data.filter((o) => !known.current.has(o.id));
      if (!first && fresh.length) {
        if (settings?.newOrderSoundEnabled !== false) beep();
        if (
          notificationsEnabled &&
          settings?.browserNotificationsEnabled !== false &&
          permission === "granted"
        )
          fresh.forEach(
            (o) =>
              new Notification(`Novo pedido #${o.shortCode}`, {
                body: `${o.customerName} • ${money(o.total)}`,
              }),
          );
        if (settings?.autoPrintEnabled)
          fresh.forEach((o) => {
            printKitchenOrder(o);
            api
              .patch(`/admin/kitchen/orders/${o.id}/printed`, {}, headers)
              .catch(() => {});
          });
      }
      known.current = ids;
      setOrders(data);
    } catch (err) {
      fail(err, "Não foi possível carregar a cozinha.");
    } finally {
      loadInFlight.current = false;
    }
  }
  useEffect(() => {
    load(true);
    const t = setInterval(() => {
      if (!document.hidden) load(false);
    }, OPERATION_REFRESH_MS);
    return () => clearInterval(t);
  }, [
    session.token,
    settings?.newOrderSoundEnabled,
    settings?.browserNotificationsEnabled,
    settings?.autoPrintEnabled,
    permission,
    notificationsEnabled,
  ]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    function syncFullscreenState() {
      if (!document.fullscreenElement) setFocusView(null);
    }
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () =>
      document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);
  async function toggleNotifications() {
    if (notificationsEnabled && permission === "granted") {
      setNotificationsEnabled(false);
      try {
        localStorage.setItem("master-pizza-kitchen-notifications", "off");
      } catch {}
      notify("Notificações da cozinha desativadas neste navegador.");
      return;
    }
    if (typeof Notification === "undefined") {
      notify("Este navegador não oferece notificações.");
      return;
    }
    let nextPermission = permission;
    if (permission !== "granted") {
      nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
    }
    if (nextPermission === "granted") {
      setNotificationsEnabled(true);
      try {
        localStorage.setItem("master-pizza-kitchen-notifications", "on");
      } catch {}
      notify("Notificações da cozinha ativadas neste navegador.");
    } else notify("O navegador não autorizou notificações.");
  }
  function manualPrint(order) {
    printKitchenOrder(order);
    api
      .patch(`/admin/kitchen/orders/${order.id}/printed`, {}, headers)
      .catch(() => {});
  }
  async function advance(order) {
    setAdvancingId(order.id);
    try {
      const { data } = await api.patch(
        `/admin/kitchen/orders/${order.id}/advance`,
        {},
        headers,
      );
      notify(
        data.status === "PREPARING"
          ? "Pedido iniciado na cozinha."
          : data.fulfillmentType === "DINE_IN"
            ? "Pedido liberado para o garçom servir."
            : "Pedido finalizado pela cozinha.",
      );
      await load(true);
    } catch (error) {
      fail(error, "Não foi possível avançar o pedido.");
    } finally {
      setAdvancingId(null);
    }
  }
  async function markServed(order) {
    setAdvancingId(order.id);
    try {
      await api.post(`/admin/table-orders/${order.id}/served`, {}, headers);
      notify(`${order.table?.name || "Mesa"} marcada como servida.`);
      await load(true);
    } catch (error) {
      fail(error, "Não foi possível marcar o pedido como servido.");
    } finally {
      setAdvancingId(null);
    }
  }
  function openFocus(view) {
    setFocusView(view);
    const request = screenRef.current?.requestFullscreen?.();
    if (request?.catch) request.catch(() => {});
  }
  function closeFocus() {
    if (document.fullscreenElement === screenRef.current) {
      const exiting = document.exitFullscreen?.();
      if (exiting?.catch) exiting.catch(() => {});
    }
    setFocusView(null);
  }
  const notificationsActive = notificationsEnabled && permission === "granted";
  const salonView = focusView === "SALON";
  const screenOrders = salonView
    ? orders.filter((order) => order.fulfillmentType === "DINE_IN")
    : orders;
  const readyCount = screenOrders.filter(
    (order) => !["RECEIVED", "PREPARING"].includes(order.status),
  ).length;
  const visibleOrders = showReady
    ? screenOrders
    : screenOrders.filter((order) =>
        ["RECEIVED", "PREPARING"].includes(order.status),
      );
  function toggleReadyOrders() {
    setShowReady((current) => {
      const next = !current;
      try {
        localStorage.setItem(
          "master-pizza-kitchen-show-ready",
          next ? "on" : "off",
        );
      } catch {}
      return next;
    });
  }
  return (
    <div
      ref={screenRef}
      className={`kitchen-page ${focusView ? "focus-screen" : ""} ${salonView ? "salon-screen" : ""}`}
    >
      <section className="admin-panel kitchen-toolbar">
        <div>
          <span className="eyebrow dark">
            {salonView ? "Atendimento presencial" : "Produção em tempo real"}
          </span>
          <h2>{salonView ? "Tela do salão" : "Cozinha"}</h2>
          <p>
            {salonView
              ? "Exibe somente pedidos presenciais, sem dados pessoais, valores ou formas de pagamento."
              : "Pedidos atualizados a cada 5 segundos. O relógio indica o tempo previsto restante."}
          </p>
        </div>
        <div className="kitchen-actions">
          <button
            type="button"
            className={`ghost-dark-btn kitchen-ready-toggle ${showReady ? "active" : ""}`}
            onClick={toggleReadyOrders}
          >
            {showReady ? <EyeOff size={16} /> : <Eye size={16} />}
            {showReady ? "Ocultar prontos" : `Mostrar prontos${readyCount ? ` (${readyCount})` : ""}`}
          </button>
          {focusView ? (
            <>
              <div className="kitchen-screen-switch" aria-label="Tipo de tela">
                <button
                  type="button"
                  className={!salonView ? "active" : ""}
                  onClick={() => setFocusView("KITCHEN")}
                >
                  <ChefHat size={17} /> Cozinha
                </button>
                <button
                  type="button"
                  className={salonView ? "active" : ""}
                  onClick={() => setFocusView("SALON")}
                >
                  <UtensilsCrossed size={17} /> Salão
                </button>
              </div>
              <button
                type="button"
                className="kitchen-screen-close"
                onClick={closeFocus}
              >
                <X size={18} /> Sair da tela cheia
              </button>
            </>
          ) : (
            <>
              <span className="kitchen-auto-refresh">
                <RefreshCw size={15} /> Atualização automática
              </span>
              <button
                className={
                  notificationsActive
                    ? "ghost-dark-btn notification-toggle active"
                    : "ghost-dark-btn notification-toggle"
                }
                onClick={toggleNotifications}
              >
                {notificationsActive ? (
                  <BellOff size={16} />
                ) : (
                  <Bell size={16} />
                )}{" "}
                {notificationsActive
                  ? "Desativar notificações"
                  : "Ativar notificações"}
              </button>
              <button
                type="button"
                className="ghost-dark-btn kitchen-fullscreen-btn"
                onClick={() => openFocus("KITCHEN")}
              >
                <Maximize2 size={16} /> Tela cheia da cozinha
              </button>
              <button
                type="button"
                className="ghost-dark-btn kitchen-fullscreen-btn salon"
                onClick={() => openFocus("SALON")}
              >
                <Monitor size={16} /> Tela cheia do salão
              </button>
            </>
          )}
        </div>
      </section>
      <div className="kitchen-board">
        {visibleOrders.map((o) => (
          <article
            key={o.id}
            className={`kitchen-ticket ${salonView ? "salon-ticket" : ""} status-${o.status.toLowerCase()}`}
          >
            <div className="kitchen-ticket-head">
              <div>
                <small>Pedido</small>
                <b>#{o.shortCode}</b>
              </div>
              <div className="kitchen-ticket-progress">
                <KitchenCountdown order={o} now={now} fallbackMinutes={settings?.estimatedDeliveryMax} />
                <span className="kitchen-ticket-status">
                  {o.status === "RECEIVED"
                    ? "RECEBIDO"
                    : o.status === "PREPARING"
                      ? "EM PREPARO"
                      : "PRONTO"}
                </span>
              </div>
            </div>
            <h3>
              {salonView || o.fulfillmentType === "DINE_IN"
                ? o.table?.name || `Mesa ${o.table?.number || ""}`
                : o.customerName}
            </h3>
            {!salonView && o.fulfillmentType === "DINE_IN" && (
              <small className="kitchen-table-badge">ATENDIMENTO NO SALÃO</small>
            )}
            <div className="kitchen-items">
              {o.items.map((item) => (
                <div key={item.id}>
                  <b>
                    {item.quantity}× {item.name}
                  </b>
                  <ComboContents
                    items={item.comboItems}
                    multiplier={item.quantity}
                    className="kitchen-combo-contents"
                  />
                  {item.notes && <small>Obs.: {item.notes}</small>}
                  {item.options?.length > 0 && (
                    <small>
                      {item.options
                        .map((x) => `${x.groupName}: ${x.optionName}`)
                        .join(" • ")}
                    </small>
                  )}
                </div>
              ))}
            </div>
            <div className="kitchen-ticket-footer">
              <small>
                {new Date(o.createdAt).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </small>
              {!salonView && (
                <button onClick={() => manualPrint(o)}>
                  <Printer size={15} /> Imprimir
                </button>
              )}
              {!salonView && ["RECEIVED", "PREPARING"].includes(o.status) && (
                <button
                  className="kitchen-advance-btn"
                  disabled={advancingId === o.id}
                  onClick={() => advance(o)}
                >
                  <Check size={15} />
                  {advancingId === o.id
                    ? "Salvando..."
                    : o.status === "RECEIVED"
                      ? "Iniciar preparo"
                      : "Marcar pronto"}
                </button>
              )}
              {salonView && o.status === "READY_FOR_TABLE" && (
                <button
                  className="kitchen-advance-btn"
                  disabled={advancingId === o.id}
                  onClick={() => markServed(o)}
                >
                  <Check size={15} />
                  {advancingId === o.id ? "Salvando..." : "Confirmar servido"}
                </button>
              )}
            </div>
          </article>
        ))}
        {!visibleOrders.length && (
          <div className="kitchen-empty">
            {salonView ? <UtensilsCrossed /> : <ChefHat />}
            <h3>
              {!showReady && readyCount
                ? `${readyCount} pedido(s) pronto(s) oculto(s)`
                : salonView
                ? "Nenhum pedido presencial no momento"
                : "Nenhum pedido na cozinha"}
            </h3>
            <p>
              {!showReady && readyCount
                ? "Use “Mostrar prontos” para exibir esses pedidos novamente."
                : salonView
                ? "As mesas com pedidos ativos aparecerão aqui automaticamente."
                : "Os novos pedidos aparecerão aqui automaticamente."}
            </p>
          </div>
        )}
      </div>
      {!focusView && (
        <p className="field-note">
          Impressão automática em navegador abre o diálogo de impressão.
          Impressão totalmente silenciosa exige um agente local de impressão
          configurado no computador da loja.
        </p>
      )}
    </div>
  );
}
