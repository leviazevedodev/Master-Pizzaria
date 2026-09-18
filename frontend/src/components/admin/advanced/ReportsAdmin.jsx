import React, { useEffect, useState } from "react";
import {
  CircleX,
  Clock3,
  Gauge,
  PackageSearch,
  Receipt,
  ShoppingBag,
  Star,
  Trophy,
  Undo2,
  WalletCards,
} from "lucide-react";
import { api, authHeaders } from "../../../lib/api";
import { money } from "../../../lib/format";

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
          <section className="report-kpis financial-report-kpis">
            <article className="gross">
              <Receipt />
              <span>
                <small>Total vendido</small>
                <b>{money(data.summary.grossRevenue ?? data.summary.revenue)}</b>
                <em>antes dos estornos</em>
              </span>
            </article>
            <article className="canceled">
              <CircleX />
              <span>
                <small>Pedidos cancelados</small>
                <b>{money(data.summary.canceledValue || 0)}</b>
                <em>{data.summary.canceledOrders || 0} pedidos</em>
              </span>
            </article>
            <article className="refunded">
              <Undo2 />
              <span>
                <small>Devolvido aos clientes</small>
                <b>{money(data.summary.refundedValue || 0)}</b>
                <em>{data.summary.refundedOrders || 0} estornos</em>
              </span>
            </article>
            <article className="net">
              <WalletCards />
              <span>
                <small>Receita após estornos</small>
                <b>{money(data.summary.netRevenue ?? data.summary.revenue)}</b>
                <em>valor que permaneceu nas vendas</em>
              </span>
            </article>
            <article>
              <ShoppingBag />
              <span>
                <small>Pedidos finalizados</small>
                <b>{data.summary.completedOrders ?? data.summary.orders}</b>
                <em>pagos e concluídos</em>
              </span>
            </article>
            <article>
              <Gauge />
              <span>
                <small>Média por pedido</small>
                <b>{money(data.summary.averageTicket)}</b>
                <em>somente pedidos finalizados</em>
              </span>
            </article>
          </section>
          <p className="report-financial-note">
            Cancelamentos mostram o valor dos pedidos interrompidos, pagos ou
            não. “Devolvido aos clientes” considera somente pagamentos
            efetivamente estornados; a receita após estornos não soma esses
            valores.
          </p>
          <section className="report-kpis operational-report-kpis">
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

