export const STATUS_LABEL = Object.freeze({
  SCHEDULED: "Agendado",
  RECEIVED: "Recebido",
  PREPARING: "Em preparação",
  READY_FOR_DELIVERY: "Pronto para entrega",
  OUT_FOR_DELIVERY: "Entregando",
  READY_FOR_PICKUP: "Pronto para retirada",
  READY_FOR_TABLE: "Pronto para servir",
  SERVED: "Aguardando fechamento",
  DELIVERED: "Entregue",
  CANCELED: "Cancelado",
});

export const PAYMENT_LABEL = Object.freeze({
  CASH: "Dinheiro",
  CARD: "Pagamento online",
  PIX: "Pix",
  MACHINE_PIX: "Pix na maquineta",
  DEBIT: "Débito",
  CREDIT: "Crédito",
  BANESE_DEBIT: "Banese débito",
});

export const ORDER_VIEW_LABELS = Object.freeze({
  OPEN: "Em aberto",
  RECEIVED: "Recebidos",
  PREPARING: "Em preparação",
  READY_FOR_DELIVERY: "Prontos para entrega",
  READY_FOR_PICKUP: "Prontos p/ retirada",
  READY_FOR_TABLE: "Pronto para servir",
  SERVED: "Aguardando fechamento",
  SCHEDULED: "Agendamentos",
  OUT_FOR_DELIVERY: "Entregando",
  DELIVERED: "Entregues",
  CANCELED: "Cancelados",
});

export function paymentLabel(order) {
  return (
    order?.paymentMethodLabel ||
    PAYMENT_LABEL[order?.paymentMethod] ||
    order?.paymentMethod ||
    "—"
  );
}

export function paymentFilterKey(order) {
  return order?.paymentMethod === "CUSTOM"
    ? `CUSTOM:${order.paymentMethodLabel || "Personalizado"}`
    : order?.paymentMethod;
}

export function paymentFilterLabel(key) {
  return key?.startsWith("CUSTOM:") ? key.slice(7) : PAYMENT_LABEL[key] || key;
}

export function formatPhoneSimple(phone = "") {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.length === 11
    ? `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
    : phone || "—";
}

export function nextStatusForOrder(order) {
  if (order?.fulfillmentType === "DINE_IN") {
    return {
      RECEIVED: "PREPARING",
      PREPARING: "READY_FOR_TABLE",
      READY_FOR_TABLE: "SERVED",
    }[order.status] || null;
  }

  if (order?.status === "SCHEDULED") return "RECEIVED";
  if (order?.status === "RECEIVED") return "PREPARING";
  if (order?.status === "PREPARING") {
    return order.fulfillmentType === "PICKUP"
      ? "READY_FOR_PICKUP"
      : "READY_FOR_DELIVERY";
  }
  if (order?.status === "READY_FOR_DELIVERY") return "OUT_FOR_DELIVERY";
  if (["OUT_FOR_DELIVERY", "READY_FOR_PICKUP"].includes(order?.status)) {
    return "DELIVERED";
  }
  return null;
}
