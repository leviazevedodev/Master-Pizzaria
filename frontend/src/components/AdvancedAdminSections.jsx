import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  BellOff,
  Box,
  ChefHat,
  Check,
  Clock3,
  DollarSign,
  Gauge,
  History,
  PackageSearch,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Search,
  ShoppingBag,
  Star,
  Trash2,
  Trophy,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { api, authHeaders, mediaUrl } from "../lib/api";
import { money } from "../lib/format";
import MotoIcon from "./MotoIcon";

function localDateInput(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function defaultGoalForm() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    name: "Meta de faturamento",
    metric: "REVENUE",
    period: "CUSTOM",
    target: 10000,
    startsAt: localDateInput(start),
    endsAt: localDateInput(end),
  };
}

export function InventoryAdmin({
  session,
  products = [],
  notify = () => {},
  fail = () => {},
}) {
  const headers = authHeaders(session.token);
  const [data, setData] = useState({ items: [], products: [] });
  const [form, setForm] = useState({
    name: "",
    unit: "un",
    quantity: 0,
    minQuantity: 0,
  });
  const [selectedProduct, setSelectedProduct] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [recipe, setRecipe] = useState({});
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/inventory", headers);
      setData(data);
      setSelectedProduct((current) => current || data.products?.[0]?.id || "");
    } catch (err) {
      fail(err, "Não foi possível carregar o estoque.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    const product = data.products.find((p) => p.id === selectedProduct);
    setRecipe(
      Object.fromEntries(
        (product?.recipeItems || []).map((r) => [
          r.inventoryItemId,
          String(r.quantity),
        ]),
      ),
    );
  }, [selectedProduct, data.products]);
  async function create(e) {
    e.preventDefault();
    try {
      await api.post(
        "/admin/inventory",
        {
          ...form,
          quantity: Number(form.quantity),
          minQuantity: Number(form.minQuantity),
        },
        headers,
      );
      setForm({ name: "", unit: "un", quantity: 0, minQuantity: 0 });
      notify("Item de estoque criado.");
      await load();
    } catch (err) {
      fail(err, "Não foi possível criar o item.");
    }
  }
  async function update(item, patch) {
    try {
      await api.patch(`/admin/inventory/${item.id}`, patch, headers);
      await load();
    } catch (err) {
      fail(err, "Não foi possível atualizar o estoque.");
    }
  }
  async function remove(item) {
    if (!confirm(`Remover “${item.name}” do estoque?`)) return;
    try {
      await api.delete(`/admin/inventory/${item.id}`, headers);
      await load();
    } catch (err) {
      fail(err, "Não foi possível remover o item.");
    }
  }
  async function saveRecipe() {
    try {
      const items = Object.entries(recipe)
        .map(([inventoryItemId, quantity]) => ({
          inventoryItemId,
          quantity: Number(quantity),
        }))
        .filter((r) => r.quantity > 0);
      await api.put(
        `/admin/products/${selectedProduct}/recipe`,
        { items },
        headers,
      );
      notify("Ficha técnica do produto salva.");
      await load();
    } catch (err) {
      fail(err, "Não foi possível salvar a ficha técnica.");
    }
  }
  const selected = data.products.find((p) => p.id === selectedProduct);
  const low = data.items.filter(
    (i) => Number(i.quantity) <= Number(i.minQuantity),
  );
  const visibleProducts = data.products.filter((p) =>
    `${p.name} ${p.category?.name || ""}`
      .toLowerCase()
      .includes(productSearch.trim().toLowerCase()),
  );
  return (
    <div className="advanced-stock-page">
      <section className="admin-panel advanced-summary">
        <div>
          <span className="eyebrow dark">Estoque real</span>
          <h2>Ingredientes e insumos</h2>
          <p>
            Controle farinha, queijo, caixas, bebidas e qualquer insumo usado na
            produção. O consumo é baixado quando o pedido é aceito.
          </p>
        </div>
        <div className="advanced-summary-badge">
          <AlertTriangle />
          <b>{low.length}</b>
          <small>em nível baixo</small>
        </div>
      </section>
      <div className="advanced-admin-grid">
        <section className="admin-panel">
          <div className="panel-title">
            <div>
              <span>Insumos</span>
              <h2>Estoque real</h2>
            </div>
            <Box />
          </div>
          {loading ? (
            <p>Carregando...</p>
          ) : (
            <div className="inventory-list">
              {data.items.map((item) => (
                <article
                  className={
                    Number(item.quantity) <= Number(item.minQuantity)
                      ? "low-stock"
                      : ""
                  }
                  key={item.id}
                >
                  <div>
                    <b>{item.name}</b>
                    <small>
                      {item.unit} • mínimo {item.minQuantity}
                    </small>
                  </div>
                  <label>
                    Atual
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      defaultValue={item.quantity}
                      onBlur={(e) =>
                        update(item, { quantity: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Alerta
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      defaultValue={item.minQuantity}
                      onBlur={(e) =>
                        update(item, { minQuantity: Number(e.target.value) })
                      }
                    />
                  </label>
                  <button
                    className={
                      item.active ? "area-toggle active" : "area-toggle"
                    }
                    onClick={() => update(item, { active: !item.active })}
                  >
                    {item.active ? "Ativo" : "Pausado"}
                  </button>
                  <button
                    className="subtle-danger"
                    onClick={() => remove(item)}
                  >
                    <Trash2 size={15} />
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
        <form className="admin-panel compact-form" onSubmit={create}>
          <div className="panel-title">
            <div>
              <span>Novo insumo</span>
              <h2>Adicionar ao estoque</h2>
            </div>
            <Plus />
          </div>
          <label>
            Nome
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex.: Mussarela"
            />
          </label>
          <label>
            Unidade
            <select
              className="inventory-unit-select"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
            >
              <option value="un">Unidade (un)</option>
              <option value="g">Gramas (g)</option>
              <option value="kg">Quilos (kg)</option>
              <option value="ml">Mililitros (ml)</option>
              <option value="L">Litros (L)</option>
              <option value="caixa">Caixa</option>
              <option value="pacote">Pacote</option>
            </select>
          </label>
          <div className="two-cols">
            <label>
              Quantidade
              <input
                type="number"
                step="0.001"
                min="0"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              />
            </label>
            <label>
              Alerta mínimo
              <input
                type="number"
                step="0.001"
                min="0"
                value={form.minQuantity}
                onChange={(e) =>
                  setForm({ ...form, minQuantity: e.target.value })
                }
              />
            </label>
          </div>
          <button className="primary-btn">
            <Plus size={16} /> Adicionar insumo
          </button>
        </form>
      </div>
      <section className="admin-panel recipe-panel">
        <div className="panel-title">
          <div>
            <span>Ficha técnica</span>
            <h2>Consumo por produto</h2>
            <p>
              Escolha visualmente o produto e informe quanto de cada insumo ele
              consome. O estoque é baixado automaticamente quando o pedido entra
              em preparo.
            </p>
          </div>
          <PackageSearch />
        </div>
        <div className="recipe-product-toolbar">
          <div className="recipe-product-search">
            <Search size={16} />
            <input
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Buscar produto do cardápio..."
            />
          </div>
          {selected && (
            <div className="recipe-selected-product">
              <span>Selecionado</span>
              <b>{selected.name}</b>
            </div>
          )}
        </div>
        <div className="recipe-product-picker">
          {visibleProducts.map((p) => (
            <button
              key={p.id}
              type="button"
              className={selectedProduct === p.id ? "selected" : ""}
              onClick={() => setSelectedProduct(p.id)}
            >
              {p.image ? (
                <img src={mediaUrl(p.image)} alt="" />
              ) : (
                <span className="recipe-product-placeholder">
                  <ShoppingBag size={18} />
                </span>
              )}
              <span>
                <b>{p.name}</b>
                <small>{p.category?.name || "Produto"}</small>
              </span>
              {selectedProduct === p.id && <i>Selecionado</i>}
            </button>
          ))}
          {!visibleProducts.length && (
            <p className="empty-inline">Nenhum produto encontrado.</p>
          )}
        </div>
        {selected && (
          <>
            <div className="recipe-grid">
              {data.items
                .filter((i) => i.active)
                .map((item) => (
                  <label key={item.id}>
                    <span>
                      {item.name}
                      <small>Consumo por unidade vendida</small>
                    </span>
                    <div className="recipe-quantity-field">
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={recipe[item.id] || ""}
                        onChange={(e) =>
                          setRecipe({ ...recipe, [item.id]: e.target.value })
                        }
                        placeholder="0"
                      />
                      <i>{item.unit}</i>
                    </div>
                  </label>
                ))}
            </div>
            <button
              className="primary-btn recipe-save-btn"
              disabled={!selectedProduct}
              onClick={saveRecipe}
            >
              <Save size={16} /> Salvar ficha técnica de {selected.name}
            </button>
          </>
        )}
      </section>
      <section className="admin-panel">
        <div className="panel-title">
          <div>
            <span>Produtos simples</span>
            <h2>Estoque direto no produto</h2>
            <p>
              Ideal para refrigerantes, sorvetes e itens prontos. Ative
              “Controlar estoque simples” na edição do produto.
            </p>
          </div>
          <ShoppingBag />
        </div>
        <div className="simple-stock-list">
          {data.products
            .filter((p) => p.stockTracked)
            .map((p) => (
              <article
                key={p.id}
                className={
                  p.stockQuantity <= p.stockLowThreshold ? "low-stock" : ""
                }
              >
                <b>{p.name}</b>
                <span>{p.stockQuantity} un.</span>
                <small>alerta em {p.stockLowThreshold}</small>
              </article>
            ))}
          {!data.products.some((p) => p.stockTracked) && (
            <p className="empty-inline">
              Nenhum produto com estoque simples ativado.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

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
    .map(
      (item) =>
        `<li><b>${escapeReceiptHtml(item.quantity)}x ${escapeReceiptHtml(item.name)}</b>${item.notes ? `<br><small>${escapeReceiptHtml(item.notes)}</small>` : ""}</li>`,
    )
    .join("");
  const destination =
    order.fulfillmentType === "DINE_IN"
      ? order.table?.name || `Mesa ${order.table?.number || ""}`
      : order.customerName;
  iframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><title>Pedido ${escapeReceiptHtml(order.shortCode)}</title><style>body{font-family:Arial,sans-serif;width:72mm;margin:0;padding:8mm 3mm;font-size:13px}h1{font-size:20px;margin:0 0 4px}ul{padding-left:18px}li{margin:8px 0}.line{border-top:1px dashed #000;margin:10px 0}</style></head><body><h1>Pedido #${escapeReceiptHtml(order.shortCode)}</h1><b>${escapeReceiptHtml(destination)}</b><div class="line"></div><ul>${items}</ul><div class="line"></div><b>Total: ${escapeReceiptHtml(money(order.total))}</b></body></html>`;
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

export function KitchenAdmin({
  session,
  settings,
  notify = () => {},
  fail = () => {},
}) {
  const headers = authHeaders(session.token);
  const [orders, setOrders] = useState([]);
  const [advancingId, setAdvancingId] = useState(null);
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
    }
  }
  useEffect(() => {
    load(true);
    const t = setInterval(() => load(false), 10000);
    return () => clearInterval(t);
  }, [
    settings?.newOrderSoundEnabled,
    settings?.browserNotificationsEnabled,
    settings?.autoPrintEnabled,
    permission,
    notificationsEnabled,
  ]);
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
  const notificationsActive = notificationsEnabled && permission === "granted";
  return (
    <div className="kitchen-page">
      <section className="admin-panel kitchen-toolbar">
        <div>
          <span className="eyebrow dark">Tela exclusiva</span>
          <h2>Cozinha</h2>
          <p>
            Pedidos recebidos e em preparo atualizam automaticamente a cada 10
            segundos.
          </p>
        </div>
        <div className="kitchen-actions">
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
            {notificationsActive ? <BellOff size={16} /> : <Bell size={16} />}{" "}
            {notificationsActive
              ? "Desativar notificações"
              : "Ativar notificações"}
          </button>
        </div>
      </section>
      <div className="kitchen-board">
        {orders.map((o) => (
          <article
            key={o.id}
            className={`kitchen-ticket status-${o.status.toLowerCase()}`}
          >
            <div className="kitchen-ticket-head">
              <div>
                <small>Pedido</small>
                <b>#{o.shortCode}</b>
              </div>
              <span>
                {o.status === "RECEIVED"
                  ? "NOVO"
                  : o.status === "PREPARING"
                    ? "EM PREPARO"
                    : "PRONTO"}
              </span>
            </div>
            <h3>
              {o.fulfillmentType === "DINE_IN"
                ? o.table?.name || `Mesa ${o.table?.number || ""}`
                : o.customerName}
            </h3>
            {o.fulfillmentType === "DINE_IN" && (
              <small className="kitchen-table-badge">ATENDIMENTO NO SALÃO</small>
            )}
            <div className="kitchen-items">
              {o.items.map((item) => (
                <div key={item.id}>
                  <b>
                    {item.quantity}× {item.name}
                  </b>
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
              <button onClick={() => manualPrint(o)}>
                <Printer size={15} /> Imprimir
              </button>
              {["RECEIVED", "PREPARING"].includes(o.status) && (
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
            </div>
          </article>
        ))}
        {!orders.length && (
          <div className="kitchen-empty">
            <ChefHat />
            <h3>Nenhum pedido na cozinha</h3>
            <p>Os novos pedidos aparecerão aqui automaticamente.</p>
          </div>
        )}
      </div>
      <p className="field-note">
        Impressão automática em navegador abre o diálogo de impressão. Impressão
        totalmente silenciosa exige um agente local de impressão configurado no
        computador da loja.
      </p>
    </div>
  );
}

export function ReportsAdmin({ session, fail = () => {} }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("MONTH");
  const headers = authHeaders(session.token);
  async function load(nextPeriod = period) {
    setLoading(true);
    try {
      const { data } = await api.get(
        `/admin/business-insights?period=${nextPeriod}`,
        headers,
      );
      setData(data);
    } catch (err) {
      fail(err, "Não foi possível carregar os relatórios.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load(period);
  }, [period]);
  const periods = [
    ["DAY", "Hoje"],
    ["WEEK", "Semana"],
    ["MONTH", "Mês"],
    ["YEAR", "Ano"],
    ["ALL", "Histórico"],
  ];
  return (
    <div className="reports-page">
      <section className="admin-panel reports-filter-panel">
        <div className="reports-filter-copy">
          <span className="eyebrow dark">Filtro geral</span>
          <h2>Período do relatório</h2>
          <p>Todos os indicadores abaixo usam o mesmo período selecionado.</p>
        </div>
        <div className="report-period-tabs">
          {periods.map(([key, label]) => (
            <button
              type="button"
              key={key}
              className={period === key ? "active" : ""}
              onClick={() => setPeriod(key)}
            >
              <span>{label}</span>
              <small>
                {key === "DAY"
                  ? "dia atual"
                  : key === "WEEK"
                    ? "semana atual"
                    : key === "MONTH"
                      ? "mês atual"
                      : key === "YEAR"
                        ? "ano atual"
                        : "todos os registros"}
              </small>
            </button>
          ))}
        </div>
      </section>
      {loading ? (
        <section className="admin-panel">
          <p>Carregando relatórios...</p>
        </section>
      ) : !data ? null : (
        <>
          <section className="report-kpis">
            <article>
              <ShoppingBag />
              <span>
                <small>Pedidos concluídos</small>
                <b>{data.summary.orders}</b>
              </span>
            </article>
            <article>
              <DollarSign />
              <span>
                <small>Faturamento</small>
                <b>{money(data.summary.revenue)}</b>
              </span>
            </article>
            <article>
              <Gauge />
              <span>
                <small>Ticket médio</small>
                <b>{money(data.summary.averageTicket)}</b>
              </span>
            </article>
            <article>
              <Clock3 />
              <span>
                <small>Horário de pico</small>
                <b>
                  {data.peakHours?.[0]
                    ? `${String(data.peakHours[0].hour).padStart(2, "0")}:00`
                    : `—`}
                </b>
              </span>
            </article>
          </section>
          <div className="advanced-admin-grid">
            <section className="admin-panel">
              <div className="panel-title">
                <div>
                  <span>Mais vendidos</span>
                  <h2>Campeões de venda</h2>
                </div>
                <Trophy />
              </div>
              <div className="rank-list">
                {data.bestSellers.map((p, i) => (
                  <article key={p.productId}>
                    <b>{i + 1}</b>
                    <span>
                      <strong>{p.name}</strong>
                      <small>
                        {p.quantity} unidades • {money(p.revenue)}
                      </small>
                    </span>
                  </article>
                ))}
              </div>
            </section>
            <section className="admin-panel">
              <div className="panel-title">
                <div>
                  <span>Menos vendidos</span>
                  <h2>Produtos com pouca saída</h2>
                </div>
                <PackageSearch />
              </div>
              <div className="rank-list low">
                {data.leastSellers.map((p, i) => (
                  <article key={p.productId}>
                    <b>{i + 1}</b>
                    <span>
                      <strong>{p.name}</strong>
                      <small>
                        {p.quantity} unidades • {money(p.revenue)}
                      </small>
                    </span>
                  </article>
                ))}
              </div>
            </section>
          </div>
          <section className="admin-panel">
            <div className="panel-title">
              <div>
                <span>Horários de pico</span>
                <h2>Quando a loja recebe mais pedidos</h2>
              </div>
              <Clock3 />
            </div>
            <div className="peak-hour-grid">
              {data.peakHours.map((h) => (
                <article key={h.hour}>
                  <b>{String(h.hour).padStart(2, "0")}:00</b>
                  <span>{h.orders} pedidos</span>
                  <small>{money(h.revenue)}</small>
                </article>
              ))}
            </div>
          </section>
          <section className="admin-panel">
            <div className="panel-title">
              <div>
                <span>Combo inteligente</span>
                <h2>Produtos comprados juntos</h2>
                <p>
                  Use estes pares para criar ofertas, combos e recomendações no
                  carrinho.
                </p>
              </div>
              <Star />
            </div>
            <div className="combo-insights">
              {data.smartCombos.map((c, i) => (
                <article key={i}>
                  <b>{c.names.join(" + ")}</b>
                  <small>Comprados juntos em {c.ordersTogether} pedidos</small>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export function CustomerDetailModal({
  session,
  customerId,
  onClose,
  onChanged,
  fail = () => {},
}) {
  const [data, setData] = useState(null);
  const [note, setNote] = useState("");
  const headers = authHeaders(session.token);
  useEffect(() => {
    api
      .get(`/admin/customers/${customerId}/details`, headers)
      .then(({ data }) => {
        setData(data);
        setNote(data.adminNote || "");
      })
      .catch((e) => fail(e, "Não foi possível abrir o cliente."));
  }, [customerId]);
  async function save(patch) {
    try {
      const { data: row } = await api.patch(
        `/admin/customers/${customerId}/profile`,
        patch,
        headers,
      );
      setData((d) => ({ ...d, ...row, ...patch }));
      onChanged?.();
    } catch (err) {
      fail(err, "Não foi possível atualizar o cliente.");
    }
  }
  if (!data)
    return (
      <div className="modal-backdrop">
        <section className="team-detail-modal">
          <p>Carregando cliente...</p>
        </section>
      </div>
    );
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section className="team-detail-modal customer-detail-modal">
        <div className="modal-head">
          <div>
            <span className="eyebrow dark">Histórico completo</span>
            <h2>{data.name}</h2>
            <p>
              {data.email} • {data.phone || "Sem telefone"}
            </p>
          </div>
          <button className="icon-close" onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="customer-detail-tags">
          {data.metrics.vip && (
            <span className="vip">
              <Star size={14} /> Cliente VIP
            </span>
          )}
          {data.metrics.inactive && (
            <span className="inactive">
              <Clock3 size={14} /> Inativo há {data.metrics.inactiveDays} dias
            </span>
          )}
          {data.customerBlocked && (
            <span className="blocked">
              <AlertTriangle size={14} /> Bloqueado
            </span>
          )}
        </div>
        <div className="team-detail-summary">
          <article>
            <small>Pedidos</small>
            <b>{data.metrics.orders}</b>
          </article>
          <article>
            <small>Concluídos</small>
            <b>{data.metrics.delivered}</b>
          </article>
          <article>
            <small>Total gasto</small>
            <b>{money(data.metrics.spent)}</b>
          </article>
          <article>
            <small>Ticket médio</small>
            <b>{money(data.metrics.averageTicket)}</b>
          </article>
        </div>
        <label className="customer-admin-note">
          Observação administrativa
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Informação visível apenas para a equipe"
          />
          <button
            className="primary-btn"
            onClick={() => save({ adminNote: note })}
          >
            <Save size={15} /> Salvar observação
          </button>
        </label>
        <div className="customer-control-row">
          <button
            className={
              data.customerBlocked ? "primary-btn" : "subtle-danger strong"
            }
            onClick={() => save({ customerBlocked: !data.customerBlocked })}
          >
            {data.customerBlocked
              ? "Desbloquear cliente"
              : "Bloquear novos pedidos"}
          </button>
        </div>
        <section>
          <h3>Endereços favoritos</h3>
          <div className="customer-address-list">
            {data.favoriteAddresses?.map((a) => (
              <article key={a.id}>
                <b>{a.label}</b>
                <span>
                  {a.street}, {a.addressNumber} • {a.neighborhood}, {a.city}/
                  {a.state}
                </span>
              </article>
            ))}
            {!data.favoriteAddresses?.length && (
              <small>Nenhum endereço favorito.</small>
            )}
          </div>
        </section>
        <section>
          <h3>Pedidos</h3>
          <div className="customer-order-history">
            {data.orders.map((o) => (
              <article key={o.id}>
                <b>#{o.shortCode}</b>
                <span>{new Date(o.createdAt).toLocaleString("pt-BR")}</span>
                <span>{o.status}</span>
                <strong>{money(o.total)}</strong>
              </article>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}

export function DeliveryTimeRules({
  session,
  fail = () => {},
  notify = () => {},
}) {
  const headers = authHeaders(session.token);
  const [rules, setRules] = useState([]);
  const [form, setForm] = useState({
    name: "Taxa noturna",
    dayOfWeek: "",
    startTime: "22:00",
    endTime: "23:59",
    amount: 2,
  });
  async function load() {
    try {
      const { data } = await api.get("/admin/delivery-surcharges", headers);
      setRules(data);
    } catch (err) {
      fail(err, "Não foi possível carregar as taxas por horário.");
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function create(e) {
    e.preventDefault();
    try {
      await api.post(
        "/admin/delivery-surcharges",
        {
          ...form,
          dayOfWeek: form.dayOfWeek === "" ? null : Number(form.dayOfWeek),
          amount: Number(form.amount),
        },
        headers,
      );
      setForm({ ...form, name: "", amount: 0 });
      notify("Regra de horário criada.");
      await load();
    } catch (err) {
      fail(err, "Não foi possível criar a regra.");
    }
  }
  async function update(row, patch) {
    try {
      await api.patch(`/admin/delivery-surcharges/${row.id}`, patch, headers);
      await load();
    } catch (err) {
      fail(err, "Não foi possível atualizar a regra.");
    }
  }
  async function remove(row) {
    if (!confirm(`Excluir “${row.name}”?`)) return;
    try {
      await api.delete(`/admin/delivery-surcharges/${row.id}`, headers);
      await load();
    } catch (err) {
      fail(err, "Não foi possível excluir a regra.");
    }
  }
  const days = [
    "Domingo",
    "Segunda",
    "Terça",
    "Quarta",
    "Quinta",
    "Sexta",
    "Sábado",
  ];
  return (
    <section className="admin-panel delivery-time-rules">
      <div className="panel-title">
        <div>
          <span>Preço por horário</span>
          <h2>Taxa diferente por horário</h2>
          <p>
            Adicione um valor extra ao frete em horários específicos, como
            madrugada ou horário de pico.
          </p>
        </div>
        <Clock3 />
      </div>
      <div className="time-rule-list">
        {rules.map((r) => (
          <article key={r.id}>
            <div className="time-rule-identity">
              <span className="time-rule-icon">
                <Clock3 size={16} />
              </span>
              <div>
                <b>{r.name}</b>
                <small>
                  {r.dayOfWeek == null ? "Todos os dias" : days[r.dayOfWeek]} •{" "}
                  {r.startTime}–{r.endTime}
                </small>
              </div>
            </div>
            <label>
              <span>Adicional</span>
              <div className="money-field">
                <small>R$</small>
                <input
                  type="number"
                  step="0.01"
                  defaultValue={Number(r.amount)}
                  onBlur={(e) => update(r, { amount: Number(e.target.value) })}
                />
              </div>
            </label>
            <button
              className={r.active ? "area-toggle active" : "area-toggle"}
              onClick={() => update(r, { active: !r.active })}
            >
              {r.active ? "Ativa" : "Pausada"}
            </button>
            <button
              className="subtle-danger time-rule-delete"
              onClick={() => remove(r)}
              title="Excluir regra"
            >
              <Trash2 size={15} />
            </button>
          </article>
        ))}
      </div>
      <form className="delivery-time-create" onSubmit={create}>
        <div className="delivery-time-create-head">
          <div>
            <span>Nova regra</span>
            <b>Adicionar faixa de horário</b>
          </div>
          <Plus size={17} />
        </div>
        <div className="delivery-time-fields">
          <label>
            <span>Nome da regra</span>
            <input
              required
              placeholder="Ex.: Taxa noturna"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            <span>Aplicar em</span>
            <select
              value={form.dayOfWeek}
              onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })}
            >
              <option value="">Todos os dias</option>
              {days.map((d, i) => (
                <option value={i} key={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Início</span>
            <input
              type="time"
              value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
            />
          </label>
          <label>
            <span>Término</span>
            <input
              type="time"
              value={form.endTime}
              onChange={(e) => setForm({ ...form, endTime: e.target.value })}
            />
          </label>
          <label>
            <span>Valor extra</span>
            <div className="money-field">
              <small>R$</small>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0,00"
              />
            </div>
          </label>
        </div>
        <button className="primary-btn delivery-time-submit">
          <Plus size={15} /> Adicionar regra
        </button>
      </form>
    </section>
  );
}

export function ManagementHub({
  session,
  notify = () => {},
  fail = () => {},
  onSettingsChanged = () => {},
}) {
  const headers = authHeaders(session.token);
  const [settings, setSettings] = useState(null),
    [coupons, setCoupons] = useState([]),
    [logs, setLogs] = useState([]),
    [health, setHealth] = useState(null),
    [intel, setIntel] = useState(null),
    [goals, setGoals] = useState([]),
    [cash, setCash] = useState([]);
  const [coupon, setCoupon] = useState({
    code: "",
    description: "",
    type: "PERCENT",
    value: 10,
    minimumOrder: 0,
    maxUses: "",
    perCustomerLimit: 1,
    allowGuest: false,
    startAt: "",
    endAt: "",
    maxDiscount: "",
  });
  const [goal, setGoal] = useState(() => defaultGoalForm());
  const [openingAmount, setOpeningAmount] = useState("0");
  const [closingAmount, setClosingAmount] = useState("");
  const [cashNotes, setCashNotes] = useState("");
  async function load() {
    const requests = [
      ["settings", api.get("/admin/advanced/settings", headers)],
      ["coupons", api.get("/admin/coupons", headers)],
      ["logs", api.get("/admin/logs", headers)],
      ["health", api.get("/admin/health", headers)],
      ["intel", api.get("/admin/operations-intelligence", headers)],
      ["goals", api.get("/admin/goals", headers)],
      ["cash", api.get("/admin/cash", headers)],
    ];
    const results = await Promise.allSettled(
      requests.map(([, promise]) => promise),
    );
    const failed = [];
    results.forEach((result, index) => {
      const key = requests[index][0];
      if (result.status === "rejected") {
        failed.push(result.reason);
        return;
      }
      const data = result.value.data;
      if (key === "settings") setSettings(data);
      else if (key === "coupons") setCoupons(data);
      else if (key === "logs") setLogs(data);
      else if (key === "health") setHealth(data);
      else if (key === "intel") setIntel(data);
      else if (key === "goals") setGoals(data);
      else if (key === "cash") setCash(data);
    });
    if (results[0]?.status === "rejected")
      setSettings(
        (current) =>
          current || {
            kitchenCapacityPerSlot: 12,
            kitchenSlotMinutes: 30,
            courierMaxActiveOrders: 3,
            customerDailyOrderLimit: 5,
            pwaEnabled: true,
            smartCourierQueueEnabled: true,
          },
      );
    if (failed.length) {
      const first = failed[0];
      fail(
        first,
        first?.response?.data?.message ||
          "Parte da Gestão 360° não respondeu. Atualize o schema do banco.",
      );
    }
  }
  useEffect(() => {
    load();
    const t = setInterval(() => {
      api
        .get("/admin/health", headers)
        .then((r) => setHealth(r.data))
        .catch(() => {});
      api
        .get("/admin/operations-intelligence", headers)
        .then((r) => setIntel(r.data))
        .catch(() => {});
    }, 20000);
    return () => clearInterval(t);
  }, []);
  async function saveSettings(patch) {
    try {
      const { data } = await api.patch(
        "/admin/advanced/settings",
        patch,
        headers,
      );
      setSettings((s) => ({ ...s, ...data }));
      if (Object.hasOwn(patch, "pwaEnabled")) await onSettingsChanged();
      notify("Configuração atualizada.");
    } catch (e) {
      fail(e, "Não foi possível salvar.");
    }
  }
  async function addCoupon(e) {
    e.preventDefault();
    try {
      await api.post(
        "/admin/coupons",
        {
          ...coupon,
          value: Number(coupon.value),
          minimumOrder: Number(coupon.minimumOrder),
          maxUses: coupon.maxUses === "" ? null : Number(coupon.maxUses),
          perCustomerLimit: Number(coupon.perCustomerLimit),
          maxDiscount:
            coupon.maxDiscount === "" ? null : Number(coupon.maxDiscount),
          startAt: coupon.startAt
            ? new Date(coupon.startAt).toISOString()
            : null,
          endAt: coupon.endAt ? new Date(coupon.endAt).toISOString() : null,
        },
        headers,
      );
      setCoupon({
        code: "",
        description: "",
        type: "PERCENT",
        value: 10,
        minimumOrder: 0,
        maxUses: "",
        perCustomerLimit: 1,
        allowGuest: false,
        startAt: "",
        endAt: "",
        maxDiscount: "",
      });
      notify("Cupom criado.");
      await load();
    } catch (x) {
      fail(x, "Não foi possível criar o cupom.");
    }
  }
  async function addGoal(e) {
    e.preventDefault();
    try {
      await api.post(
        "/admin/goals",
        { ...goal, target: Number(goal.target) },
        headers,
      );
      setGoal(defaultGoalForm());
      notify("Meta criada.");
      await load();
    } catch (x) {
      fail(x, "Não foi possível criar a meta.");
    }
  }
  async function openRegister(e) {
    e.preventDefault();
    try {
      await api.post(
        "/admin/cash/open",
        { openingAmount: Number(openingAmount || 0) },
        headers,
      );
      setOpeningAmount("0");
      notify("Caixa aberto.");
      await load();
    } catch (x) {
      fail(x, "Não foi possível abrir o caixa.");
    }
  }
  async function closeRegister(e) {
    e.preventDefault();
    if (!openCash) return;
    try {
      await api.post(
        `/admin/cash/${openCash.id}/close`,
        { closingAmount: Number(closingAmount), notes: cashNotes },
        headers,
      );
      setClosingAmount("");
      setCashNotes("");
      notify("Caixa fechado.");
      await load();
    } catch (x) {
      fail(x, "Não foi possível fechar o caixa.");
    }
  }
  if (!settings)
    return (
      <section className="admin-panel">
        <p>Carregando central de gestão...</p>
      </section>
    );
  const openCash = cash.find(
    (x) => !x.closedAt && x.userId === session.user.id,
  );
  const currentClosingNumber =
    closingAmount === "" ? null : Number(closingAmount);
  const liveDifference =
    openCash && Number.isFinite(currentClosingNumber)
      ? currentClosingNumber - Number(openCash.expectedClosing || 0)
      : null;
  const formatDate = (value, withTime = false) =>
    value
      ? new Date(value).toLocaleString(
          "pt-BR",
          withTime
            ? { dateStyle: "short", timeStyle: "short" }
            : { dateStyle: "short" },
        )
      : "Sem limite";
  const metricLabel = (metric) =>
    metric === "ORDERS"
      ? "Pedidos"
      : metric === "AVERAGE_TICKET"
        ? "Ticket médio"
        : "Faturamento";
  const metricValue = (metric, value) =>
    metric === "ORDERS"
      ? String(Math.round(Number(value || 0)))
      : money(value || 0);
  return (
    <div className="management-hub">
      <section className="admin-panel advanced-summary">
        <div>
          <span className="eyebrow dark">Gestão 360°</span>
          <h2>Operação e controle em tempo real</h2>
          <p>
            Capacidade da cozinha, entregadores, cupons, caixa, metas, auditoria
            e saúde do sistema em uma única central.
          </p>
        </div>
        <div className="health-pills">
          <span className={health?.api ? "ok" : "bad"}>API</span>
          <span className={health?.database ? "ok" : "bad"}>Banco</span>
          <span className={health?.mercadoPago ? "ok" : "warn"}>Pagamento</span>
          <span className={health?.whatsapp ? "ok" : "warn"}>WhatsApp</span>
        </div>
      </section>

      {intel && (
        <section className="report-kpis">
          <article>
            <ChefHat />
            <span>
              <small>Preparo médio</small>
              <b>{intel.averagePrepMinutes} min</b>
            </span>
          </article>
          <article>
            <MotoIcon />
            <span>
              <small>Entrega média</small>
              <b>{intel.averageDeliveryMinutes} min</b>
            </span>
          </article>
          <article>
            <DollarSign />
            <span>
              <small>Faturamento • 30 dias</small>
              <b>{money(intel.revenue)}</b>
            </span>
          </article>
          <article>
            <Gauge />
            <span>
              <small>Pedidos • 30 dias</small>
              <b>{intel.orders || 0}</b>
            </span>
          </article>
        </section>
      )}

      <section className="admin-panel operations-control-panel">
        <div className="panel-title">
          <div>
            <span>Operação</span>
            <h2>Capacidade e entregadores</h2>
            <p>
              Esses limites são aplicados de verdade no agendamento, na fila e
              na distribuição de entregas.
            </p>
          </div>
          <Gauge />
        </div>
        {intel?.live && (
          <div className="live-operation-grid">
            <article>
              <small>Recebidos</small>
              <b>{intel.live.received}</b>
            </article>
            <article>
              <small>Em preparo</small>
              <b>{intel.live.preparing}</b>
            </article>
            <article>
              <small>Prontos para entrega</small>
              <b>{intel.live.readyForDelivery}</b>
            </article>
            <article>
              <small>Na rua</small>
              <b>{intel.live.outForDelivery}</b>
            </article>
          </div>
        )}
        <div className="operations-settings-grid">
          <label>
            <span>Capacidade da cozinha</span>
            <small>Máximo de pedidos agendados por faixa.</small>
            <input
              type="number"
              min="1"
              value={settings.kitchenCapacityPerSlot}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  kitchenCapacityPerSlot: e.target.value,
                })
              }
              onBlur={() =>
                saveSettings({
                  kitchenCapacityPerSlot: Number(
                    settings.kitchenCapacityPerSlot,
                  ),
                })
              }
            />
          </label>
          <label>
            <span>Duração da faixa</span>
            <small>Janela usada para controlar a capacidade.</small>
            <div className="input-with-suffix">
              <input
                type="number"
                min="1"
                value={settings.kitchenSlotMinutes}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    kitchenSlotMinutes: e.target.value,
                  })
                }
                onBlur={() =>
                  saveSettings({
                    kitchenSlotMinutes: Number(settings.kitchenSlotMinutes),
                  })
                }
              />
              <i>min</i>
            </div>
          </label>
          <label>
            <span>Limite por entregador</span>
            <small>Impede novas corridas quando o entregador está cheio.</small>
            <input
              type="number"
              min="1"
              value={settings.courierMaxActiveOrders}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  courierMaxActiveOrders: e.target.value,
                })
              }
              onBlur={() =>
                saveSettings({
                  courierMaxActiveOrders: Number(
                    settings.courierMaxActiveOrders,
                  ),
                })
              }
            />
          </label>
          <label>
            <span>Pedidos por cliente/dia</span>
            <small>
              Bloqueia pedidos acima desse limite por conta/telefone.
            </small>
            <input
              type="number"
              min="1"
              max="100"
              value={settings.customerDailyOrderLimit}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  customerDailyOrderLimit: e.target.value,
                })
              }
              onBlur={() =>
                saveSettings({
                  customerDailyOrderLimit: Number(
                    settings.customerDailyOrderLimit,
                  ),
                })
              }
            />
          </label>
        </div>
        <label className="management-feature-toggle">
          <input
            type="checkbox"
            checked={Boolean(settings.smartCourierQueueEnabled)}
            onChange={(e) =>
              saveSettings({ smartCourierQueueEnabled: e.target.checked })
            }
          />
          <span>
            <b>Fila inteligente de entregadores</b>
            <small>
              Considera a quantidade de entregas ativas antes de distribuir
              novas corridas.
            </small>
          </span>
        </label>
        <label className="management-feature-toggle">
          <input
            type="checkbox"
            checked={settings.pwaEnabled !== false}
            onChange={(e) => saveSettings({ pwaEnabled: e.target.checked })}
          />
          <span>
            <b>Aplicativo instalável e modo offline</b>
            <small>
              Registra o PWA no navegador e mantém os arquivos essenciais em
              cache. Ao desligar, o cache do aplicativo é removido.
            </small>
          </span>
        </label>
        <div className="courier-capacity-list">
          <div className="management-subtitle">
            <b>Entregadores ativos</b>
            <small>Carga atual / limite configurado</small>
          </div>
          {intel?.live?.couriers?.length ? (
            intel.live.couriers.map((courier) => {
              const pct = Math.min(
                100,
                Math.round(
                  (Number(courier.active || 0) /
                    Math.max(1, Number(courier.max || 1))) *
                    100,
                ),
              );
              return (
                <article key={courier.id}>
                  <span className="courier-avatar">
                    <MotoIcon />
                  </span>
                  <div>
                    <b>{courier.name}</b>
                    <small>
                      {courier.active} de {courier.max} entregas ativas
                    </small>
                    <div className="capacity-progress">
                      <i style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <strong
                    className={courier.active >= courier.max ? "full" : ""}
                  >
                    {courier.active >= courier.max ? "Lotado" : "Disponível"}
                  </strong>
                </article>
              );
            })
          ) : (
            <p className="empty-inline">Nenhum entregador ativo cadastrado.</p>
          )}
        </div>
      </section>

      <section className="admin-panel coupon-management-panel">
        <div className="panel-title">
          <div>
            <span>Vendas</span>
            <h2>Cupons de desconto</h2>
            <p>
              Defina claramente desconto, gasto mínimo, limites, clientes
              permitidos e vigência.
            </p>
          </div>
          <Trophy />
        </div>
        <form className="coupon-create-form" onSubmit={addCoupon}>
          <label>
            <span>Código do cupom</span>
            <input
              required
              placeholder="EX.: PIZZA10"
              value={coupon.code}
              onChange={(e) =>
                setCoupon({ ...coupon, code: e.target.value.toUpperCase() })
              }
            />
          </label>
          <label className="coupon-description-field">
            <span>Descrição</span>
            <input
              placeholder="Ex.: 10% para pedidos acima de R$ 50"
              value={coupon.description}
              onChange={(e) =>
                setCoupon({ ...coupon, description: e.target.value })
              }
            />
          </label>
          <label>
            <span>Tipo de desconto</span>
            <select
              value={coupon.type}
              onChange={(e) => setCoupon({ ...coupon, type: e.target.value })}
            >
              <option value="PERCENT">Percentual (%)</option>
              <option value="FIXED">Valor fixo (R$)</option>
            </select>
          </label>
          <label>
            <span>
              {coupon.type === "PERCENT" ? "Desconto (%)" : "Desconto (R$)"}
            </span>
            <input
              type="number"
              min="0.01"
              max={coupon.type === "PERCENT" ? 100 : undefined}
              step="0.01"
              value={coupon.value}
              onChange={(e) => setCoupon({ ...coupon, value: e.target.value })}
            />
          </label>
          <label>
            <span>Gasto mínimo (R$)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={coupon.minimumOrder}
              onChange={(e) =>
                setCoupon({ ...coupon, minimumOrder: e.target.value })
              }
            />
          </label>
          {coupon.type === "PERCENT" && (
            <label>
              <span>Desconto máximo (R$)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Sem limite"
                value={coupon.maxDiscount}
                onChange={(e) =>
                  setCoupon({ ...coupon, maxDiscount: e.target.value })
                }
              />
            </label>
          )}
          <label>
            <span>Limite total de usos</span>
            <input
              type="number"
              min="1"
              placeholder="Sem limite"
              value={coupon.maxUses}
              onChange={(e) =>
                setCoupon({ ...coupon, maxUses: e.target.value })
              }
            />
          </label>
          <label>
            <span>Usos por cliente</span>
            <input
              type="number"
              min="1"
              value={coupon.perCustomerLimit}
              onChange={(e) =>
                setCoupon({ ...coupon, perCustomerLimit: e.target.value })
              }
            />
          </label>
          <label>
            <span>Início da vigência</span>
            <input
              type="datetime-local"
              value={coupon.startAt}
              onChange={(e) =>
                setCoupon({ ...coupon, startAt: e.target.value })
              }
            />
          </label>
          <label>
            <span>Fim da vigência</span>
            <input
              type="datetime-local"
              value={coupon.endAt}
              onChange={(e) => setCoupon({ ...coupon, endAt: e.target.value })}
            />
          </label>
          <label className="coupon-guest-permission">
            <input
              type="checkbox"
              checked={coupon.allowGuest}
              onChange={(e) =>
                setCoupon({ ...coupon, allowGuest: e.target.checked })
              }
            />
            <span>
              <b>Permitir clientes sem conta</b>
              <small>Se desligado, o cupom exige login.</small>
            </span>
          </label>
          <button className="primary-btn coupon-create-submit">
            <Plus size={15} /> Criar cupom
          </button>
        </form>
        <div className="coupon-admin-list improved-coupon-list">
          {coupons.map((c) => {
            const discount =
              c.type === "PERCENT" ? `${Number(c.value)}%` : money(c.value);
            return (
              <article key={c.id}>
                <div className="coupon-code-block">
                  <b>{c.code}</b>
                  <small>{c.description || "Sem descrição"}</small>
                </div>
                <div className="coupon-facts">
                  <span>
                    <small>Desconto</small>
                    <b>{discount}</b>
                  </span>
                  <span>
                    <small>Pedido mínimo</small>
                    <b>{money(c.minimumOrder || 0)}</b>
                  </span>
                  <span>
                    <small>Uso por cliente</small>
                    <b>{c.perCustomerLimit || 1}x</b>
                  </span>
                  <span>
                    <small>Uso total</small>
                    <b>
                      {c.uses || 0}
                      {c.maxUses != null ? ` / ${c.maxUses}` : " / ∞"}
                    </b>
                  </span>
                  <span>
                    <small>Sem conta</small>
                    <b>{c.allowGuest ? "Permitido" : "Bloqueado"}</b>
                  </span>
                  <span>
                    <small>Vigência</small>
                    <b>
                      {formatDate(c.startAt)} → {formatDate(c.endAt)}
                    </b>
                  </span>
                </div>
                <div className="coupon-row-actions">
                  <button
                    className={c.active ? "area-toggle active" : "area-toggle"}
                    onClick={async () => {
                      await api.patch(
                        `/admin/coupons/${c.id}`,
                        { active: !c.active },
                        headers,
                      );
                      load();
                    }}
                  >
                    {c.active ? "Ativo" : "Pausado"}
                  </button>
                  <button
                    className="subtle-danger"
                    onClick={async () => {
                      if (confirm("Excluir cupom?")) {
                        await api.delete(`/admin/coupons/${c.id}`, headers);
                        load();
                      }
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </article>
            );
          })}
          {!coupons.length && (
            <p className="empty-inline">Nenhum cupom cadastrado.</p>
          )}
        </div>
      </section>

      <div className="advanced-admin-grid management-finance-grid">
        <section className="admin-panel cash-management-panel">
          <div className="panel-title">
            <div>
              <span>Financeiro</span>
              <h2>Fechamento de caixa</h2>
              <p>
                O sistema soma automaticamente as vendas em dinheiro realizadas
                durante o turno.
              </p>
            </div>
            <DollarSign />
          </div>
          {openCash ? (
            <>
              <div className="cash-live-summary">
                <article>
                  <small>Abertura</small>
                  <b>{money(openCash.openingAmount)}</b>
                </article>
                <article>
                  <small>Vendas em dinheiro</small>
                  <b>{money(openCash.cashSales)}</b>
                  <em>{openCash.cashOrders || 0} pedidos</em>
                </article>
                <article className="cash-expected">
                  <small>Esperado no caixa</small>
                  <b>{money(openCash.expectedClosing)}</b>
                </article>
              </div>
              <form className="cash-close-form" onSubmit={closeRegister}>
                <label>
                  <span>Valor contado no caixa</span>
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={closingAmount}
                    onChange={(e) => setClosingAmount(e.target.value)}
                    placeholder={String(openCash.expectedClosing || 0)}
                  />
                </label>
                <label>
                  <span>Observação do fechamento</span>
                  <textarea
                    value={cashNotes}
                    onChange={(e) => setCashNotes(e.target.value)}
                    placeholder="Ex.: diferença justificada por troco..."
                  />
                </label>
                {liveDifference != null && (
                  <div
                    className={`cash-difference-preview ${Math.abs(liveDifference) < 0.01 ? "ok" : liveDifference < 0 ? "negative" : "positive"}`}
                  >
                    <span>Diferença apurada</span>
                    <b>
                      {liveDifference >= 0 ? "+" : ""}
                      {money(liveDifference)}
                    </b>
                    <small>
                      {Math.abs(liveDifference) < 0.01
                        ? "Caixa confere com o esperado."
                        : liveDifference < 0
                          ? "Valor contado abaixo do esperado."
                          : "Valor contado acima do esperado."}
                    </small>
                  </div>
                )}
                <button className="primary-btn">Fechar caixa</button>
              </form>
            </>
          ) : (
            <form className="cash-open-form" onSubmit={openRegister}>
              <label>
                <span>Valor inicial / troco</span>
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={openingAmount}
                  onChange={(e) => setOpeningAmount(e.target.value)}
                />
              </label>
              <button className="primary-btn">
                <DollarSign size={16} /> Abrir meu caixa
              </button>
            </form>
          )}
          <div className="cash-history">
            <div className="management-subtitle">
              <b>Últimos fechamentos</b>
              <small>Esperado x contado</small>
            </div>
            {cash.slice(0, 8).map((x) => (
              <article key={x.id}>
                <div>
                  <b>{x.userName}</b>
                  <small>
                    {formatDate(x.openedAt, true)}{" "}
                    {x.closedAt
                      ? `→ ${formatDate(x.closedAt, true)}`
                      : "• aberto"}
                  </small>
                </div>
                <span>
                  <small>Esperado</small>
                  <b>{money(x.expectedClosing || x.openingAmount)}</b>
                </span>
                <span>
                  <small>Contado</small>
                  <b>
                    {x.closingAmount == null ? "—" : money(x.closingAmount)}
                  </b>
                </span>
                <strong
                  className={
                    x.difference == null
                      ? ""
                      : Math.abs(Number(x.difference)) < 0.01
                        ? "ok"
                        : Number(x.difference) < 0
                          ? "negative"
                          : "positive"
                  }
                >
                  {x.difference == null
                    ? "Aberto"
                    : `${Number(x.difference) >= 0 ? "+" : ""}${money(x.difference)}`}
                </strong>
              </article>
            ))}
          </div>
        </section>

        <section className="admin-panel goals-management-panel">
          <div className="panel-title">
            <div>
              <span>Metas</span>
              <h2>Metas de operação</h2>
              <p>
                Crie uma meta, escolha o período e acompanhe o progresso
                automaticamente com os pedidos concluídos.
              </p>
            </div>
            <Trophy />
          </div>
          <form className="goal-form improved-goal-form" onSubmit={addGoal}>
            <div className="goal-form-grid">
              <label>
                <span>Métrica</span>
                <select
                  value={goal.metric}
                  onChange={(e) =>
                    setGoal({
                      ...goal,
                      metric: e.target.value,
                      name:
                        e.target.value === "ORDERS"
                          ? "Meta de pedidos"
                          : e.target.value === "AVERAGE_TICKET"
                            ? "Meta de ticket médio"
                            : "Meta de faturamento",
                    })
                  }
                >
                  <option value="REVENUE">Faturamento</option>
                  <option value="ORDERS">Quantidade de pedidos</option>
                  <option value="AVERAGE_TICKET">Ticket médio</option>
                </select>
              </label>
              <label className="goal-name-field">
                <span>Nome da meta</span>
                <input
                  required
                  value={goal.name}
                  onChange={(e) => setGoal({ ...goal, name: e.target.value })}
                  placeholder="Ex.: Faturar R$ 10 mil no mês"
                />
              </label>
              <label>
                <span>
                  {goal.metric === "ORDERS"
                    ? "Meta de pedidos"
                    : "Valor da meta (R$)"}
                </span>
                <input
                  required
                  type="number"
                  min="0.01"
                  step={goal.metric === "ORDERS" ? 1 : "0.01"}
                  value={goal.target}
                  onChange={(e) => setGoal({ ...goal, target: e.target.value })}
                />
              </label>
              <label>
                <span>Data inicial</span>
                <input
                  required
                  type="date"
                  value={goal.startsAt}
                  onChange={(e) =>
                    setGoal({ ...goal, startsAt: e.target.value })
                  }
                />
              </label>
              <label>
                <span>Data final</span>
                <input
                  required
                  type="date"
                  min={goal.startsAt || undefined}
                  value={goal.endsAt}
                  onChange={(e) => setGoal({ ...goal, endsAt: e.target.value })}
                />
              </label>
            </div>
            <div className="goal-form-footer">
              <small>
                O progresso considera apenas pedidos concluídos dentro das datas
                informadas.
              </small>
              <button className="primary-btn">
                <Plus size={15} /> Criar meta
              </button>
            </div>
          </form>
          <div className="goal-list-improved">
            {goals.map((g) => (
              <article
                key={g.id}
                className={`${g.completed ? "completed" : ""} ${g.expired && !g.completed ? "expired" : ""}`}
              >
                <div className="goal-row-head">
                  <div>
                    <b>{g.name}</b>
                    <small>
                      {metricLabel(g.metric)} • {formatDate(g.startsAt)} →{" "}
                      {formatDate(g.endsAt)}
                    </small>
                  </div>
                  <button
                    className="subtle-danger"
                    onClick={async () => {
                      if (confirm("Excluir esta meta?")) {
                        await api.delete(`/admin/goals/${g.id}`, headers);
                        load();
                      }
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="goal-numbers">
                  <strong>
                    {metricValue(g.metric, g.actual)}{" "}
                    <small>de {metricValue(g.metric, g.target)}</small>
                  </strong>
                  <span>{Number(g.progressPercent || 0).toFixed(1)}%</span>
                </div>
                <div className="goal-progress">
                  <i
                    style={{
                      width: `${Math.min(100, Number(g.progressPercent || 0))}%`,
                    }}
                  />
                </div>
                <div className="goal-foot">
                  <small>
                    {g.completed
                      ? "Meta atingida"
                      : g.expired
                        ? "Período encerrado"
                        : `${g.remainingDays} dia(s) restantes`}
                  </small>
                  <small>
                    {g.orders || 0} pedidos • {money(g.revenue || 0)} faturados
                  </small>
                </div>
              </article>
            ))}
            {!goals.length && (
              <div className="goal-empty-state">
                <Trophy />
                <div>
                  <b>Nenhuma meta cadastrada</b>
                  <small>
                    Use o formulário acima para criar a primeira meta.
                  </small>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="admin-panel">
        <div className="panel-title">
          <div>
            <span>Auditoria</span>
            <h2>Logs administrativos</h2>
            <p>
              Registro das principais alterações sensíveis realizadas pela
              equipe.
            </p>
          </div>
          <History />
        </div>
        <div className="admin-log-list">
          {logs.slice(0, 80).map((l) => (
            <article key={l.id}>
              <b>{l.action}</b>
              <span>
                {l.userName || "Sistema"} • {l.role || "—"}
              </span>
              <small>{new Date(l.createdAt).toLocaleString("pt-BR")}</small>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
