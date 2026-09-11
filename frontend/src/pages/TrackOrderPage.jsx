import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  ChefHat,
  Clock3,
  CreditCard,
  PackageCheck,
  Search,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { etaRange, money } from "../lib/format";
import MotoIcon from "../components/MotoIcon";

export default function TrackOrderPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [input, setInput] = useState(code || "");
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const steps = useMemo(() => {
    const base =
      order?.fulfillmentType === "PICKUP"
        ? [
            ["RECEIVED", "Recebido", Clock3],
            ["PREPARING", "Em preparo", ChefHat],
            ["READY_FOR_PICKUP", "Pronto para retirada", PackageCheck],
            ["DELIVERED", "Retirado", Check],
          ]
        : [
            ["RECEIVED", "Recebido", Clock3],
            ["PREPARING", "Em preparo", ChefHat],
            ["OUT_FOR_DELIVERY", "Saiu para entrega", MotoIcon],
            ["DELIVERED", "Entregue", Check],
          ];
    return order?.scheduledAt
      ? [["SCHEDULED", "Agendado", CalendarClock], ...base]
      : base;
  }, [order?.fulfillmentType, order?.scheduledAt]);
  async function load(value) {
    if (!value) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get(
        `/orders/track/${encodeURIComponent(value.trim())}`,
      );
      setOrder(data);
    } catch {
      setOrder(null);
      setError("Pedido não encontrado. Confira o código e tente novamente.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (code) load(code);
  }, [code]);
  useEffect(() => {
    if (!code) return undefined;
    const timer = window.setInterval(() => load(code), 20000);
    return () => window.clearInterval(timer);
  }, [code]);
  function submit(e) {
    e.preventDefault();
    const clean = input.trim();
    if (clean) {
      navigate(`/pedido/${clean}`);
      if (clean === code) load(clean);
    }
  }
  const currentIndex =
    order?.status === "CANCELED"
      ? -1
      : steps.findIndex(([key]) => key === order?.status);
  const eta = etaRange(order);

  return (
    <div className="page-shell">
      <div className="container page-top">
        <Link to="/seus-pedidos">
          <ArrowLeft size={16} /> Voltar a Seus pedidos
        </Link>
      </div>
      <main className="container tracking-page">
        <div className="tracking-head">
          <span className="eyebrow dark">Seus pedidos</span>
          <h1 className="page-title">
            Acompanhe seu <em>pedido.</em>
          </h1>
          <p>Digite o código recebido ao finalizar a compra.</p>
          <form className="tracking-search" onSubmit={submit}>
            <Search />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Cole o código do pedido"
            />
            <button className="primary-btn">Buscar</button>
          </form>
          {error && <div className="form-error">{error}</div>}
        </div>
        {loading && !order && (
          <div className="loading-card">Consultando pedido...</div>
        )}
        {order && (
          <section className="tracking-card">
            <div className="tracking-order-top">
              <div>
                <small>Pedido</small>
                <b>#{order.shortCode}</b>
              </div>
              <div>
                <small>Operação</small>
                <b>
                  {order.fulfillmentType === "PICKUP" ? "Retirada" : "Entrega"}
                </b>
              </div>
              <div>
                <small>Total</small>
                <b>{money(order.total)}</b>
              </div>
            </div>
            {order.paymentMethod === "CARD" &&
              order.paymentStatus !== "APPROVED" && (
                <div className="payment-pending-banner">
                  <CreditCard />
                  <div>
                    <b>Pagamento aguardando confirmação</b>
                    <small>
                      O pedido só é liberado para a operação da loja depois da
                      aprovação.
                    </small>
                  </div>
                </div>
              )}
            {order.scheduledAt && (
              <div className="scheduled-banner">
                <CalendarClock />
                <div>
                  <b>
                    Entrega agendada para{" "}
                    {new Date(order.scheduledAt).toLocaleString("pt-BR")}
                  </b>
                  <small>
                    O pedido entra automaticamente na fila com antecedência
                    suficiente para cumprir o prazo configurado.
                  </small>
                </div>
              </div>
            )}
            {eta &&
              order.status !== "DELIVERED" &&
              order.status !== "CANCELED" && (
                <div className="eta-banner">
                  <Clock3 />
                  <div>
                    <small>
                      {order.fulfillmentType === "PICKUP"
                        ? "Previsão para ficar pronto"
                        : "Previsão de entrega"}
                    </small>
                    <b>{eta}</b>
                    <p>
                      Calculada a partir do horário em que a loja aceitou o
                      pedido + prazo de {order.estimatedDeliveryMin}–
                      {order.estimatedDeliveryMax} minutos.
                    </p>
                  </div>
                </div>
              )}
            {!eta && ["RECEIVED"].includes(order.status) && (
              <div className="eta-waiting-banner">
                <Clock3 />
                <div>
                  <b>Aguardando aceite da loja</b>
                  <small>
                    A previsão aparece assim que a equipe aceitar o pedido.
                  </small>
                </div>
              </div>
            )}
            {order.status === "CANCELED" ? (
              <div className="canceled-box">
                <b>Este pedido foi cancelado.</b>
                {order.cancelReason && (
                  <span>Motivo: {order.cancelReason}</span>
                )}
              </div>
            ) : (
              <div
                className={`timeline ${steps.length === 5 ? "timeline-five" : ""}`}
              >
                {steps.map(([key, label, Icon], index) => (
                  <div
                    className={`timeline-step ${index <= currentIndex ? "done" : ""} ${index === currentIndex ? "current" : ""}`}
                    key={key}
                  >
                    <span>
                      <Icon size={18} />
                    </span>
                    <div>
                      <b>{label}</b>
                      <small>
                        {index === currentIndex
                          ? "Status atual"
                          : index < currentIndex
                            ? "Concluído"
                            : "Aguardando"}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="tracking-items">
              <h3>Itens</h3>
              {order.items.map((item) => (
                <div className="tracking-item-rich" key={item.id}>
                  <p>
                    <span>
                      {item.quantity}× {item.name}
                    </span>
                    <b>{money(item.unitPrice * item.quantity)}</b>
                  </p>
                  {item.options?.length > 0 && (
                    <small>
                      {item.options
                        .map((o) => `${o.groupName}: ${o.optionName}`)
                        .join(" • ")}
                    </small>
                  )}
                  {item.notes && (
                    <small className="tracking-item-note">
                      Detalhe: {item.notes}
                    </small>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
