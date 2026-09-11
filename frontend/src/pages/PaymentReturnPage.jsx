import React, { useEffect, useState } from "react";
import { Check, Clock3, CreditCard, LoaderCircle, XCircle } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";

export default function PaymentReturnPage() {
  const [params] = useSearchParams();
  const trackingCode = params.get("pedido") || "";
  const paymentId =
    params.get("payment_id") || params.get("collection_id") || "";
  const [status, setStatus] = useState("checking"),
    [message, setMessage] = useState(
      "Confirmando o pagamento com segurança...",
    );
  useEffect(() => {
    let timer;
    async function check() {
      try {
        if (paymentId && trackingCode)
          await api.post("/payments/mercadopago/sync", {
            paymentId,
            trackingCode,
          });
        const { data } = await api.get(
          `/orders/payment-status/${encodeURIComponent(trackingCode)}`,
        );
        if (data.paymentStatus === "APPROVED") {
          setStatus("approved");
          setMessage(
            "Pagamento aprovado. Seu pedido foi liberado para a loja.",
          );
          return;
        }
        if (data.paymentStatus === "REJECTED") {
          setStatus("failed");
          setMessage(
            "O pagamento não foi aprovado. Você pode tentar novamente.",
          );
          return;
        }
        setStatus("pending");
        setMessage(
          "O pagamento ainda está sendo processado. Atualizaremos assim que houver confirmação.",
        );
        timer = setTimeout(check, 3500);
      } catch {
        setStatus("pending");
        setMessage("Ainda estamos aguardando a confirmação do pagamento.");
        timer = setTimeout(check, 5000);
      }
    }
    if (trackingCode) check();
    else {
      setStatus("failed");
      setMessage("Não encontramos o pedido desta tentativa de pagamento.");
    }
    return () => clearTimeout(timer);
  }, [trackingCode, paymentId]);
  const Icon =
    status === "approved"
      ? Check
      : status === "failed"
        ? XCircle
        : status === "checking"
          ? LoaderCircle
          : Clock3;
  return (
    <div className="page-shell">
      <main className="container payment-return-page">
        <div className={`payment-result-icon ${status}`}>
          <Icon className={status === "checking" ? "spin" : ""} />
        </div>
        <span className="eyebrow dark">Pagamento</span>
        <h1>
          {status === "approved"
            ? "Pagamento confirmado."
            : status === "failed"
              ? "Pagamento não concluído."
              : "Aguardando confirmação."}
        </h1>
        <p>{message}</p>
        {trackingCode && (
          <div className="tracking-code">
            <small>Código do pedido</small>
            <b>{trackingCode}</b>
          </div>
        )}
        <div className="success-actions">
          {trackingCode && (
            <Link className="primary-btn" to={`/pedido/${trackingCode}`}>
              Ver pedido
            </Link>
          )}
          <Link className="ghost-dark-btn" to="/seus-pedidos">
            Seus pedidos
          </Link>
        </div>
        <small className="payment-security-note">
          <CreditCard size={14} /> O pedido online só aparece para a operação da
          loja depois da confirmação do provedor de pagamento.
        </small>
      </main>
    </div>
  );
}
