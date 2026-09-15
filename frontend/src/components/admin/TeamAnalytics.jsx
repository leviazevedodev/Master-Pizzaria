import React, { useState } from "react";
import { Activity, ChevronRight, DollarSign, ReceiptText, ShoppingBag, UserRound, Users, X } from "lucide-react";
import MotoIcon from "../MotoIcon";
import { money } from "../../lib/format";
import { paymentFilterKey, paymentFilterLabel, paymentLabel } from "../../lib/adminOrders";
export default function TeamAnalytics({ data }) {
  const [period, setPeriod] = useState("day");
  const [teamScope, setTeamScope] = useState("ALL");
  const [selectedMember, setSelectedMember] = useState(null);
  const [paymentFilter, setPaymentFilter] = useState("ALL");
  if (!data)
    return (
      <section className="admin-panel analytics-loading">
        <Activity className="spin" />
        <div>
          <h2>Carregando desempenho...</h2>
          <p>Consolidando pedidos, entregas e movimentações da equipe.</p>
        </div>
      </section>
    );
  const periodOptions = [
    ["day", "Diário", "hoje"],
    ["week", "Semanal", "na semana"],
    ["month", "Mensal", "no mês"],
    ["year", "Anual", "no ano"],
  ];
  const current = data.periods?.[period] || {};
  const chartMode =
    { day: "daily", week: "weekly", month: "monthly", year: "yearly" }[
      period
    ] || "monthly";
  const chartRows = data.history?.[chartMode] || data.monthly || [];
  const maxRevenue = Math.max(
    1,
    ...chartRows.map((row) => Number(row.revenue || 0)),
  );
  const maxOrders = Math.max(
    1,
    ...chartRows.map((row) => Number(row.completed || 0)),
  );

  const teamRows = (data.team || []).filter(
    (row) =>
      teamScope === "ALL" ||
      (teamScope === "DELIVERY"
        ? row.role === "DELIVERY"
        : row.role !== "DELIVERY"),
  );
  const periodDeliveredFor = (row) =>
    (row.details?.delivered || []).filter((item) => item.periods?.[period]);
  const periodCanceledFor = (row) =>
    (row.details?.canceled || []).filter((item) => item.periods?.[period]);
  const aggregate = teamRows.reduce(
    (acc, row) => {
      const delivered = periodDeliveredFor(row);
      acc.people++;
      acc.completed += delivered.length;
      acc.total += delivered.reduce(
        (v, item) => v + Number(item.total || 0),
        0,
      );
      acc.cash += delivered.reduce(
        (v, item) => v + Number(item.cashCollected || 0),
        0,
      );
      acc.freight += delivered.reduce(
        (v, item) => v + Number(item.deliveryFee || 0),
        0,
      );
      acc.km += delivered.reduce(
        (v, item) => v + Number(item.distanceKm || 0),
        0,
      );
      acc.canceled += periodCanceledFor(row).length;
      return acc;
    },
    {
      people: 0,
      completed: 0,
      total: 0,
      cash: 0,
      freight: 0,
      km: 0,
      canceled: 0,
    },
  );

  const member = selectedMember
    ? (data.team || []).find((row) => row.id === selectedMember)
    : null;
  const memberAll = member?.details?.delivered || [];
  const memberPeriod = memberAll.filter((item) => item.periods?.[period]);
  const paymentOptions = [
    ...new Set(memberPeriod.map(paymentFilterKey).filter(Boolean)),
  ];
  const details =
    paymentFilter === "ALL"
      ? memberPeriod
      : memberPeriod.filter((item) => paymentFilterKey(item) === paymentFilter);
  const sum = (key) =>
    details.reduce((total, item) => total + Number(item[key] || 0), 0);
  const filteredTotal = sum("total"),
    filteredFreight = sum("deliveryFee"),
    filteredKm = sum("distanceKm"),
    filteredCash = sum("cashCollected");
  const memberCanceled = (member?.details?.canceled || []).filter(
    (item) => item.periods?.[period],
  ).length;
  const periodLabel =
    periodOptions.find(([key]) => key === period)?.[1] || "Período";
  const scopeLabel =
    teamScope === "ALL"
      ? "Equipe completa"
      : teamScope === "DELIVERY"
        ? "Entregadores"
        : "Funcionários";

  return (
    <div className="analytics-page">
      <section className="admin-panel analytics-head">
        <div>
          <span className="eyebrow dark">Gestão da equipe</span>
          <h2>Desempenho e resultados</h2>
          <p>
            Compare faturamento, frete, entregas, quilômetros e desempenho por
            dia, semana, mês ou ano.
          </p>
        </div>
        <div className="analytics-updated">
          <Activity size={18} />
          <span>
            <small>Atualizado</small>
            <b>
              {new Date(data.updatedAt).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </b>
          </span>
        </div>
      </section>

      <section className="admin-panel financial-period-panel">
        <div className="financial-period-tabs">
          {periodOptions.map(([key, label]) => (
            <button
              type="button"
              key={key}
              className={period === key ? "active" : ""}
              onClick={() => setPeriod(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="financial-kpis">
          <article>
            <span>
              <ReceiptText size={18} />
            </span>
            <div>
              <small>
                Faturamento {periodOptions.find(([k]) => k === period)?.[2]}
              </small>
              <b>{money(current.revenue || 0)}</b>
            </div>
          </article>
          <article>
            <span>
              <MotoIcon size={19} />
            </span>
            <div>
              <small>Valor de fretes</small>
              <b>{money(current.deliveryFees || 0)}</b>
            </div>
          </article>
          <article className="net-sales">
            <span>
              <DollarSign size={18} />
            </span>
            <div>
              <small>Valor sem frete</small>
              <b>
                {money(
                  current.netRevenue ??
                    Number(current.revenue || 0) -
                      Number(current.deliveryFees || 0),
                )}
              </b>
            </div>
          </article>
          <article>
            <span>
              <ShoppingBag size={18} />
            </span>
            <div>
              <small>Concluídos</small>
              <b>{current.completed || 0}</b>
            </div>
          </article>
        </div>
        <p className="financial-note">
          Valor sem frete = total dos pedidos − taxas de entrega. Não desconta
          ingredientes, salários, impostos ou outros custos.
        </p>
      </section>

      <section className="admin-panel analytics-chart-panel">
        <div className="panel-title">
          <div>
            <span>Histórico financeiro</span>
            <h2>Faturamento por período</h2>
            <p>
              O gráfico acompanha automaticamente o filtro geral acima. No
              celular, arraste para os lados.
            </p>
          </div>
          <DollarSign />
        </div>
        <div className="analytics-chart-scroll">
          <div
            className={`analytics-chart history-${chartMode}`}
            style={{
              gridTemplateColumns: `repeat(${Math.max(chartRows.length, 1)}, minmax(64px,1fr))`,
            }}
          >
            {chartRows.map((row) => {
              const height = Math.max(
                4,
                Math.round((Number(row.revenue || 0) / maxRevenue) * 100),
              );
              const orderHeight = Math.max(
                3,
                Math.round((Number(row.completed || 0) / maxOrders) * 100),
              );
              return (
                <div className="analytics-month" key={row.key}>
                  <div className="analytics-bars">
                    <div
                      className="analytics-order-shadow"
                      style={{ height: `${orderHeight}%` }}
                    />
                    <div
                      className="analytics-revenue-bar"
                      style={{ height: `${height}%` }}
                    >
                      <b>{row.completed}</b>
                    </div>
                  </div>
                  <small>{row.label}</small>
                  <strong>{money(row.revenue)}</strong>
                </div>
              );
            })}
          </div>
        </div>
        <div className="analytics-legend">
          <span>
            <i className="legend-revenue" /> Faturamento
          </span>
          <span>
            <i className="legend-orders" /> Pedidos concluídos
          </span>
        </div>
      </section>

      <section className="admin-panel team-aggregate-panel">
        <div className="panel-title">
          <div>
            <span>Totais da equipe</span>
            <h2>
              {scopeLabel} • {periodLabel}
            </h2>
            <p>
              Veja todos juntos ou separe funcionários e entregadores, mantendo
              o mesmo período selecionado acima.
            </p>
          </div>
          <Users />
        </div>
        <div className="team-scope-tabs">
          <button
            type="button"
            className={teamScope === "ALL" ? "active" : ""}
            onClick={() => setTeamScope("ALL")}
          >
            Todos juntos
          </button>
          <button
            type="button"
            className={teamScope === "STAFF" ? "active" : ""}
            onClick={() => setTeamScope("STAFF")}
          >
            Funcionários
          </button>
          <button
            type="button"
            className={teamScope === "DELIVERY" ? "active" : ""}
            onClick={() => setTeamScope("DELIVERY")}
          >
            Entregadores
          </button>
        </div>
        <div className="team-aggregate-grid">
          <article>
            <small>Pessoas</small>
            <b>{aggregate.people}</b>
          </article>
          <article>
            <small>Pedidos concluídos</small>
            <b>{aggregate.completed}</b>
          </article>
          <article>
            <small>Valor movimentado</small>
            <b>{money(aggregate.total)}</b>
          </article>
          <article>
            <small>Dinheiro recebido</small>
            <b>{money(aggregate.cash)}</b>
          </article>
          <article>
            <small>Fretes</small>
            <b>{money(aggregate.freight)}</b>
          </article>
          <article>
            <small>Km registrados</small>
            <b>{aggregate.km.toFixed(1)} km</b>
          </article>
          <article>
            <small>Cancelados</small>
            <b>{aggregate.canceled}</b>
          </article>
        </div>
      </section>

      <section className="admin-panel">
        <div className="panel-title">
          <div>
            <span>Equipe</span>
            <h2>Funcionários e entregadores</h2>
            <p>
              Clique em uma pessoa para analisar ganhos, dinheiro recebido,
              frete e quilômetros no período selecionado.
            </p>
          </div>
          <Users />
        </div>
        <div className="team-performance-list">
          {teamRows.length ? (
            teamRows.map((row) => {
              const periodDelivered = periodDeliveredFor(row);
              const pTotal = periodDelivered.reduce(
                (v, item) => v + Number(item.total || 0),
                0,
              );
              const pCash = periodDelivered.reduce(
                (v, item) => v + Number(item.cashCollected || 0),
                0,
              );
              const pKm = periodDelivered.reduce(
                (v, item) => v + Number(item.distanceKm || 0),
                0,
              );
              const pFreight = periodDelivered.reduce(
                (v, item) => v + Number(item.deliveryFee || 0),
                0,
              );
              return (
                <article
                  key={row.id}
                  className="team-performance-clickable"
                  onClick={() => {
                    setSelectedMember(row.id);
                    setPaymentFilter("ALL");
                  }}
                >
                  <div className="team-person">
                    <div
                      className={`team-avatar ${row.role === "DELIVERY" ? "delivery" : "staff"}`}
                    >
                      {row.role === "DELIVERY" ? (
                        <MotoIcon size={20} />
                      ) : (
                        <UserRound size={18} />
                      )}
                    </div>
                    <span>
                      <b>{row.name}</b>
                      <small>
                        {row.role === "DELIVERY"
                          ? "Entregador"
                          : "Funcionário / administrador"}{" "}
                        • {periodLabel}
                      </small>
                    </span>
                  </div>
                  <div className="team-metric">
                    <small>Concluídos</small>
                    <b>{periodDelivered.length}</b>
                  </div>
                  <div className="team-metric money">
                    <small>Valor</small>
                    <b>{money(pTotal)}</b>
                  </div>
                  <div className="team-metric money">
                    <small>Dinheiro recebido</small>
                    <b>{money(pCash)}</b>
                  </div>
                  <div className="team-metric">
                    <small>Km</small>
                    <b>{pKm.toFixed(1)} km</b>
                  </div>
                  <div className="team-metric">
                    <small>Fretes</small>
                    <b>{money(pFreight)}</b>
                  </div>
                  <ChevronRight size={18} className="team-open-indicator" />
                </article>
              );
            })
          ) : (
            <div className="empty-admin">
              <Activity />
              <p>Sem atividade suficiente neste filtro.</p>
            </div>
          )}
        </div>
      </section>

      {member && (
        <div
          className="modal-backdrop team-detail-backdrop"
          onMouseDown={(e) =>
            e.target === e.currentTarget && setSelectedMember(null)
          }
        >
          <section className="team-detail-modal">
            <div className="modal-head">
              <div>
                <span className="eyebrow dark">Desempenho individual</span>
                <h2>{member.name}</h2>
                <p>
                  {member.role === "DELIVERY"
                    ? "Entregador"
                    : "Funcionário / administrador"}{" "}
                  • {periodLabel}
                </p>
              </div>
              <button
                type="button"
                className="icon-close"
                onClick={() => setSelectedMember(null)}
              >
                <X />
              </button>
            </div>
            <div className="member-period-tabs">
              {periodOptions.map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  className={period === key ? "active" : ""}
                  onClick={() => {
                    setPeriod(key);
                    setPaymentFilter("ALL");
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="team-detail-summary team-detail-summary-six">
              <article>
                <small>Total movimentado</small>
                <b>{money(filteredTotal)}</b>
              </article>
              <article>
                <small>Dinheiro recebido pessoalmente</small>
                <b>{money(filteredCash)}</b>
              </article>
              <article>
                <small>Fretes</small>
                <b>{money(filteredFreight)}</b>
              </article>
              <article>
                <small>Km percorridos</small>
                <b>{filteredKm.toFixed(1)} km</b>
              </article>
              <article>
                <small>Sem frete</small>
                <b>{money(filteredTotal - filteredFreight)}</b>
              </article>
              <article>
                <small>Cancelados</small>
                <b>{memberCanceled}</b>
              </article>
            </div>
            <div className="team-payment-filter">
              <span>
                <b>Filtrar entregas por pagamento</b>
                <small>
                  O filtro também recalcula valor, dinheiro recebido, frete e
                  km.
                </small>
              </span>
              <select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value)}
              >
                <option value="ALL">Todas as formas</option>
                {paymentOptions.map((key) => (
                  <option key={key} value={key}>
                    {paymentFilterLabel(key)}
                  </option>
                ))}
              </select>
            </div>
            <div className="team-filtered-summary">
              <span>
                <small>Registros</small>
                <b>{details.length}</b>
              </span>
              <span>
                <small>Valor total</small>
                <b>{money(filteredTotal)}</b>
              </span>
              <span>
                <small>Dinheiro em mãos</small>
                <b>{money(filteredCash)}</b>
              </span>
              <span>
                <small>Fretes</small>
                <b>{money(filteredFreight)}</b>
              </span>
              <span>
                <small>Distância</small>
                <b>{filteredKm.toFixed(1)} km</b>
              </span>
            </div>
            <div className="team-delivery-history">
              <div className="team-detail-table-head">
                <b>Pedidos entregues</b>
                <span>{details.length} registros</span>
              </div>
              {details.length ? (
                details.map((item) => (
                  <article key={`${item.orderId}-${item.at}`}>
                    <div>
                      <b>#{item.shortCode}</b>
                      <small>
                        {item.customerName} •{" "}
                        {new Date(item.at).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </small>
                    </div>
                    <span>
                      <small>Pagamento</small>
                      <b>
                        {paymentLabel(item)}
                      </b>
                      <small>
                        {item.paymentStatus === "APPROVED"
                          ? "Confirmado online"
                          : item.paymentMethod === "CASH"
                            ? "Recebido na entrega"
                            : item.paymentStatus || ""}
                      </small>
                    </span>
                    <span>
                      <small>Total</small>
                      <b>{money(item.total)}</b>
                      {item.cashCollected > 0 && (
                        <small className="cash-received-mark">
                          Em dinheiro: {money(item.cashCollected)}
                        </small>
                      )}
                    </span>
                    <span>
                      <small>Frete</small>
                      <b>{money(item.deliveryFee)}</b>
                    </span>
                    <span>
                      <small>Sem frete</small>
                      <b>{money(item.netRevenue)}</b>
                    </span>
                    {item.distanceKm != null && (
                      <span>
                        <small>Distância</small>
                        <b>{Number(item.distanceKm).toFixed(1)} km</b>
                      </span>
                    )}
                  </article>
                ))
              ) : (
                <div className="empty-admin">
                  <MotoIcon />
                  <p>Nenhum pedido para este período/filtro.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

