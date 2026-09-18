import React, { useEffect, useMemo, useState } from "react";
import { Banknote, Check, LoaderCircle, X } from "lucide-react";
import { api, authHeaders } from "../lib/api";
import { money } from "../lib/format";
import { tablePaymentOptions } from "../lib/tablePayments";
import "../styles/combo-payment.css";

export default function TableOrderPaymentModal({
  order,
  settings,
  session,
  onClose,
  onPaid,
  fail,
}) {
  const [summary, setSummary] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [amountPaid, setAmountPaid] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const headers = authHeaders(session.token);
  const total = Number(summary?.summary?.subtotal ?? summary?.total ?? 0);
  const pending = summary?.orders?.some((item) =>
    ["RECEIVED", "PREPARING", "READY_FOR_TABLE"].includes(item.status),
  );
  const options = useMemo(() => tablePaymentOptions(settings), [settings]);

  useEffect(() => {
    if (options.length && !options.some((option) => option.value === paymentMethod))
      setPaymentMethod(options[0].value);
  }, [options, paymentMethod]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setSummary(null);
    setError("");
    api
      .get(`/admin/table-session-summary/${order.tableSessionId}`, headers)
      .then(({ data }) => active && setSummary(data))
      .catch((error) => {
        if (active)
          setError(error.response?.data?.message || "Não foi possível conferir a comanda. Feche e tente novamente.");
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [order.tableSessionId, session.token]);

  async function submit(event) {
    event.preventDefault();
    if (saving || !summary || pending || !options.length) return;
    setSaving(true);
    setError("");
    try {
      const { data } = await api.post(
        `/admin/table-sessions/${order.tableSessionId}/close`,
        {
          paymentMethod,
          amountPaid: paymentMethod === "CASH" ? amountPaid : undefined,
        },
        headers,
      );
      await onPaid?.(data);
    } catch (error) {
      setError(error.response?.data?.message || "Não foi possível concluir o pagamento da mesa.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => !saving && event.target === event.currentTarget && onClose()}
    >
      <form className="table-payment-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-label="Pagamento da comanda">
        <div className="modal-head">
          <div>
            <span className="eyebrow dark">Pagamento da comanda</span>
            <h2>{order.table?.name || `Mesa ${order.table?.number || "—"}`}</h2>
            <p>Confirme a forma de pagamento antes de liberar a mesa.</p>
          </div>
          <button type="button" className="icon-close" onClick={onClose} disabled={saving} aria-label="Fechar">
            <X />
          </button>
        </div>
        {error && <p className="payment-inline-error" role="alert">{error}</p>}
        {loading ? (
          <div className="payment-summary-loading">
            <LoaderCircle className="spin" /> Conferindo toda a comanda...
          </div>
        ) : (
          <>
            <div className="table-payment-summary">
              <Banknote />
              <span>
                <small>Total da mesa</small>
                <strong>{money(total)}</strong>
              </span>
              <em>{summary?.orders?.filter((item) => item.status !== "CANCELED").length || 0} pedido(s)</em>
            </div>
            <label>
              Forma de pagamento
              <select
                required
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value)}
              >
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {paymentMethod === "CASH" && (
              <label>
                Valor recebido (R$) — opcional
                <input
                  type="number"
                  min={total}
                  step="0.01"
                  value={amountPaid}
                  onChange={(event) => setAmountPaid(event.target.value)}
                  placeholder={total.toFixed(2)}
                />
                <small>Se deixar vazio, será considerado o valor exato da comanda.</small>
              </label>
            )}
            <p className="table-payment-warning">
              {pending
                ? "Ainda há pedidos para preparar ou servir. Conclua essas etapas antes de receber o pagamento."
                : "Ao concluir, todos os pedidos servidos desta comanda serão marcados como entregues e a mesa ficará livre."}
            </p>
            <div className="modal-actions">
              <button type="button" className="outline-btn" onClick={onClose} disabled={saving}>
                Voltar
              </button>
              <button className="primary-btn" disabled={saving || !options.length || !summary || pending}>
                <Check size={17} /> {saving ? "Concluindo..." : "Receber e liberar mesa"}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
