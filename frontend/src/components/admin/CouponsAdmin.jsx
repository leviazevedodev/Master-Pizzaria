import React, { useEffect, useState } from "react";
import { Plus, RefreshCw, Trash2, Trophy } from "lucide-react";
import { api, authHeaders } from "../../lib/api";
import { money } from "../../lib/format";

const EMPTY_COUPON = {
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
};

const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString("pt-BR") : "Sem limite";

export default function CouponsAdmin({ session, notify, fail }) {
  const headers = authHeaders(session.token);
  const [coupons, setCoupons] = useState([]);
  const [coupon, setCoupon] = useState(EMPTY_COUPON);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/coupons", headers);
      setCoupons(data || []);
    } catch (error) {
      fail?.(error, "Não foi possível carregar os cupons.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [session.token]);

  async function addCoupon(event) {
    event.preventDefault();
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
      setCoupon(EMPTY_COUPON);
      notify?.("Cupom criado.");
      await load();
    } catch (error) {
      fail?.(error, "Não foi possível criar o cupom.");
    }
  }

  async function toggleCoupon(row) {
    try {
      await api.patch(
        `/admin/coupons/${row.id}`,
        { active: !row.active },
        headers,
      );
      notify?.(row.active ? "Cupom pausado." : "Cupom ativado.");
      await load();
    } catch (error) {
      fail?.(error, "Não foi possível alterar o cupom.");
    }
  }

  async function removeCoupon(row) {
    if (!window.confirm(`Excluir o cupom “${row.code}”?`)) return;
    try {
      await api.delete(`/admin/coupons/${row.id}`, headers);
      notify?.("Cupom excluído.");
      await load();
    } catch (error) {
      fail?.(error, "Não foi possível excluir o cupom.");
    }
  }

  return (
    <section className="admin-panel coupon-management-panel">
      <div className="panel-title">
        <div>
          <span>Marketing</span>
          <h2>Cupons de desconto</h2>
          <p>
            Defina desconto, gasto mínimo, limites, clientes permitidos e
            vigência.
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
            onChange={(event) =>
              setCoupon({ ...coupon, code: event.target.value.toUpperCase() })
            }
          />
        </label>
        <label className="coupon-description-field">
          <span>Descrição</span>
          <input
            placeholder="Ex.: 10% para pedidos acima de R$ 50"
            value={coupon.description}
            onChange={(event) =>
              setCoupon({ ...coupon, description: event.target.value })
            }
          />
        </label>
        <label>
          <span>Tipo de desconto</span>
          <select
            value={coupon.type}
            onChange={(event) =>
              setCoupon({ ...coupon, type: event.target.value })
            }
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
            onChange={(event) =>
              setCoupon({ ...coupon, value: event.target.value })
            }
          />
        </label>
        <label>
          <span>Gasto mínimo (R$)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={coupon.minimumOrder}
            onChange={(event) =>
              setCoupon({ ...coupon, minimumOrder: event.target.value })
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
              onChange={(event) =>
                setCoupon({ ...coupon, maxDiscount: event.target.value })
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
            onChange={(event) =>
              setCoupon({ ...coupon, maxUses: event.target.value })
            }
          />
        </label>
        <label>
          <span>Usos por cliente</span>
          <input
            type="number"
            min="1"
            value={coupon.perCustomerLimit}
            onChange={(event) =>
              setCoupon({ ...coupon, perCustomerLimit: event.target.value })
            }
          />
        </label>
        <label>
          <span>Início da vigência</span>
          <input
            type="datetime-local"
            value={coupon.startAt}
            onChange={(event) =>
              setCoupon({ ...coupon, startAt: event.target.value })
            }
          />
        </label>
        <label>
          <span>Fim da vigência</span>
          <input
            type="datetime-local"
            value={coupon.endAt}
            onChange={(event) =>
              setCoupon({ ...coupon, endAt: event.target.value })
            }
          />
        </label>
        <label className="coupon-guest-permission">
          <input
            type="checkbox"
            checked={coupon.allowGuest}
            onChange={(event) =>
              setCoupon({ ...coupon, allowGuest: event.target.checked })
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

      {loading ? (
        <p className="empty-inline">
          <RefreshCw size={14} /> Carregando cupons...
        </p>
      ) : (
        <div className="coupon-admin-list improved-coupon-list">
          {coupons.map((row) => {
            const discount =
              row.type === "PERCENT"
                ? `${Number(row.value)}%`
                : money(row.value);
            return (
              <article key={row.id}>
                <div className="coupon-code-block">
                  <b>{row.code}</b>
                  <small>{row.description || "Sem descrição"}</small>
                </div>
                <div className="coupon-facts">
                  <span><small>Desconto</small><b>{discount}</b></span>
                  <span><small>Pedido mínimo</small><b>{money(row.minimumOrder || 0)}</b></span>
                  <span><small>Uso por cliente</small><b>{row.perCustomerLimit || 1}x</b></span>
                  <span><small>Uso total</small><b>{row.uses || 0}{row.maxUses != null ? ` / ${row.maxUses}` : " / ∞"}</b></span>
                  <span><small>Sem conta</small><b>{row.allowGuest ? "Permitido" : "Bloqueado"}</b></span>
                  <span><small>Vigência</small><b>{formatDate(row.startAt)} → {formatDate(row.endAt)}</b></span>
                </div>
                <div className="coupon-row-actions">
                  <button
                    type="button"
                    className={row.active ? "area-toggle active" : "area-toggle"}
                    onClick={() => toggleCoupon(row)}
                  >
                    {row.active ? "Ativo" : "Pausado"}
                  </button>
                  <button
                    type="button"
                    className="subtle-danger"
                    onClick={() => removeCoupon(row)}
                    aria-label={`Excluir ${row.code}`}
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
      )}
    </section>
  );
}
