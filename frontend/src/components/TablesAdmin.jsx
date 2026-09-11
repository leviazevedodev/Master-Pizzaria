import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Armchair,
  Check,
  ChefHat,
  Clock3,
  CreditCard,
  History,
  Minus,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Trash2,
  Users,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { api, authHeaders, mediaUrl } from "../lib/api";
import { money } from "../lib/format";
import PizzaBuilderModal from "./PizzaBuilderModal";
import { isTableCatalogProduct } from "../lib/productCustomizer";

const STATUS = {
  RECEIVED: "Enviado à cozinha",
  PREPARING: "Em preparo",
  READY_FOR_TABLE: "Pronto para servir",
  SERVED: "Servido",
  DELIVERED: "Pago",
  CANCELED: "Cancelado",
};
const PAYMENT = {
  CASH: "Dinheiro",
  PIX: "Pix",
  MACHINE_PIX: "Pix na maquineta",
  DEBIT: "Cartão de débito",
  CREDIT: "Cartão de crédito",
  BANESE_DEBIT: "Banese débito",
};
const EMPTY_TABLE = {
  id: null,
  number: "",
  name: "",
  seats: 4,
  location: "",
  sortOrder: 0,
};
const EMPTY_OPEN = { customerName: "", guestCount: 1 };

function elapsedLabel(date) {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(date).getTime()) / 60000),
  );
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
}

function sessionTitle(table) {
  return table.currentSession?.customerName || table.label;
}

export default function TablesAdmin({
  session,
  settings = {},
  notify = () => {},
  fail = () => {},
}) {
  const headers = authHeaders(session.token);
  const canConfigure = session.user.staffRole !== "WAITER";
  const [tables, setTables] = useState([]);
  const [history, setHistory] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [tableForm, setTableForm] = useState(null);
  const [openTarget, setOpenTarget] = useState(null);
  const [openForm, setOpenForm] = useState(EMPTY_OPEN);
  const [builderProduct, setBuilderProduct] = useState(null);
  const [cart, setCart] = useState([]);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [cancelOrder, setCancelOrder] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [closeForm, setCloseForm] = useState({
    paymentMethod: "CASH",
    amountPaid: "",
  });
  const orderPanelRef = useRef(null);
  const paymentOptions = useMemo(
    () => [
      ...Object.entries(PAYMENT).map(([value, label]) => ({ value, label })),
      ...(settings.customPaymentMethods || [])
        .filter(
          (method) => method.active !== false && method.tableEnabled !== false,
        )
        .map((method) => ({
          value: `CUSTOM:${method.id}`,
          label: method.label,
        })),
    ],
    [settings.customPaymentMethods],
  );

  async function load({ quiet = false } = {}) {
    if (!quiet) setLoading(true);
    try {
      const tablePath = `/admin/tables${canConfigure && showInactive ? "?all=1" : ""}`;
      const tableResult = await api.get(tablePath, headers);
      const historyResult = await api.get(
        "/admin/table-sessions/history?limit=30",
        headers,
      );
      setTables(tableResult.data);
      setHistory(historyResult.data);
      if (!quiet) {
        const productResult = await api.get("/products");
        const categoryResult = await api.get("/categories");
        setCatalog(productResult.data.filter(isTableCatalogProduct));
        setCategories(categoryResult.data);
      }
    } catch (error) {
      if (!quiet) fail(error, "Não foi possível carregar as mesas.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [showInactive]);
  useEffect(() => {
    const timer = window.setInterval(() => load({ quiet: true }), 7000);
    return () => window.clearInterval(timer);
  }, [showInactive]);

  const selected = tables.find((table) => table.id === selectedId) || null;
  const activeOrders = selected?.currentSession?.orders?.filter(
    (order) => order.status !== "CANCELED",
  ) || [];
  const hasKitchenPending = activeOrders.some((order) =>
    ["RECEIVED", "PREPARING"].includes(order.status),
  );
  const filteredCatalog = useMemo(() => {
    const query = catalogSearch.trim().toLocaleLowerCase("pt-BR");
    return catalog.filter(
      (product) =>
        (!categoryId || product.categoryId === categoryId) &&
        (!query ||
          `${product.name} ${product.description || ""}`
            .toLocaleLowerCase("pt-BR")
            .includes(query)),
    );
  }, [catalog, catalogSearch, categoryId]);
  const cartTotal = cart.reduce(
    (sum, item) => sum + Number(item.price) * Number(item.quantity),
    0,
  );

  function scrollToOrderPanelOnMobile() {
    if (!window.matchMedia("(max-width: 760px)").matches) return;
    window.setTimeout(() => {
      orderPanelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 120);
  }

  function selectOccupiedTable(table) {
    setSelectedId(table.id);
    scrollToOrderPanelOnMobile();
  }

  function addToCart(item) {
    setCart((current) => {
      const found = current.find((row) => row.cartKey === item.cartKey);
      return found
        ? current.map((row) =>
            row.cartKey === item.cartKey
              ? { ...row, quantity: row.quantity + 1 }
              : row,
          )
        : [...current, item];
    });
    notify(`${item.name} adicionado à próxima rodada.`);
  }
  function changeQuantity(cartKey, delta) {
    setCart((current) =>
      current
        .map((item) =>
          item.cartKey === cartKey
            ? { ...item, quantity: item.quantity + delta }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }

  async function saveTable(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        number: Number(tableForm.number),
        name: tableForm.name,
        seats: Number(tableForm.seats),
        location: tableForm.location,
        sortOrder: Number(tableForm.sortOrder || tableForm.number),
      };
      if (tableForm.id)
        await api.patch(`/admin/tables/${tableForm.id}`, payload, headers);
      else await api.post("/admin/tables", payload, headers);
      notify(tableForm.id ? "Mesa atualizada." : "Mesa cadastrada.");
      setTableForm(null);
      await load({ quiet: true });
    } catch (error) {
      fail(error, "Não foi possível salvar a mesa.");
    } finally {
      setSaving(false);
    }
  }

  async function createDefaultTables() {
    setSaving(true);
    try {
      const { data } = await api.post(
        "/admin/tables/bulk",
        { startNumber: 1, count: 10, seats: 4 },
        headers,
      );
      notify(`${data.created} mesa(s) criada(s).`);
      await load({ quiet: true });
    } catch (error) {
      fail(error, "Não foi possível criar as mesas iniciais.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleTable(table, active) {
    setSaving(true);
    try {
      await api.patch(`/admin/tables/${table.id}`, { active }, headers);
      notify(active ? "Mesa reativada." : "Mesa desativada.");
      if (!active && selectedId === table.id) setSelectedId(null);
      await load({ quiet: true });
    } catch (error) {
      fail(error, "Não foi possível alterar a mesa.");
    } finally {
      setSaving(false);
    }
  }

  async function openSession(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.post(
        `/admin/tables/${openTarget.id}/open`,
        {
          customerName: openForm.customerName,
          guestCount: Number(openForm.guestCount),
        },
        headers,
      );
      notify(`${openTarget.label} aberta para atendimento.`);
      setSelectedId(openTarget.id);
      setOpenTarget(null);
      setOpenForm(EMPTY_OPEN);
      await load({ quiet: true });
      scrollToOrderPanelOnMobile();
    } catch (error) {
      fail(error, "Não foi possível abrir a mesa.");
    } finally {
      setSaving(false);
    }
  }

  async function submitRound() {
    if (!selected?.currentSession || !cart.length) return;
    setSaving(true);
    try {
      await api.post(
        "/orders",
        {
          fulfillmentType: "DINE_IN",
          tableSessionId: selected.currentSession.id,
          customerName: sessionTitle(selected),
          paymentMethod: "CASH",
          items: cart.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            notes: item.notes,
            sizeId: item.sizeId,
            flavorIds: item.flavorIds,
            optionIds: item.optionIds,
          })),
        },
        headers,
      );
      notify("Rodada enviada para a cozinha.");
      setCart([]);
      await load({ quiet: true });
    } catch (error) {
      fail(error, "Não foi possível lançar os itens na mesa.");
    } finally {
      setSaving(false);
    }
  }

  async function markServed(order) {
    setSaving(true);
    try {
      await api.post(`/admin/table-orders/${order.id}/served`, {}, headers);
      notify(`Pedido #${order.shortCode} marcado como servido.`);
      await load({ quiet: true });
    } catch (error) {
      fail(error, "Não foi possível confirmar a entrega na mesa.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmCancelOrder(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.post(
        `/admin/table-orders/${cancelOrder.id}/cancel`,
        { reason: cancelReason },
        headers,
      );
      notify("Item/rodada cancelado com registro no histórico.");
      setCancelOrder(null);
      setCancelReason("");
      await load({ quiet: true });
    } catch (error) {
      fail(error, "Não foi possível cancelar o pedido.");
    } finally {
      setSaving(false);
    }
  }

  async function closeSession(event) {
    event.preventDefault();
    if (!selected?.currentSession) return;
    setSaving(true);
    try {
      const { data } = await api.post(
        `/admin/table-sessions/${selected.currentSession.id}/close`,
        closeForm,
        headers,
      );
      notify(
        data.changeAmount > 0
          ? `Pagamento baixado. Troco: ${money(data.changeAmount)}.`
          : "Pagamento baixado e mesa liberada.",
      );
      setCloseForm({ paymentMethod: "CASH", amountPaid: "" });
      setCart([]);
      await load({ quiet: true });
    } catch (error) {
      fail(error, "Não foi possível fechar a comanda.");
    } finally {
      setSaving(false);
    }
  }

  async function cancelSession() {
    if (!selected?.currentSession) return;
    const hasOrders = activeOrders.length > 0;
    const reason = hasOrders
      ? window.prompt(
          "Esta ação cancela todos os pedidos ainda vinculados. Informe o motivo:",
        )
      : "Comanda aberta sem consumo";
    if (!reason || (hasOrders && reason.trim().length < 3)) return;
    if (
      hasOrders &&
      !window.confirm(
        `Cancelar ${activeOrders.length} pedido(s) e liberar ${selected.label}?`,
      )
    )
      return;
    setSaving(true);
    try {
      await api.post(
        `/admin/table-sessions/${selected.currentSession.id}/cancel`,
        { cancelOrders: hasOrders, reason },
        headers,
      );
      notify("Comanda cancelada e mesa liberada.");
      setCart([]);
      await load({ quiet: true });
    } catch (error) {
      fail(error, "Não foi possível cancelar a comanda.");
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <section className="admin-panel table-loading">
        <RefreshCw className="spin" /> Carregando salão...
      </section>
    );

  return (
    <div className="tables-admin-page">
      <section className="admin-panel tables-hero">
        <div>
          <span className="eyebrow dark">Atendimento presencial</span>
          <h2>Salão e comandas</h2>
          <p>
            Abra uma mesa, envie rodadas à cozinha, confirme o serviço e dê
            baixa no pagamento. A mesa só é liberada após o fechamento.
          </p>
        </div>
        <div className="tables-hero-actions">
          <span>
            <Armchair size={18} /> {tables.filter((table) => table.active).length} mesas
          </span>
          <span className="occupied">
            {tables.filter((table) => table.occupied).length} ocupadas
          </span>
          <button type="button" className="ghost-dark-btn" onClick={() => load()}>
            <RefreshCw size={16} /> Atualizar
          </button>
          {canConfigure && (
            <button
              type="button"
              className="primary-btn"
              onClick={() => setTableForm({ ...EMPTY_TABLE })}
            >
              <Plus size={16} /> Nova mesa
            </button>
          )}
        </div>
      </section>

      {canConfigure && (
        <label className="tables-inactive-toggle">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(event) => setShowInactive(event.target.checked)}
          />
          Mostrar mesas desativadas
        </label>
      )}

      <section className="table-grid" aria-label="Mapa de mesas">
        {tables.map((table) => {
          const summary = table.currentSession?.summary;
          return (
            <article
              key={table.id}
              className={`table-card ${table.occupied ? "occupied" : "free"} ${!table.active ? "inactive" : ""} ${selectedId === table.id ? "selected" : ""}`}
            >
              <button
                type="button"
                className="table-card-main"
                disabled={!table.active}
                onClick={() =>
                  table.occupied
                    ? selectOccupiedTable(table)
                    : (setOpenTarget(table), setOpenForm(EMPTY_OPEN))
                }
              >
                <span className="table-number">{table.number}</span>
                <span>
                  <b>{table.label}</b>
                  <small>
                    <Users size={13} /> {table.seats} lugares
                    {table.location ? ` • ${table.location}` : ""}
                  </small>
                </span>
                <em>{!table.active ? "DESATIVADA" : table.occupied ? "OCUPADA" : "LIVRE"}</em>
                {table.occupied && (
                  <div className="table-card-summary">
                    <strong>{sessionTitle(table)}</strong>
                    <small>
                      <Clock3 size={13} /> {elapsedLabel(table.currentSession.openedAt)}
                    </small>
                    <b>{money(summary?.subtotal || 0)}</b>
                    {summary?.readyCount > 0 && (
                      <mark>{summary.readyCount} pronto(s) para servir</mark>
                    )}
                  </div>
                )}
              </button>
              {canConfigure && (
                <div className="table-card-tools">
                  <button
                    type="button"
                    title="Editar mesa"
                    onClick={() => setTableForm({ ...table })}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    title={table.active ? "Desativar mesa" : "Reativar mesa"}
                    disabled={saving || table.occupied}
                    onClick={() => toggleTable(table, !table.active)}
                  >
                    {table.active ? <Trash2 size={14} /> : <Check size={14} />}
                  </button>
                </div>
              )}
            </article>
          );
        })}
        {!tables.length && (
          <div className="table-empty-state">
            <Armchair />
            <h3>Nenhuma mesa cadastrada</h3>
            <p>Cadastre as mesas do salão para iniciar o atendimento.</p>
            {canConfigure && (
              <button className="primary-btn" disabled={saving} onClick={createDefaultTables}>
                <Plus size={16} /> Criar mesas 1 a 10
              </button>
            )}
          </div>
        )}
      </section>

      {selected?.currentSession && (
        <section className="table-workspace">
          <div className="admin-panel table-session-panel">
            <div className="table-session-head">
              <div>
                <span className="eyebrow dark">Comanda aberta</span>
                <h2>{selected.label}</h2>
                <p>
                  {sessionTitle(selected)} • {selected.currentSession.guestCount || "—"} pessoa(s) • aberta por {selected.currentSession.openedByName}
                </p>
              </div>
              <button className="icon-close" onClick={() => setSelectedId(null)} aria-label="Fechar detalhes">
                <X />
              </button>
            </div>
            <div className="table-session-kpis">
              <article>
                <ReceiptText />
                <span><small>Rodadas</small><b>{selected.currentSession.summary.orderCount}</b></span>
              </article>
              <article>
                <UtensilsCrossed />
                <span><small>Itens</small><b>{selected.currentSession.summary.itemCount}</b></span>
              </article>
              <article>
                <Clock3 />
                <span><small>Tempo</small><b>{elapsedLabel(selected.currentSession.openedAt)}</b></span>
              </article>
              <article>
                <CreditCard />
                <span><small>Total</small><b>{money(selected.currentSession.summary.subtotal)}</b></span>
              </article>
            </div>

            <div className="table-rounds">
              {selected.currentSession.orders.map((order, index) => (
                <article key={order.id} className={`table-round status-${order.status.toLowerCase()}`}>
                  <header>
                    <span>
                      <b>Rodada {index + 1}</b>
                      <small>#{order.shortCode} • {new Date(order.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</small>
                    </span>
                    <em>{STATUS[order.status] || order.status}</em>
                  </header>
                  <div>
                    {order.items.map((item) => (
                      <p key={item.id}>
                        <b>{item.quantity}× {item.name}</b>
                        {item.notes && <small>Obs.: {item.notes}</small>}
                        {item.options?.length > 0 && (
                          <small>{item.options.map((option) => `${option.groupName}: ${option.optionName}`).join(" • ")}</small>
                        )}
                      </p>
                    ))}
                  </div>
                  <footer>
                    <strong>{money(order.total)}</strong>
                    {order.status === "READY_FOR_TABLE" && (
                      <button type="button" className="table-serve-btn" disabled={saving} onClick={() => markServed(order)}>
                        <Check size={15} /> Marcar servido
                      </button>
                    )}
                    {["RECEIVED", "PREPARING", "READY_FOR_TABLE", "SERVED"].includes(order.status) && (
                      <button type="button" className="table-cancel-order-btn" disabled={saving} onClick={() => { setCancelOrder(order); setCancelReason(""); }}>
                        Cancelar
                      </button>
                    )}
                  </footer>
                </article>
              ))}
              {!selected.currentSession.orders.length && (
                <p className="table-no-rounds">Nenhuma rodada lançada nesta comanda.</p>
              )}
            </div>
          </div>

          <aside
            ref={orderPanelRef}
            className="admin-panel table-order-panel"
          >
            <div className="panel-title">
              <div><span>Novo lançamento</span><h2>Adicionar itens</h2></div>
              <ChefHat />
            </div>
            <div className="table-catalog-filters">
              <label><Search size={15} /><input value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} placeholder="Buscar no cardápio" /></label>
              <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                <option value="">Todas as categorias</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </div>
            <div className="table-catalog-list">
              {filteredCatalog.map((product) => (
                <button type="button" key={product.id} onClick={() => setBuilderProduct(product)}>
                  <img src={mediaUrl(product.image)} alt="" />
                  <span><b>{product.name}</b><small>{money(product.price)}</small></span>
                  <Plus size={16} />
                </button>
              ))}
            </div>
            {cart.length > 0 && (
              <div className="table-cart">
                <h3>Próxima rodada</h3>
                {cart.map((item) => (
                  <article key={item.cartKey}>
                    <span><b>{item.name}</b>{item.notes && <small>{item.notes}</small>}</span>
                    <div><button onClick={() => changeQuantity(item.cartKey, -1)}><Minus size={13} /></button><b>{item.quantity}</b><button onClick={() => changeQuantity(item.cartKey, 1)}><Plus size={13} /></button></div>
                    <strong>{money(item.price * item.quantity)}</strong>
                  </article>
                ))}
                <footer><b>Total da rodada</b><strong>{money(cartTotal)}</strong></footer>
                <button type="button" className="table-send-order-btn" disabled={saving} onClick={submitRound}>
                  <ChefHat size={17} /> {saving ? "Enviando..." : "Enviar para a cozinha"}
                </button>
              </div>
            )}
          </aside>

          <form className="admin-panel table-payment-panel" onSubmit={closeSession}>
            <div className="panel-title">
              <div><span>Fechamento</span><h2>Baixar pagamento</h2></div>
              <CreditCard />
            </div>
            <strong className="table-payment-total">{money(selected.currentSession.summary.subtotal)}</strong>
            <label>Forma de pagamento<select value={closeForm.paymentMethod} onChange={(event) => setCloseForm((form) => ({ ...form, paymentMethod: event.target.value }))}>{paymentOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label>
            {closeForm.paymentMethod === "CASH" && (
              <label>Valor recebido<input type="number" min={selected.currentSession.summary.subtotal} step="0.01" required value={closeForm.amountPaid} onChange={(event) => setCloseForm((form) => ({ ...form, amountPaid: event.target.value }))} placeholder={selected.currentSession.summary.subtotal.toFixed(2)} /></label>
            )}
            {hasKitchenPending && <p className="table-payment-warning"><Clock3 size={15} /> Aguarde a cozinha concluir todas as rodadas.</p>}
            <button className="table-close-btn" disabled={saving || !activeOrders.length || hasKitchenPending}>{saving ? "Processando..." : "Confirmar pagamento e liberar mesa"}</button>
            <button type="button" className="table-abandon-btn" disabled={saving} onClick={cancelSession}>Cancelar comanda</button>
          </form>
        </section>
      )}

      <section className="admin-panel table-history-panel">
        <div className="panel-title">
          <div><span>Auditoria</span><h2>Últimas comandas encerradas</h2></div>
          <History />
        </div>
        <div className="table-history-list">
          {history.map((row) => (
            <article key={row.id}>
              <span><b>{row.table?.name || `Mesa ${row.table?.number}`}</b><small>{row.customerName || "Sem identificação"} • {new Date(row.closedAt).toLocaleString("pt-BR")}</small></span>
              <span><small>{row.closedByName || "Equipe"}</small><b>{row.status === "CANCELED" ? "Cancelada" : row.paymentMethodLabel || PAYMENT[row.paymentMethod] || "—"}</b></span>
              <strong>{row.status === "CANCELED" ? "—" : money(row.total)}</strong>
            </article>
          ))}
          {!history.length && <p>Nenhuma comanda encerrada ainda.</p>}
        </div>
      </section>

      {tableForm && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setTableForm(null)}>
          <form className="admin-modal table-form-modal" onSubmit={saveTable}>
            <div className="modal-head"><div><span className="eyebrow dark">Configuração do salão</span><h2>{tableForm.id ? "Editar mesa" : "Nova mesa"}</h2></div><button type="button" className="icon-close" onClick={() => setTableForm(null)}><X /></button></div>
            <div className="form-grid two"><label>Número<input type="number" min="1" max="999" required value={tableForm.number} onChange={(event) => setTableForm((form) => ({ ...form, number: event.target.value }))} /></label><label>Lugares<input type="number" min="1" max="50" required value={tableForm.seats} onChange={(event) => setTableForm((form) => ({ ...form, seats: event.target.value }))} /></label><label>Nome opcional<input value={tableForm.name || ""} maxLength="80" onChange={(event) => setTableForm((form) => ({ ...form, name: event.target.value }))} placeholder="Ex.: Varanda" /></label><label>Localização<input value={tableForm.location || ""} maxLength="100" onChange={(event) => setTableForm((form) => ({ ...form, location: event.target.value }))} placeholder="Ex.: Salão principal" /></label></div>
            <button className="primary-btn" disabled={saving}><Check size={16} /> {saving ? "Salvando..." : "Salvar mesa"}</button>
          </form>
        </div>
      )}

      {openTarget && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setOpenTarget(null)}>
          <form className="admin-modal table-form-modal" onSubmit={openSession}>
            <div className="modal-head"><div><span className="eyebrow dark">Iniciar atendimento</span><h2>Abrir {openTarget.label}</h2></div><button type="button" className="icon-close" onClick={() => setOpenTarget(null)}><X /></button></div>
            <label>Nome ou identificação (opcional)<input value={openForm.customerName} maxLength="80" onChange={(event) => setOpenForm((form) => ({ ...form, customerName: event.target.value }))} placeholder="Ex.: Família Silva" /></label>
            <label>Quantidade de pessoas<input type="number" min="1" max="50" required value={openForm.guestCount} onChange={(event) => setOpenForm((form) => ({ ...form, guestCount: event.target.value }))} /></label>
            <button className="primary-btn" disabled={saving}><Armchair size={16} /> {saving ? "Abrindo..." : "Abrir comanda"}</button>
          </form>
        </div>
      )}

      {cancelOrder && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setCancelOrder(null)}>
          <form className="admin-modal table-form-modal" onSubmit={confirmCancelOrder}>
            <div className="modal-head"><div><span className="eyebrow dark">Registro obrigatório</span><h2>Cancelar rodada #{cancelOrder.shortCode}</h2></div><button type="button" className="icon-close" onClick={() => setCancelOrder(null)}><X /></button></div>
            <label>Motivo<textarea autoFocus required minLength="3" maxLength="280" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Ex.: cliente solicitou a retirada do item" /></label>
            <button className="table-abandon-btn" disabled={saving || cancelReason.trim().length < 3}>Confirmar cancelamento</button>
          </form>
        </div>
      )}

      {builderProduct && (
        <PizzaBuilderModal
          baseProduct={builderProduct}
          onClose={() => setBuilderProduct(null)}
          onAdd={addToCart}
          submitLabel="Adicionar à comanda"
        />
      )}
    </div>
  );
}
