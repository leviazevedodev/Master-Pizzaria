import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Clock3,
  PackageSearch,
  Search,
  ShoppingBag,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { api, authHeaders } from "../lib/api";
import { etaRange, money } from "../lib/format";
import { readStoredStringArray, writeStoredJson } from "../lib/storage";
import CustomerOrderNotifications from "../components/CustomerOrderNotifications";
import CustomerCancelOrderButton from "../components/CustomerCancelOrderButton";

const STATUS_LABEL = {
  SCHEDULED: "Agendado",
  RECEIVED: "Recebido",
  PREPARING: "Em preparação",
  OUT_FOR_DELIVERY: "Entregando",
  READY_FOR_PICKUP: "Pronto para retirada",
  READY_FOR_TABLE: "Pronto para servir",
  SERVED: "Aguardando fechamento",
  DELIVERED: "Entregue",
  CANCELED: "Cancelado",
};
const OPEN_STATUS = new Set([
  "SCHEDULED",
  "RECEIVED",
  "PREPARING",
  "OUT_FOR_DELIVERY",
  "READY_FOR_PICKUP",
  "READY_FOR_TABLE",
  "SERVED",
]);

function readCodes() {
  return readStoredStringArray(localStorage, "master-pizza-guest-orders", 20);
}
const GUEST_ACCESS_KEY = "master-pizza-guest-access";

export default function GuestOrdersPage({ settings = {} }) {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [guestAccess, setGuestAccess] = useState(() => {
    try { return JSON.parse(localStorage.getItem(GUEST_ACCESS_KEY) || "null"); }
    catch { return null; }
  });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [accessBusy, setAccessBusy] = useState(false);
  async function loadSaved(silent = false) {
    if (!silent) setLoading(true);
    if (!silent) setError("");
    const codes = readCodes();
    const results = await Promise.all(
      codes.map(async (code) => {
        try {
          return (await api.get(`/orders/track/${encodeURIComponent(code)}`))
            .data;
        } catch {
          return null;
        }
      }),
    );
    let remote = [];
    if (guestAccess?.token) {
      try {
        remote = (await api.get("/guest-orders", authHeaders(guestAccess.token))).data;
      } catch (err) {
        if (err.response?.status === 401) {
          localStorage.removeItem(GUEST_ACCESS_KEY);
          setGuestAccess(null);
        } else if (!silent) setError("Não foi possível atualizar o histórico. Tente novamente.");
      }
    }
    setOrders([...new Map([...results.filter(Boolean), ...remote].map((order) => [order.trackingCode, order])).values()]);
    if (!silent) setLoading(false);
  }
  useEffect(() => {
    loadSaved();
    const refresh = () => {
      if (document.visibilityState === "visible") void loadSaved(true);
    };
    const timer = window.setInterval(refresh, 5000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [guestAccess?.token]);
  async function requestAccess(event) {
    event.preventDefault();
    setAccessBusy(true);
    setError("");
    try {
      await api.post("/guest-orders/request-access", { email: email.trim().toLowerCase() });
      setCodeSent(true);
    } catch (err) {
      setError(err.response?.data?.message || "Não foi possível enviar o código. Tente novamente.");
    } finally { setAccessBusy(false); }
  }
  async function verifyAccess(event) {
    event.preventDefault();
    setAccessBusy(true);
    setError("");
    try {
      const { data } = await api.post("/guest-orders/verify", { email: email.trim().toLowerCase(), code });
      localStorage.setItem(GUEST_ACCESS_KEY, JSON.stringify(data));
      await Promise.allSettled(readCodes().map((trackingCode) =>
        api.post("/guest-orders/claim", { trackingCode }, authHeaders(data.token))));
      setGuestAccess(data);
      setCode("");
    } catch (err) {
      setError(err.response?.data?.message || "Não foi possível confirmar o código.");
    } finally { setAccessBusy(false); }
  }
  const ordered = useMemo(
    () =>
      [...orders].sort((a, b) => {
        const ao = OPEN_STATUS.has(a.status) ? 0 : 1,
          bo = OPEN_STATUS.has(b.status) ? 0 : 1;
        if (ao !== bo) return ao - bo;
        return new Date(b.createdAt) - new Date(a.createdAt);
      }),
    [orders],
  );
  async function submit(e) {
    e.preventDefault();
    const code = input.trim();
    if (!/^[a-f0-9-]{36}$/i.test(code)) return setError("Digite o código completo do pedido.");
    writeStoredJson(localStorage, "master-pizza-guest-orders", [code, ...readCodes().filter((value) => value !== code)].slice(0, 20));
    if (guestAccess?.token) {
      try { await api.post("/guest-orders/claim", { trackingCode: code }, authHeaders(guestAccess.token)); }
      catch (error) {
        if (error.response?.status !== 404) setError("Não foi possível salvar este pedido no histórico, mas você ainda pode acompanhá-lo pelo código.");
      }
    }
    navigate(`/pedido/${code}`);
  }
  return (
    <div className="page-shell">
      <div className="container page-top">
        <Link to="/">
          <ArrowLeft size={16} /> Voltar ao início
        </Link>
      </div>
      <main className="container guest-orders-page">
        <section className="guest-orders-hero">
          <div>
            <span className="eyebrow dark">Seus pedidos</span>
            <h1 className="page-title">
              Acompanhe sem precisar <em>criar conta.</em>
            </h1>
            <p>
              Seus pedidos neste navegador aparecem abaixo. Para ver também os pedidos do app instalado ou de outro aparelho, confirme o e-mail usado na compra.
            </p>
          </div>
          <form className="guest-order-search" onSubmit={submit}>
            <Search />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Código completo do pedido"
            />
            <button className="primary-btn">Acompanhar</button>
          </form>
          {guestAccess?.token ? (
            <div className="guest-access-status">Histórico sincronizado com {guestAccess.email}. <button type="button" className="text-button" onClick={() => { localStorage.removeItem(GUEST_ACCESS_KEY); setGuestAccess(null); }}>Trocar e-mail</button></div>
          ) : (
            <form className="guest-access-form" onSubmit={codeSent ? verifyAccess : requestAccess}>
              <label>E-mail usado na compra<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="voce@exemplo.com" /></label>
              {codeSent && <label>Código enviado por e-mail<input inputMode="numeric" pattern="[0-9]{6}" maxLength="6" required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder="000000" /></label>}
              <button type="submit" className="primary-btn" disabled={accessBusy}>{accessBusy ? "Aguarde..." : codeSent ? "Confirmar código" : "Receber código de acesso"}</button>
              {codeSent && <button type="button" className="text-button" onClick={() => { setCodeSent(false); setCode(""); }}>Alterar e-mail ou reenviar</button>}
            </form>
          )}
          <CustomerOrderNotifications
            orders={orders}
            ready={!loading}
            settings={settings}
          />
        </section>
        {error && <div className="form-error">{error}</div>}
        {loading ? (
          <div className="history-empty">
            Buscando seus pedidos...
          </div>
        ) : ordered.length ? (
          <section className="orders-history">
            <div className="section-heading compact-heading">
              <div>
                <span className="eyebrow dark">Seu histórico</span>
                <h2>Pedidos recentes.</h2>
                <p>Pedidos em andamento e agendados ficam no topo.</p>
              </div>
            </div>
            <div className="history-list">
              {ordered.map((o) => (
                <article
                  key={o.trackingCode}
                  className={`history-card status-${String(o.status).toLowerCase()} ${OPEN_STATUS.has(o.status) ? "priority-order" : ""}`}
                >
                  <div className="history-card-top">
                    <div>
                      <small>Pedido</small>
                      <b>#{o.shortCode}</b>
                    </div>
                    <div>
                      <small>Data</small>
                      <b>
                        {new Date(o.createdAt).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </b>
                    </div>
                    <span
                      className={`history-status status-${String(o.status).toLowerCase()}`}
                    >
                      {OPEN_STATUS.has(o.status) && <Clock3 size={13} />}{" "}
                      {STATUS_LABEL[o.status] || o.status}
                    </span>
                  </div>
                  {o.scheduledAt && (
                    <div className="guest-schedule-line">
                      Agendado para{" "}
                      <b>{new Date(o.scheduledAt).toLocaleString("pt-BR")}</b>
                    </div>
                  )}
                  {etaRange(o) &&
                    o.status !== "DELIVERED" &&
                    o.status !== "CANCELED" && (
                      <div className="history-eta">
                        <Clock3 size={15} />
                        <span>
                          {o.fulfillmentType === "PICKUP"
                            ? "Previsão para ficar pronto"
                            : "Previsão de entrega"}
                        </span>
                        <b>{etaRange(o)}</b>
                      </div>
                    )}
                  {!etaRange(o) && o.status === "RECEIVED" && (
                    <div className="history-eta waiting">
                      <Clock3 size={15} />
                      <span>Aguardando aceite da loja</span>
                      <b>Previsão em breve</b>
                    </div>
                  )}
                  {o.status === "CANCELED" && o.cancelReason && (
                    <div className="public-cancel-reason">
                      <b>Pedido cancelado</b>
                      <span>{o.cancelReason}</span>
                    </div>
                  )}
                  <div className="history-items">
                    {o.items?.slice(0, 4).map((item) => (
                      <div className="history-item-rich" key={item.id}>
                        <p>
                          <span>
                            {item.quantity}× {item.name}
                          </span>
                          <b>{money(Number(item.unitPrice) * item.quantity)}</b>
                        </p>
                        {item.options?.length > 0 && (
                          <small>
                            {item.options
                              .map(
                                (opt) => `${opt.groupName}: ${opt.optionName}`,
                              )
                              .join(" • ")}
                          </small>
                        )}
                        {item.notes && <small>Detalhe: {item.notes}</small>}
                      </div>
                    ))}
                  </div>
                  <div className="history-bottom">
                    <strong>{money(o.total)}</strong>
                    <Link
                      className="primary-btn"
                      to={`/pedido/${o.trackingCode}`}
                    >
                      Ver andamento
                    </Link>
                  </div>
                  <CustomerCancelOrderButton
                    order={o}
                    onCanceled={(updated) =>
                      setOrders((rows) =>
                        rows.map((row) =>
                          row.trackingCode === updated.trackingCode ? updated : row,
                        ),
                      )
                    }
                  />
                </article>
              ))}
            </div>
          </section>
        ) : (
          <div className="history-empty">
            <ShoppingBag />
            <h3>Nenhum pedido encontrado</h3>
            <p>
              Você ainda pode acompanhar qualquer compra usando o código do
              pedido acima.
            </p>
            <Link className="ghost-dark-btn" to="/#cardapio">
              Ver cardápio
            </Link>
          </div>
        )}
        <div className="guest-account-hint">
          <PackageSearch />
          <div>
            <b>Quer histórico em todos os aparelhos?</b>
            <p>
              Crie uma conta e seus próximos pedidos ficam associados ao seu
              perfil.
            </p>
          </div>
          <Link to="/cadastro">Criar conta</Link>
        </div>
      </main>
    </div>
  );
}
