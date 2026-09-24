import React, { useEffect, useRef, useState } from "react";
import {
  ChefHat,
  DollarSign,
  Gauge,
  History,
  Plus,
  RefreshCw,
  Trash2,
  Trophy,
} from "lucide-react";
import { api, authHeaders } from "../../../lib/api";
import { settleWithConcurrency } from "../../../lib/async";
import { money } from "../../../lib/format";
import {
  managementErrorMessage,
  OPERATION_REFRESH_MS,
} from "../../../lib/operations";
import MotoIcon from "../../MotoIcon";

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

export function ManagementHub({
  session,
  notify = () => {},
  fail = () => {},
  onSettingsChanged = () => {},
}) {
  const headers = authHeaders(session.token);
  const [settings, setSettings] = useState(null),
    [logs, setLogs] = useState([]),
    [health, setHealth] = useState(null),
    [intel, setIntel] = useState(null),
    [goals, setGoals] = useState([]),
    [cash, setCash] = useState([]);
  const [goal, setGoal] = useState(() => defaultGoalForm());
  const [openingAmount, setOpeningAmount] = useState("0");
  const [closingAmount, setClosingAmount] = useState("");
  const [cashNotes, setCashNotes] = useState("");
  const [loadErrors, setLoadErrors] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const loadInFlight = useRef(false);
  const areas = {
    settings: ["Configurações", "/admin/advanced/settings", setSettings],
    logs: ["Auditoria", "/admin/logs", setLogs],
    health: ["Saúde do sistema", "/admin/health", setHealth],
    intel: ["Indicadores da operação", "/admin/operations-intelligence", setIntel],
    goals: ["Metas", "/admin/goals", setGoals],
    cash: ["Caixa", "/admin/cash", setCash],
  };
  async function load({ live = false } = {}) {
    if (loadInFlight.current) return;
    loadInFlight.current = true;
    if (!live) setRefreshing(true);
    const keys = live ? ["health", "intel"] : Object.keys(areas);
    try {
      const entries = keys.map((key) => [
        key,
        () => api.get(areas[key][1], headers),
      ]);
      const results = await settleWithConcurrency(entries, 1);
      const errors = {};
      results.forEach((result, index) => {
        const key = keys[index];
        if (result.status === "rejected") errors[key] = managementErrorMessage(result.reason);
        else areas[key][2](result.value.data);
      });
      setLoadErrors((current) => {
        const updated = { ...current };
        keys.forEach((key) => delete updated[key]);
        return { ...updated, ...errors };
      });
    } finally {
      loadInFlight.current = false;
      if (!live) setRefreshing(false);
    }
  }
  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (!document.hidden) load({ live: true });
    }, OPERATION_REFRESH_MS);
    return () => clearInterval(timer);
  }, [session.token]);
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
  const failures = Object.entries(loadErrors);
  const failureNotice = failures.length > 0 && (
    <div className="operations-load-warning" role="alert">
      <div>
        <strong>Algumas áreas não puderam ser atualizadas.</strong>
        <ul>{failures.map(([key, message]) => <li key={key}><b>{areas[key][0]}:</b> {message}</li>)}</ul>
        <small>Os últimos dados carregados continuam na tela.</small>
      </div>
      <button type="button" onClick={() => load()} disabled={refreshing}>
        <RefreshCw size={16} /> {refreshing ? "Atualizando..." : "Tentar novamente"}
      </button>
    </div>
  );
  if (!settings)
    return (
      <section className="admin-panel">
        {failureNotice || <p>Carregando central de gestão...</p>}
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
      {failureNotice}
      <section className="admin-panel advanced-summary">
        <div>
          <span className="eyebrow dark">Gestão 360°</span>
          <h2>Operação e controle em tempo real</h2>
          <p>
            Capacidade da cozinha, entregadores, caixa, metas, auditoria
            e saúde do sistema em uma única central.
          </p>
        </div>
        <div className="health-pills">
          <span className={health?.api ? "ok" : "bad"}>API</span>
          <span className={health?.database ? "ok" : "bad"}>Banco</span>
          <span className={health?.mercadoPago ? "ok" : "warn"}>Pagamento</span>
          <span className={health?.webPush ? "ok" : "warn"}>Notificações</span>
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
