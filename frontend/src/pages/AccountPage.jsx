import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Copy,
  Gift,
  Clock3,
  LogOut,
  MapPin,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  Save,
  ShoppingBag,
  UserRound,
  WalletCards,
  Plus,
  Trash2,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { api, authHeaders } from "../lib/api";
import { etaRange, formatCep, money } from "../lib/format";
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
const PAYMENT_LABEL = { CASH: "Dinheiro", CARD: "Pagamento online" };
const OPEN_STATUS = new Set([
  "SCHEDULED",
  "RECEIVED",
  "PREPARING",
  "OUT_FOR_DELIVERY",
  "READY_FOR_PICKUP",
  "READY_FOR_TABLE",
  "SERVED",
]);

export default function AccountPage({
  session,
  onLogout,
  onLogoutAll,
  onReorder,
  ordersOnly = false,
  settings = {},
}) {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reordering, setReordering] = useState("");
  const [addressSaving, setAddressSaving] = useState(false);
  const [addressMessage, setAddressMessage] = useState("");
  const user = session.user;
  const [address, setAddress] = useState({
    postalCode: formatCep(user.postalCode || ""),
    street: user.street || "",
    addressNumber: user.addressNumber || "",
    complement: user.complement || "",
    neighborhood: user.neighborhood || "",
    city: user.city || "",
    state: user.state || "",
    referencePoint: user.referencePoint || "",
  });
  const [favorites, setFavorites] = useState([]);
  const [rewards, setRewards] = useState(null);
  const [birthday, setBirthday] = useState("");
  const [favoriteLabel, setFavoriteLabel] = useState("Casa");
  async function loadOrders(silent = false) {
    if (!silent) setLoading(true);
    if (!silent) setError("");
    try {
      const { data } = await api.get("/me/orders", authHeaders(session.token));
      setOrders(data);
    } catch (err) {
      if (!silent)
        setError(
          err.response?.data?.message ||
            "Não foi possível carregar seus pedidos.",
        );
    } finally {
      if (!silent) setLoading(false);
    }
  }
  async function loadFavorites() {
    try {
      const { data } = await api.get(
        "/me/addresses",
        authHeaders(session.token),
      );
      setFavorites(data || []);
    } catch {}
  }
  async function loadGrowth() {
    try {
      const rewardResponse = await api.get(
        "/me/rewards",
        authHeaders(session.token),
      );
      setRewards(rewardResponse.data);
    } catch {}
  }
  useEffect(() => {
    loadOrders();
    loadFavorites();
    loadGrowth();
    const timer = window.setInterval(() => loadOrders(true), 20000);
    return () => window.clearInterval(timer);
  }, []);
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
  const active = ordered.filter((o) => OPEN_STATUS.has(o.status));
  const past = ordered.filter((o) => !OPEN_STATUS.has(o.status));
  const totalSpent = useMemo(
    () =>
      orders
        .filter((o) => o.status !== "CANCELED")
        .reduce((sum, o) => sum + Number(o.total), 0),
    [orders],
  );
  async function reorder(order) {
    setReordering(order.id);
    setError("");
    try {
      const { data } = await api.get(
        `/me/orders/${order.id}/reorder`,
        authHeaders(session.token),
      );
      onReorder(data.items);
      navigate("/carrinho");
    } catch (err) {
      setError(
        err.response?.data?.message || "Não foi possível repetir este pedido.",
      );
    } finally {
      setReordering("");
    }
  }
  async function saveAddress(event) {
    event.preventDefault();
    setAddressSaving(true);
    setAddressMessage("");
    try {
      const { data } = await api.patch(
        "/me/address",
        address,
        authHeaders(session.token),
      );
      setAddress({
        ...address,
        postalCode: formatCep(data.user.postalCode || address.postalCode),
      });
      setAddressMessage(
        "Endereço padrão atualizado. Ele será usado automaticamente no próximo checkout.",
      );
    } catch (err) {
      setError(
        err.response?.data?.message || "Não foi possível salvar o endereço.",
      );
    } finally {
      setAddressSaving(false);
    }
  }
  async function addFavorite() {
    const required = [
      "postalCode",
      "street",
      "addressNumber",
      "neighborhood",
      "city",
      "state",
    ];
    if (required.some((k) => !String(address[k] || "").trim()))
      return setError("Preencha o endereço antes de salvá-lo como favorito.");
    try {
      await api.post(
        "/me/addresses",
        {
          ...address,
          label: favoriteLabel || "Favorito",
          isDefault: favorites.length === 0,
        },
        authHeaders(session.token),
      );
      setAddressMessage("Endereço adicionado aos favoritos.");
      await loadFavorites();
    } catch (err) {
      setError(
        err.response?.data?.message || "Não foi possível salvar o favorito.",
      );
    }
  }
  async function makeDefault(row) {
    try {
      await api.patch(
        `/me/addresses/${row.id}`,
        { isDefault: true },
        authHeaders(session.token),
      );
      await loadFavorites();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Não foi possível definir o endereço padrão.",
      );
    }
  }
  async function removeFavorite(row) {
    if (!confirm(`Remover o endereço “${row.label}”?`)) return;
    try {
      await api.delete(`/me/addresses/${row.id}`, authHeaders(session.token));
      await loadFavorites();
    } catch (err) {
      setError(
        err.response?.data?.message || "Não foi possível remover o favorito.",
      );
    }
  }
  async function saveBirthday(event) {
    event.preventDefault();
    if (!birthday) return;
    try {
      await api.patch(
        "/me/birthday",
        { birthday },
        authHeaders(session.token),
      );
      setAddressMessage("Data de nascimento cadastrada.");
      await loadGrowth();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Não foi possível cadastrar a data de nascimento.",
      );
    }
  }

  return (
    <div className="page-shell account-page">
      <div className="container page-top">
        <Link to="/">
          <ArrowLeft size={16} /> Voltar ao início
        </Link>
      </div>
      <main className="container account-wrap">
        <section className="account-hero-card">
          <div className="account-avatar">
            <UserRound />
          </div>
          <div className="account-welcome">
            <span className="eyebrow dark">
              {ordersOnly ? "Seus pedidos" : "Minha conta"}
            </span>
            <h1>
              {ordersOnly
                ? "Seus pedidos, organizados."
                : `Olá, ${user.name.split(" ")[0]}.`}
            </h1>
            <p>
              {ordersOnly
                ? "Pedidos em andamento aparecem primeiro. Depois, você encontra todo o histórico."
                : "Seus dados e compras ficam organizados em um só lugar."}
            </p>
          </div>
          <div className="account-session-actions">
            {ordersOnly && (
              <CustomerOrderNotifications
                orders={orders}
                ready={!loading}
                settings={settings}
              />
            )}
            <button className="outline-btn" onClick={() => onLogout()}>
              <LogOut size={16} /> Sair
            </button>
          </div>
        </section>
        {!ordersOnly && (
          <>
            <section className="account-stats">
              <article>
                <ShoppingBag />
                <div>
                  <small>Pedidos</small>
                  <b>{orders.length}</b>
                </div>
              </article>
              <article>
                <PackageCheck />
                <div>
                  <small>Concluídos</small>
                  <b>{orders.filter((o) => o.status === "DELIVERED").length}</b>
                </div>
              </article>
              <article>
                <CalendarDays />
                <div>
                  <small>Total em pedidos</small>
                  <b>{money(totalSpent)}</b>
                </div>
              </article>
            </section>
            {rewards && (
              <section className="account-rewards-card">
                <div>
                  <span className="eyebrow dark"><WalletCards size={14} /> Benefícios</span>
                  <h2>Seu saldo para os próximos pedidos.</h2>
                  <p>
                    {rewards.mode === "POINTS"
                      ? `${rewards.loyaltyPoints} pontos disponíveis`
                      : rewards.mode === "CASHBACK"
                        ? `${money(rewards.cashbackBalance)} em cashback`
                        : "O programa de recompensas está pausado."}
                  </p>
                  {rewards.mode === "POINTS" && (
                    <small>
                      {rewards.loyaltyPoints >=
                      Number(rewards.settings?.loyaltyRewardPoints || 0)
                        ? `Você já pode trocar pontos por ${money(rewards.settings?.loyaltyRewardValue || 0)} no checkout.`
                        : `Faltam ${Math.max(0, Number(rewards.settings?.loyaltyRewardPoints || 0) - rewards.loyaltyPoints)} pontos para ganhar ${money(rewards.settings?.loyaltyRewardValue || 0)}.`}
                    </small>
                  )}
                  {rewards.birthday?.eligible && (
                    <strong className="birthday-benefit"><Gift size={16} /> Seu benefício de aniversário está disponível.</strong>
                  )}
                  {!rewards.birthdayDate && (
                    <form className="birthday-registration" onSubmit={saveBirthday}>
                      <label>
                        <CalendarDays size={15} /> Data de nascimento
                        <input
                          type="date"
                          value={birthday}
                          max={new Date().toISOString().slice(0, 10)}
                          onChange={(event) => setBirthday(event.target.value)}
                          required
                        />
                      </label>
                      <button className="ghost-dark-btn">Cadastrar</button>
                      <small>A data pode ser cadastrada uma vez. Ela será usada no benefício de aniversário.</small>
                    </form>
                  )}
                </div>
                {rewards.settings?.referralEnabled && (
                  <div className="invite-code-card">
                    <small>Seu código de indicação</small>
                    <b>{rewards.inviteCode}</b>
                    <button
                      type="button"
                      className="ghost-dark-btn"
                      onClick={() => {
                        const link = new URL("/cadastro", window.location.origin);
                        link.searchParams.set("convite", rewards.inviteCode);
                        navigator.clipboard?.writeText(link.href);
                        setAddressMessage("Link de indicação copiado.");
                      }}
                    >
                      <Copy size={15} /> Copiar link
                    </button>
                    <span>{rewards.referrals} indicação(ões) cadastrada(s)</span>
                  </div>
                )}
              </section>
            )}
            {rewards?.transactions?.length > 0 && (
              <section className="reward-history-card">
                <div className="section-heading compact-heading">
                  <div>
                    <span className="eyebrow dark"><Clock3 size={14} /> Histórico de benefícios</span>
                    <h2>Entradas e utilizações.</h2>
                  </div>
                </div>
                <div className="reward-history-list">
                  {rewards.transactions.map((transaction) => {
                    const points = Number(transaction.points || 0);
                    const amount = Number(transaction.amount || 0);
                    const positive = points > 0 || amount > 0;
                    return (
                      <article key={transaction.id}>
                        <span>
                          <b>{transaction.description}</b>
                          <small>{new Date(transaction.createdAt).toLocaleDateString("pt-BR")}</small>
                        </span>
                        <strong className={positive ? "positive" : "negative"}>
                          {points
                            ? `${points > 0 ? "+" : ""}${points} pts`
                            : `${amount > 0 ? "+" : ""}${money(amount)}`}
                        </strong>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}
            <section className="account-profile-card">
              <div>
                <small>E-mail cadastrado</small>
                <b>{user.email}</b>
              </div>
              <div>
                <small>Telefone cadastrado</small>
                <b>{formatAccountPhone(user.phone)}</b>
              </div>
              <button className="text-refresh" onClick={() => loadOrders()}>
                <RefreshCw size={15} /> Atualizar histórico
              </button>
              <button className="text-refresh danger" onClick={() => onLogoutAll?.()}>
                <LogOut size={15} /> Sair de todos os aparelhos
              </button>
            </section>
            <form className="account-address-card" onSubmit={saveAddress}>
              <div className="section-heading compact-heading">
                <div>
                  <span className="eyebrow dark">
                    <MapPin size={14} /> Endereço padrão
                  </span>
                  <h2>Seu endereço mais recente.</h2>
                  <p>
                    O checkout preenche estes dados automaticamente. Quando você
                    usar outro endereço em uma compra, ele passa a ser o novo
                    padrão e substitui o anterior.
                  </p>
                </div>
              </div>
              <div className="form-grid address-grid">
                <label>
                  CEP
                  <input
                    value={address.postalCode}
                    onChange={(e) =>
                      setAddress({
                        ...address,
                        postalCode: formatCep(e.target.value),
                      })
                    }
                    placeholder="00000-000"
                  />
                </label>
                <label>
                  Estado
                  <input
                    value={address.state}
                    onChange={(e) =>
                      setAddress({ ...address, state: e.target.value })
                    }
                  />
                </label>
                <label>
                  Cidade
                  <input
                    value={address.city}
                    onChange={(e) =>
                      setAddress({ ...address, city: e.target.value })
                    }
                  />
                </label>
                <label>
                  Bairro
                  <input
                    value={address.neighborhood}
                    onChange={(e) =>
                      setAddress({ ...address, neighborhood: e.target.value })
                    }
                  />
                </label>
                <label className="span-2">
                  Rua
                  <input
                    value={address.street}
                    onChange={(e) =>
                      setAddress({ ...address, street: e.target.value })
                    }
                  />
                </label>
                <label>
                  Número
                  <input
                    value={address.addressNumber}
                    onChange={(e) =>
                      setAddress({ ...address, addressNumber: e.target.value })
                    }
                  />
                </label>
                <label>
                  Complemento (opcional)
                  <input
                    value={address.complement}
                    onChange={(e) =>
                      setAddress({ ...address, complement: e.target.value })
                    }
                  />
                </label>
                <label className="span-2">
                  Ponto de referência
                  <input
                    value={address.referencePoint}
                    onChange={(e) =>
                      setAddress({ ...address, referencePoint: e.target.value })
                    }
                  />
                </label>
              </div>
              {addressMessage && (
                <div className="account-address-success">{addressMessage}</div>
              )}
              <div className="account-address-actions">
                <button className="primary-btn" disabled={addressSaving}>
                  <Save size={16} />
                  {addressSaving ? "Salvando..." : "Salvar endereço padrão"}
                </button>
                <div className="favorite-address-create">
                  <input
                    value={favoriteLabel}
                    onChange={(e) => setFavoriteLabel(e.target.value)}
                    placeholder="Nome: Casa, Trabalho..."
                  />
                  <button
                    type="button"
                    className="ghost-dark-btn"
                    onClick={addFavorite}
                  >
                    <Plus size={15} /> Salvar como favorito
                  </button>
                </div>
              </div>
            </form>
            <section className="favorite-address-card">
              <div className="section-heading compact-heading">
                <div>
                  <span className="eyebrow dark">
                    <MapPin size={14} /> Endereços favoritos
                  </span>
                  <h2>Escolha rápido no checkout.</h2>
                </div>
              </div>
              <div className="favorite-address-list">
                {favorites.map((row) => (
                  <article
                    key={row.id}
                    className={row.isDefault ? "default" : ""}
                  >
                    <div>
                      <b>
                        {row.label}
                        {row.isDefault && <em>Padrão</em>}
                      </b>
                      <small>
                        {row.street}, {row.addressNumber} • {row.neighborhood},{" "}
                        {row.city}/{row.state}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="ghost-dark-btn"
                      disabled={row.isDefault}
                      onClick={() => makeDefault(row)}
                    >
                      {row.isDefault ? "Padrão" : "Tornar padrão"}
                    </button>
                    <button
                      type="button"
                      className="subtle-danger"
                      onClick={() => removeFavorite(row)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </article>
                ))}
                {!favorites.length && (
                  <p className="empty-inline">
                    Nenhum endereço favorito salvo ainda.
                  </p>
                )}
              </div>
            </section>
          </>
        )}
        {error && <div className="form-error account-error">{error}</div>}
        {loading ? (
          <div className="history-empty">Carregando seus pedidos...</div>
        ) : !orders.length ? (
          <div className="history-empty">
            <ShoppingBag />
            <h3>Seu histórico ainda está vazio</h3>
            <p>Faça um pedido conectado à sua conta e ele aparecerá aqui.</p>
            <Link className="primary-btn" to="/#cardapio">
              Escolher produtos
            </Link>
          </div>
        ) : (
          <>
            {active.length > 0 && (
              <section className="orders-history active-orders">
                <div className="section-heading compact-heading">
                  <div>
                    <span className="eyebrow dark">Em andamento</span>
                    <h2>Pedidos que precisam da sua atenção.</h2>
                    <p>Estes ficam sempre acima do histórico.</p>
                  </div>
                  <button className="text-refresh" onClick={() => loadOrders()}>
                    <RefreshCw size={15} /> Atualizar
                  </button>
                </div>
                <div className="history-list">
                  {active.map((o) => (
                    <OrderCard
                      key={o.id}
                      order={o}
                      reorder={reorder}
                      reordering={reordering}
                      token={session.token}
                      onCanceled={(updated) =>
                        setOrders((rows) =>
                          rows.map((row) =>
                            row.id === updated.id ? updated : row,
                          ),
                        )
                      }
                    />
                  ))}
                </div>
              </section>
            )}
            <section className="orders-history">
              <div className="section-heading compact-heading">
                <div>
                  <span className="eyebrow dark">
                    {active.length ? "Histórico" : "Seus pedidos"}
                  </span>
                  <h2>
                    {active.length
                      ? "Pedidos anteriores."
                      : "Mais recentes primeiro."}
                  </h2>
                  <p>
                    Você pode abrir o andamento ou repetir um pedido com os
                    preços atuais.
                  </p>
                </div>
                {!active.length && (
                  <button className="text-refresh" onClick={() => loadOrders()}>
                    <RefreshCw size={15} /> Atualizar
                  </button>
                )}
              </div>
              <div className="history-list">
                {(active.length ? past : ordered).map((o) => (
                  <OrderCard
                    key={o.id}
                    order={o}
                    reorder={reorder}
                    reordering={reordering}
                    token={session.token}
                    onCanceled={(updated) =>
                      setOrders((rows) =>
                        rows.map((row) => (row.id === updated.id ? updated : row)),
                      )
                    }
                  />
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function OrderCard({ order, reorder, reordering, token, onCanceled }) {
  return (
    <article
      className={`history-card status-${order.status.toLowerCase()} ${OPEN_STATUS.has(order.status) ? "priority-order" : ""}`}
    >
      <div className="history-card-top">
        <div>
          <small>Pedido</small>
          <b>#{order.shortCode}</b>
        </div>
        <div>
          <small>Data</small>
          <b>
            {new Date(order.createdAt).toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </b>
        </div>
        <span className={`history-status status-${order.status.toLowerCase()}`}>
          {OPEN_STATUS.has(order.status) && <Clock3 size={13} />}{" "}
          {STATUS_LABEL[order.status] || order.status}
        </span>
      </div>
      <div className="history-items">
        {order.items.map((item) => (
          <div className="history-item-rich" key={item.id}>
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
            {item.notes && <small>Detalhe: {item.notes}</small>}
          </div>
        ))}
      </div>
      {etaRange(order) &&
        order.status !== "DELIVERED" &&
        order.status !== "CANCELED" && (
          <div className="history-eta">
            <Clock3 size={15} />
            <span>
              {order.fulfillmentType === "PICKUP"
                ? "Previsão para ficar pronto"
                : "Previsão de entrega"}
            </span>
            <b>{etaRange(order)}</b>
          </div>
        )}
      {!etaRange(order) && order.status === "RECEIVED" && (
        <div className="history-eta waiting">
          <Clock3 size={15} />
          <span>Aguardando aceite da loja</span>
          <b>Previsão em breve</b>
        </div>
      )}
      {order.status === "CANCELED" && order.cancelReason && (
        <div className="public-cancel-reason">
          <b>Pedido cancelado</b>
          <span>{order.cancelReason}</span>
        </div>
      )}
      <div className="history-meta">
        <span>
          {order.fulfillmentType === "PICKUP"
            ? "Retirada na loja"
            : `Entrega • ${order.neighborhood || order.city || ""}`}
        </span>
        <span>
          {order.paymentMethodLabel ||
            PAYMENT_LABEL[order.paymentMethod] ||
            order.paymentMethod}
        </span>
        {order.scheduledAt && (
          <span>
            Agendado: {new Date(order.scheduledAt).toLocaleString("pt-BR")}
          </span>
        )}
      </div>
      <div className="history-bottom">
        <strong>{money(order.total)}</strong>
        <div>
          <Link className="ghost-dark-btn" to={`/pedido/${order.trackingCode}`}>
            Ver andamento
          </Link>
          <button
            disabled={reordering === order.id || order.status === "CANCELED"}
            className="primary-btn"
            onClick={() => reorder(order)}
          >
            <RotateCcw size={16} />
            {reordering === order.id ? "Carregando..." : "Pedir novamente"}
          </button>
        </div>
      </div>
      <CustomerCancelOrderButton
        order={order}
        token={token}
        onCanceled={onCanceled}
      />
    </article>
  );
}
function formatAccountPhone(phone = "") {
  const d = String(phone).replace(/\D/g, "");
  if (d.length === 11)
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10)
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}
