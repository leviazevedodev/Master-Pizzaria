import React, { useState } from "react";
import { Ban, RotateCcw, X } from "lucide-react";
import { api, authHeaders } from "../lib/api";

export default function CustomerCancelOrderButton({
  order,
  token = "",
  onCanceled = () => {},
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!order?.canCancel) return null;

  async function cancel(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post(
        `/orders/${encodeURIComponent(order.trackingCode)}/cancel`,
        { reason: reason.trim() || "Cancelado pelo cliente." },
        authHeaders(token),
      );
      setOpen(false);
      onCanceled(data);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Não foi possível cancelar o pedido agora.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="customer-cancel-order-btn"
        onClick={() => setOpen(true)}
      >
        <Ban size={15} /> Cancelar pedido
      </button>
      {open && (
        <div
          className="modal-backdrop customer-cancel-backdrop"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setOpen(false)
          }
        >
          <form className="customer-cancel-modal" onSubmit={cancel}>
            <button
              type="button"
              className="icon-close"
              aria-label="Fechar"
              onClick={() => setOpen(false)}
            >
              <X />
            </button>
            <span className="customer-cancel-icon"><Ban /></span>
            <small>CANCELAR PEDIDO #{order.shortCode}</small>
            <h2>Deseja cancelar agora?</h2>
            <p>
              Se o pagamento online já foi aprovado, o reembolso integral será
              solicitado automaticamente para o mesmo meio de pagamento.
            </p>
            <label>
              Motivo <em>(opcional)</em>
              <textarea
                maxLength="280"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Ex.: fiz o pedido por engano"
              />
            </label>
            {error && <div className="form-error">{error}</div>}
            <div className="customer-cancel-actions">
              <button
                type="button"
                className="ghost-dark-btn"
                onClick={() => setOpen(false)}
              >
                Voltar
              </button>
              <button className="cancel-confirm-btn" disabled={loading}>
                {loading ? <RotateCcw className="spin" size={16} /> : <Ban size={16} />}
                {loading ? "Confirmando..." : "Confirmar cancelamento"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
