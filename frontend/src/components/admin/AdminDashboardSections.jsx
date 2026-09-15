import {
  ChevronRight,
  Eye,
  Search,
  Star,
  Trash2,
  UserRound,
} from "lucide-react";
import { money } from "../../lib/format";
import {
  ORDER_VIEW_LABELS,
  formatPhoneSimple,
} from "../../lib/adminOrders";
import {
  OrderList,
  OrderViewTabs,
  OverviewOrderTabs,
} from "./OrderWorkspace";

function Stat({ label, value }) {
  return (
    <article>
      <small>{label}</small>
      <b>{value}</b>
    </article>
  );
}

export function OverviewAdmin({
  dashboard,
  scheduledCount,
  overviewView,
  setOverviewView,
  overviewBuckets,
  overviewOrders,
  isDeliveryStaff,
  isWaiter,
  canOpenOrders,
  onShowAll,
  orderListProps,
}) {
  const description =
    overviewView === "OPEN"
      ? "Todos os pedidos que ainda precisam de atendimento."
      : overviewView === "RECEIVED"
        ? "Pedidos recém-chegados esperando aceite da equipe."
        : overviewView === "PREPARING"
          ? "Pedidos já aceitos e em produção."
          : overviewView === "READY_FOR_TABLE"
            ? "Pedidos do salão concluídos pela cozinha e aguardando o garçom."
            : overviewView === "SERVED"
              ? "Mesas já servidas que aguardam conferência, pagamento e liberação."
              : "Visualização separada para facilitar o trabalho da equipe.";

  return (
    <>
      <section className="admin-stats admin-stats-five">
        <Stat label="Pedidos hoje" value={dashboard?.todayOrders || 0} />
        <Stat label="Em andamento" value={dashboard?.openOrders || 0} />
        <Stat label="Agendados" value={scheduledCount} />
        <Stat label="Em alerta de prazo" value={dashboard?.warningOrders || 0} />
        <Stat label="Prazo atrasado" value={dashboard?.overdueOrders || 0} />
      </section>
      <section className="admin-panel">
        <div className="panel-title">
          <div>
            <span>{overviewView === "SCHEDULED" ? "Agenda" : "Operação agora"}</span>
            <h2>{ORDER_VIEW_LABELS[overviewView] || "Pedidos"}</h2>
            <p>{description}</p>
          </div>
          <div className="panel-actions">
            <OverviewOrderTabs
              value={overviewView}
              onChange={setOverviewView}
              buckets={overviewBuckets}
              deliveryOnly={isDeliveryStaff}
              waiterOnly={isWaiter}
            />
            {canOpenOrders && (
              <button className="text-refresh" onClick={onShowAll}>
                Ver todos <ChevronRight size={16} />
              </button>
            )}
          </div>
        </div>
        <OrderList orders={overviewOrders.slice(0, 8)} {...orderListProps} />
      </section>
    </>
  );
}

export function OrdersAdmin({
  orderView,
  setOrderView,
  orderBuckets,
  filteredOrders,
  orderSearch,
  setOrderSearch,
  isDeliveryStaff,
  isWaiter,
  orderListProps,
}) {
  return (
    <section className="admin-panel">
      <div className="panel-title">
        <div>
          <span>Gestão de pedidos</span>
          <h2>{ORDER_VIEW_LABELS[orderView] || "Pedidos recentes"}</h2>
          <p>
            {orderView === "OPEN"
              ? "Use os filtros rápidos para separar entrega, concluídos, cancelados e agendamentos."
              : "Esta fila está separada da operação principal."}
          </p>
        </div>
        <div className="panel-actions">
          <OrderViewTabs
            value={orderView}
            onChange={setOrderView}
            buckets={orderBuckets}
            deliveryOnly={isDeliveryStaff}
            waiterOnly={isWaiter}
          />
          <b>{filteredOrders.length} exibidos</b>
        </div>
      </div>
      <div className="admin-filters">
        <label>
          <Search size={16} />
          <input
            value={orderSearch}
            onChange={(event) => setOrderSearch(event.target.value)}
            placeholder="Buscar cliente, telefone, bairro, cidade ou código"
          />
        </label>
      </div>
      <p className="admin-help-line">
        <Eye size={16} /> Clique em um pedido para ver endereço completo, itens,
        sabores, pagamento, previsão e histórico.
      </p>
      <OrderList orders={filteredOrders} {...orderListProps} />
    </section>
  );
}

export function CustomersAdmin({
  customers,
  filteredCustomers,
  customerSearch,
  setCustomerSearch,
  onOpen,
  onDelete,
}) {
  return (
    <section className="admin-panel">
      <div className="panel-title">
        <div>
          <span>Relacionamento</span>
          <h2>Clientes cadastrados</h2>
          <p>
            VIPs, inativos, histórico completo, observações internas e bloqueio
            administrativo.
          </p>
        </div>
        <b>
          {filteredCustomers.length}/{customers.length}
        </b>
      </div>
      <div className="customer-search-box">
        <Search size={17} />
        <input
          value={customerSearch}
          onChange={(event) => setCustomerSearch(event.target.value)}
          placeholder="Buscar cliente por nome, e-mail ou telefone"
        />
      </div>
      <div className="customer-list">
        {filteredCustomers.map((customer) => (
          <article
            key={customer.id}
            className={`customer-row-clickable ${customer.customerBlocked ? "blocked" : ""}`}
            onClick={() => onOpen(customer.id)}
          >
            <div className="customer-avatar">
              <UserRound />
            </div>
            <div className="customer-identity">
              <b>
                {customer.name}{" "}
                {customer.vip && (
                  <em className="customer-vip-tag">
                    <Star size={12} /> VIP
                  </em>
                )}{" "}
                {customer.inactive && (
                  <em className="customer-inactive-tag">Inativo</em>
                )}
              </b>
              <small>
                {customer.email} • {formatPhoneSimple(customer.phone)}
              </small>
            </div>
            <div className="customer-stats-mini">
              <span>
                <small>Pedidos</small>
                <b>{customer.ordersCount}</b>
              </span>
              <span>
                <small>Total gasto</small>
                <b>{money(customer.lifetimeSpent || 0)}</b>
              </span>
            </div>
            <button
              className="subtle-danger customer-delete"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(customer);
              }}
              title="Excluir conta do cliente"
            >
              <Trash2 size={15} />
              <span>Excluir conta</span>
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
