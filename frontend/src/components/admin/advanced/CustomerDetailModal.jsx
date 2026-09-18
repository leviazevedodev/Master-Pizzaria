import React, { useEffect, useState } from "react";
import { AlertTriangle, Clock3, Save, Star, X } from "lucide-react";
import { api, authHeaders } from "../../../lib/api";
import { money } from "../../../lib/format";

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

