import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  Check,
  ChevronRight,
  Clock3,
  Printer,
  ShoppingBag,
  UtensilsCrossed,
  X,
} from "lucide-react";
import MotoIcon from "../MotoIcon";
import ComboContents from "../ComboContents";
import { etaRange, money } from "../../lib/format";
import {
  ORDER_VIEW_LABELS,
  STATUS_LABEL,
  formatPhoneSimple,
  nextStatusForOrder,
  paymentLabel,
} from "../../lib/adminOrders";
import { kitchenCountdown } from "../../lib/operations";

const DEFAULT_VIEWS = [
  "OPEN",
  "RECEIVED",
  "PREPARING",
  "READY_FOR_TABLE",
  "SERVED",
  "READY_FOR_DELIVERY",
  "SCHEDULED",
  "OUT_FOR_DELIVERY",
  "READY_FOR_PICKUP",
  "DELIVERED",
  "CANCELED",
];
const OVERVIEW_VIEWS = DEFAULT_VIEWS.filter((view) => view !== "CANCELED");
const DELIVERY_VIEWS = ["READY_FOR_DELIVERY", "OUT_FOR_DELIVERY", "DELIVERED"];
const WAITER_VIEWS = ["READY_FOR_TABLE"];

function viewsForRole({ deliveryOnly, waiterOnly, overview = false }) {
  if (waiterOnly) return WAITER_VIEWS;
  if (deliveryOnly) return DELIVERY_VIEWS;
  return overview ? OVERVIEW_VIEWS : DEFAULT_VIEWS;
}

function OrderTabs({ value, onChange, buckets, overview, deliveryOnly, waiterOnly }) {
  return (
    <div className={`order-view-tabs ${overview ? "overview-order-tabs" : ""}`}>
      {viewsForRole({ overview, deliveryOnly, waiterOnly }).map((key) => {
        const count = buckets[key]?.length || 0;
        return (
          <button
            type="button"
            key={key}
            className={value === key ? "active" : ""}
            onClick={() => onChange(key)}
          >
            {key === "SCHEDULED" && <CalendarClock size={15} />} {ORDER_VIEW_LABELS[key]} <b>{count}</b>
          </button>
        );
      })}
    </div>
  );
}

export function OverviewOrderTabs(props) {
  return <OrderTabs {...props} overview />;
}

export function OrderViewTabs(props) {
  return <OrderTabs {...props} />;
}

function OrderCountdown({ order, now }) {
  if (["DELIVERED", "CANCELED"].includes(order.status)) return null;
  const timer = kitchenCountdown(
    { ...order, status: "PREPARING" },
    now,
    order.estimatedDeliveryMax,
  );
  return (
    <div
      className={`kitchen-countdown admin-order-countdown ${timer.tone}`}
      style={{ "--countdown-angle": `${timer.ratio * 360}deg` }}
      title={timer.description}
      aria-label={timer.description}
    >
      <span>{timer.label}</span>
    </div>
  );
}

function nextStatusLabel(order) {
  const next = nextStatusForOrder(order);
  if (order.fulfillmentType === "DINE_IN") {
    return {
      PREPARING: "Iniciar preparo",
      READY_FOR_TABLE: "Marcar pronto para servir",
      SERVED: "Marcar como servido",
    }[next] || "Pedido concluído";
  }
  if (order.status === "RECEIVED" && next === "PREPARING") {
    return "Aceitar pedido e iniciar preparo";
  }
  return next ? `Avançar para ${STATUS_LABEL[next]}` : "Pedido concluído";
}

function OrderStatusActions({
  order,
  onStatus,
  onCancel,
  onPayment,
  deliveryOnly = false,
  compact = false,
  saving = false,
}) {
  if (deliveryOnly) {
    const action = order.status === "READY_FOR_DELIVERY"
      ? { status: "OUT_FOR_DELIVERY", icon: <MotoIcon size={15} />, label: "Aceitar entrega", saving: "Aceitando..." }
      : order.status === "OUT_FOR_DELIVERY"
        ? { status: "DELIVERED", icon: <Check size={15} />, label: "Marcar entregue", saving: "Salvando..." }
        : null;
    return action ? (
      <button
        type="button"
        disabled={saving}
        className="delivery-complete-btn"
        onClick={(event) => {
          event.stopPropagation();
          if (!saving) onStatus(order.id, action.status);
        }}
      >
        {action.icon} {saving ? action.saving : action.label}
      </button>
    ) : <span className="final-status-label">{STATUS_LABEL[order.status] || order.status}</span>;
  }

  const next = nextStatusForOrder(order);
  const final = ["DELIVERED", "CANCELED"].includes(order.status);
  const waitingPayment = order.fulfillmentType === "DINE_IN" && order.status === "SERVED";
  return (
    <div className={`status-step-actions ${compact ? "compact" : ""}`} onClick={(event) => event.stopPropagation()}>
      {next && (
        <button type="button" disabled={saving} className="advance-status-btn" onClick={() => !saving && onStatus(order.id, next)}>
          <ChevronRight size={15} /> {saving ? "Salvando..." : nextStatusLabel(order)}
        </button>
      )}
      {waitingPayment && (onPayment ? (
        <button type="button" disabled={saving} className="advance-status-btn" onClick={() => !saving && onPayment(order)}>
          <Banknote size={16} /> Receber e concluir
        </button>
      ) : <span className="final-status-label">Aguardando fechamento</span>)}
      {!final && onCancel && (
        <button type="button" disabled={saving} className="cancel-status-btn" onClick={() => !saving && onCancel(order)}>
          Cancelar
        </button>
      )}
      {final && <span className="final-status-label">{STATUS_LABEL[order.status]}</span>}
    </div>
  );
}

function OrderItemsPreview({ order }) {
  return (
    <div className="order-products">
      {order.items.slice(0, 3).map((item) => <span key={item.id}>{item.quantity}× {item.name}</span>)}
      <small>{paymentLabel(order)}</small>
    </div>
  );
}

export function OrderList({
  orders,
  onStatus,
  onCancel,
  onOpen,
  onPayment,
  onPrint,
  deliveryOnly = false,
  savingId = null,
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  if (!orders.length) return <div className="empty-admin"><ShoppingBag /><p>Nenhum pedido por aqui.</p></div>;
  return (
    <div className="order-list">
      {orders.map((order) => {
        const eta = etaRange(order);
        const dineIn = order.fulfillmentType === "DINE_IN";
        return (
          <article
            className={`admin-order clickable status-card-${String(order.status).toLowerCase()} ${dineIn ? "dine-in-order" : ""}`}
            key={order.id}
            onClick={() => onOpen(order)}
          >
            <div className="order-code">
              <b>#{order.shortCode}</b>
              <span className="order-status-name">{STATUS_LABEL[order.status] || order.status}</span>
              {dineIn && <em className="dine-in-order-badge"><UtensilsCrossed size={12} /> Presencial</em>}
              <small>{new Date(order.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</small>
              {order.scheduledAt && (
                <em className="scheduled-order-mark">Agendado • {new Date(order.scheduledAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</em>
              )}
              {eta && !dineIn && (
                <span className="admin-order-eta"><Clock3 size={13} />{order.fulfillmentType === "PICKUP" ? "Pronto" : "Entrega"}: <b>{eta}</b></span>
              )}
            </div>
            <div className="order-client">
              <b>{order.customerName}</b>
              <small>{dineIn ? order.table?.name || `Mesa ${order.table?.number || "—"}` : formatPhoneSimple(order.customerPhone)}</small>
              <small>{dineIn ? "Atendimento no salão" : order.fulfillmentType === "PICKUP" ? "Retirada" : `Entrega • ${order.neighborhood || order.city || ""}`}</small>
            </div>
            <OrderItemsPreview order={order} />
            <OrderCountdown order={order} now={now} />
            <strong>{money(order.total)}</strong>
            <div className="order-actions">
              <OrderStatusActions order={order} onStatus={onStatus} onCancel={onCancel} onPayment={onPayment} deliveryOnly={deliveryOnly} compact saving={savingId === order.id} />
              {onPrint && (
                <button type="button" className="order-print-btn" onClick={(event) => { event.stopPropagation(); onPrint(order); }} title={`Imprimir pedido ${order.shortCode}`} aria-label={`Imprimir pedido ${order.shortCode}`}>
                  <Printer size={17} /> Imprimir
                </button>
              )}
            </div>
            <ChevronRight className="order-open-icon" />
          </article>
        );
      })}
    </div>
  );
}

function orderAddress(order, tableName) {
  if (order.fulfillmentType === "DINE_IN") return `${tableName} • Atendimento no salão`;
  if (order.fulfillmentType !== "DELIVERY") return "Retirada na loja";
  return [order.street, order.addressNumber, order.neighborhood, order.city, order.state, order.complement, order.postalCode]
    .filter(Boolean)
    .join(", ");
}

export function OrderDetailModal({ order, onClose, onStatus, onCancel, onPayment, onPrint, deliveryOnly = false, savingId = null }) {
  const dineIn = order.fulfillmentType === "DINE_IN";
  const tableName = order.table?.name || `Mesa ${order.table?.number || "não identificada"}`;
  const eta = etaRange(order);
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="order-detail-modal" role="dialog" aria-modal="true" aria-label={`Pedido ${order.shortCode}`}>
        <div className="modal-head">
          <div><span className="eyebrow dark">{dineIn ? "Pedido presencial" : "Pedido"} #{order.shortCode}</span><h2>{order.customerName}</h2><p>{new Date(order.createdAt).toLocaleString("pt-BR")}</p></div>
          <button type="button" className="icon-close" onClick={onClose} aria-label="Fechar"><X /></button>
        </div>
        {onPrint && <button type="button" className="outline-btn order-detail-print" onClick={() => onPrint(order)}><Printer size={17} /> Imprimir pedido</button>}
        {eta && !dineIn && <div className="order-detail-eta"><Clock3 /><span><small>{order.fulfillmentType === "PICKUP" ? "Previsão para ficar pronto" : "Previsão de entrega"}</small><b>{eta}</b></span></div>}
        <div className="order-detail-grid">
          <article><small>Status</small><b>{STATUS_LABEL[order.status] || order.status}</b><OrderStatusActions order={order} onStatus={onStatus} onCancel={onCancel} onPayment={onPayment} deliveryOnly={deliveryOnly} saving={savingId === order.id} /></article>
          <article><small>{dineIn ? "Mesa" : "Telefone"}</small><b>{dineIn ? tableName : formatPhoneSimple(order.customerPhone)}</b></article>
          <article className="span-2"><small>Endereço / operação</small><b>{orderAddress(order, tableName)}</b></article>
          {order.referencePoint && <article className="span-2"><small>Ponto de referência</small><b>{order.referencePoint}</b></article>}
          {order.distanceKm != null && <article><small>Distância calculada</small><b>{Number(order.distanceKm).toFixed(2)} km</b></article>}
          <article><small>Pagamento</small><b>{paymentLabel(order)}</b><small>{dineIn ? "Pagamento realizado no fechamento da mesa" : order.paymentStatus === "APPROVED" ? "Pagamento aprovado" : order.paymentStatus === "CASH_PENDING" ? "Pagamento na entrega/retirada" : "Aguardando confirmação"}</small></article>
          {order.assignedCourier && <article><small>Entregador atribuído</small><b>{order.assignedCourier.name}</b><small>{formatPhoneSimple(order.assignedCourier.phone)}</small></article>}
          {order.scheduledAt && <article><small>Agendamento</small><b>{new Date(order.scheduledAt).toLocaleString("pt-BR")}</b></article>}
          {order.acceptedAt && <article><small>Aceito pela loja</small><b>{new Date(order.acceptedAt).toLocaleString("pt-BR")}</b></article>}
          {!dineIn && <article><small>Troco para</small><b>{order.changeFor ? money(order.changeFor) : "Não informado"}</b></article>}
          {order.status === "CANCELED" && order.cancelReason && <article className="span-2 cancel-reason-admin"><small>Motivo do cancelamento</small><b>{order.cancelReason}</b></article>}
        </div>
        <div className="order-detail-items">
          <h3>Itens do pedido</h3>
          {order.items.map((item) => (
            <div key={item.id} className="order-detail-item-rich">
              <span>
                <b>{item.quantity}× {item.name}</b>
                <ComboContents items={item.comboItems} multiplier={item.quantity} />
                {item.flavors?.length > 0 && <small>Sabores: {item.flavors.map((flavor) => flavor.name).join(" • ")}</small>}
                {item.options?.length > 0 && <small>Adicionais: {item.options.map((option) => `${option.groupName}: ${option.optionName}`).join(" • ")}</small>}
                {item.notes && <em>Observação do item: {item.notes}</em>}
              </span>
              <strong>{money(Number(item.unitPrice) * item.quantity)}</strong>
            </div>
          ))}
        </div>
        <div className="order-detail-totals"><span>Subtotal <b>{money(order.subtotal)}</b></span><span>Entrega <b>{money(order.deliveryFee)}</b></span><strong>Total {money(order.total)}</strong></div>
        <div className="order-history"><h3>Histórico</h3>{order.history?.map((entry) => <span key={entry.id}><i /><b>{STATUS_LABEL[entry.status] || entry.status}</b><small>{new Date(entry.createdAt).toLocaleString("pt-BR")}{entry.changedByName ? ` • ${entry.changedByName}${entry.changedByRole ? ` (${entry.changedByRole})` : ""}` : ""}</small></span>)}</div>
      </section>
    </div>
  );
}

export function CancelOrderModal({ order, onClose, onConfirm, saving = false }) {
  const [reason, setReason] = useState("");
  return (
    <div className="modal-backdrop cancel-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="cancel-order-modal" onSubmit={(event) => { event.preventDefault(); if (reason.trim().length >= 3) onConfirm(reason.trim()); }}>
        <div className="cancel-modal-icon"><AlertTriangle size={24} /></div>
        <div><span className="eyebrow dark">Cancelar pedido #{order.shortCode}</span><h2>Informe o motivo</h2><p>O cliente verá este motivo em “Seus pedidos” e no acompanhamento.</p></div>
        <label>Motivo<textarea autoFocus required minLength="3" maxLength="280" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ex.: ingrediente indisponível, solicitação do cliente..." /><small>{reason.length}/280</small></label>
        <div className="cancel-modal-actions"><button type="button" className="ghost-dark-btn" onClick={onClose}>Voltar</button><button disabled={saving || reason.trim().length < 3} className="cancel-confirm-btn">{saving ? "Cancelando..." : "Confirmar cancelamento"}</button></div>
      </form>
    </div>
  );
}
