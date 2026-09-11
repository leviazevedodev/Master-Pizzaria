import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Minus,
  Plus,
  ShoppingBag,
  UtensilsCrossed,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { money } from "../lib/format";
import {
  readStoredJson,
  readStoredStringArray,
  writeStoredJson,
} from "../lib/storage";

const GUEST_KEY = "master-pizzaria-digital-table-guest";

function rememberTrackingCode(code) {
  if (!code) return;
  const current = readStoredStringArray(
    localStorage,
    "master-pizza-guest-orders",
  );
  writeStoredJson(
    localStorage,
    "master-pizza-guest-orders",
    [code, ...current.filter((value) => value !== code)].slice(0, 20),
  );
}

export default function DigitalTableCheckoutPage({
  cart,
  setCart,
  changeQty,
  settings,
}) {
  const navigate = useNavigate();
  const remembered = readStoredJson(localStorage, GUEST_KEY, {});
  const [customerName, setCustomerName] = useState(remembered.customerName || "");
  const [tableNumber, setTableNumber] = useState(
    remembered.tableNumber ? String(remembered.tableNumber) : "",
  );
  const [tables, setTables] = useState([]);
  const [loadingTables, setLoadingTables] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const total = useMemo(
    () =>
      cart.reduce(
        (sum, item) =>
          sum + Number(item.price || 0) * Number(item.quantity || 0),
        0,
      ),
    [cart],
  );

  useEffect(() => {
    api
      .get("/digital-tables")
      .then(({ data }) => setTables(Array.isArray(data) ? data : []))
      .catch(() => setError("Não foi possível carregar as mesas do salão."))
      .finally(() => setLoadingTables(false));
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (customerName.trim().length < 2)
      return setError("Informe seu nome para identificar o pedido.");
    if (!tableNumber)
      return setError("Escolha o número ou nome da sua mesa.");
    if (!cart.length) return setError("Adicione pelo menos um item ao pedido.");
    setSubmitting(true);
    try {
      const { data } = await api.post("/orders", {
        customerName: customerName.trim(),
        fulfillmentType: "DINE_IN",
        digitalTableOrder: true,
        tableNumber: Number(tableNumber),
        paymentMethod: "CASH",
        items: cart.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          sizeId: item.sizeId || null,
          flavorIds: item.flavorIds || [],
          optionIds: item.optionIds || [],
          notes: item.notes || "",
        })),
      });
      writeStoredJson(localStorage, GUEST_KEY, {
        customerName: customerName.trim(),
        tableNumber: Number(tableNumber),
      });
      rememberTrackingCode(data.trackingCode);
      setCart([]);
      navigate(`/pedido/${data.trackingCode}`, {
        replace: true,
        state: { digitalTableOrderCreated: true },
      });
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Não foi possível enviar o pedido. Confira a mesa e tente novamente.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-shell digital-table-checkout-page">
      <div className="container page-top">
        <Link to="/gestao/cardapiodigital">
          <ArrowLeft size={16} /> Voltar ao cardápio da mesa
        </Link>
      </div>
      <main className="container digital-table-checkout">
        <section className="digital-checkout-heading">
          <span className="eyebrow dark">PEDIDO PRESENCIAL</span>
          <h1>Confirme sua mesa.</h1>
          <p>
            O pedido vai direto para o atendimento e para a cozinha. Você paga
            no fechamento da mesa, depois de ser servido.
          </p>
        </section>

        {!cart.length ? (
          <section className="empty-cart digital-empty-cart">
            <ShoppingBag />
            <h2>Seu pedido está vazio</h2>
            <p>Volte ao cardápio e escolha os itens da sua mesa.</p>
            <Link className="primary-btn" to="/gestao/cardapiodigital">
              Abrir cardápio
            </Link>
          </section>
        ) : (
          <form className="digital-checkout-grid" onSubmit={submit}>
            <section className="digital-order-items">
              <div className="panel-title">
                <div>
                  <span>Seu pedido</span>
                  <h2>{cart.length} item(ns)</h2>
                </div>
                <UtensilsCrossed />
              </div>
              {cart.map((item) => (
                <article key={item.cartKey || item.productId}>
                  <div>
                    <b>{item.name}</b>
                    {item.notes && <small>Detalhe: {item.notes}</small>}
                    <span>{money(Number(item.price) * item.quantity)}</span>
                  </div>
                  <div className="qty">
                    <button
                      type="button"
                      onClick={() =>
                        changeQty(item.cartKey || item.productId, -1)
                      }
                      aria-label={`Diminuir ${item.name}`}
                    >
                      <Minus size={15} />
                    </button>
                    <b>{item.quantity}</b>
                    <button
                      type="button"
                      onClick={() =>
                        changeQty(item.cartKey || item.productId, 1)
                      }
                      aria-label={`Aumentar ${item.name}`}
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                </article>
              ))}
              <div className="digital-order-total">
                <span>Total da comanda</span>
                <strong>{money(total)}</strong>
              </div>
            </section>

            <section className="digital-table-identification">
              <div className="panel-title">
                <div>
                  <span>Identificação</span>
                  <h2>Onde você está?</h2>
                </div>
              </div>
              <label>
                Seu nome
                <input
                  required
                  minLength="2"
                  maxLength="80"
                  autoComplete="name"
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  placeholder="Nome para chamar na mesa"
                />
              </label>
              <label>
                Mesa
                <select
                  required
                  value={tableNumber}
                  disabled={loadingTables}
                  onChange={(event) => setTableNumber(event.target.value)}
                >
                  <option value="">
                    {loadingTables ? "Carregando mesas..." : "Selecione sua mesa"}
                  </option>
                  {tables.map((table) => (
                    <option key={table.number} value={table.number}>
                      {table.name} - {table.seats} lugar(es)
                    </option>
                  ))}
                </select>
              </label>
              <div className="digital-payment-note">
                <Clock3 />
                <div>
                  <b>Pagamento somente no fechamento</b>
                  <small>
                    A forma de pagamento será escolhida com a equipe depois do
                    atendimento.
                  </small>
                </div>
              </div>
              {error && <div className="form-error">{error}</div>}
              <button
                className="primary-btn full"
                disabled={submitting || loadingTables || !tables.length}
              >
                {submitting ? "Enviando para a cozinha..." : "Confirmar pedido da mesa"}
                {!submitting && <CheckCircle2 size={18} />}
              </button>
              <small className="digital-security-note">
                Confirme o número visível na sua mesa antes de enviar.
              </small>
            </section>
          </form>
        )}
      </main>
    </div>
  );
}
