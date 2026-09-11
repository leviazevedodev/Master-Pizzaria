export const TABLE_PAYMENT_METHODS = Object.freeze([
  "CASH",
  "PIX",
  "MACHINE_PIX",
  "DEBIT",
  "CREDIT",
  "BANESE_DEBIT",
  "CUSTOM",
]);

export const TABLE_ACTIVE_ORDER_STATUSES = Object.freeze([
  "RECEIVED",
  "PREPARING",
  "READY_FOR_TABLE",
  "SERVED",
]);

const money = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function tableLabel(table) {
  const name = String(table?.name || "").trim();
  return name || `Mesa ${Number(table?.number || 0)}`;
}

export function summarizeTableOrders(orders = []) {
  const valid = orders.filter((order) => order?.status !== "CANCELED");
  return {
    orderCount: valid.length,
    itemCount: valid.reduce(
      (sum, order) =>
        sum +
        (order.items || []).reduce(
          (itemSum, item) => itemSum + Number(item.quantity || 0),
          0,
        ),
      0,
    ),
    subtotal: money(
      valid.reduce((sum, order) => sum + Number(order.total || 0), 0),
    ),
    preparingCount: valid.filter((order) =>
      ["RECEIVED", "PREPARING"].includes(order.status),
    ).length,
    readyCount: valid.filter((order) => order.status === "READY_FOR_TABLE")
      .length,
    servedCount: valid.filter((order) => order.status === "SERVED").length,
  };
}

export function calculateTablePayment(totalValue, method, rawAmountPaid) {
  const total = money(totalValue);
  if (!Number.isFinite(total) || total < 0)
    return { ok: false, message: "Total da comanda inválido." };
  if (!TABLE_PAYMENT_METHODS.includes(method))
    return { ok: false, message: "Forma de pagamento inválida." };

  if (method !== "CASH")
    return { ok: true, total, amountPaid: total, changeAmount: 0 };

  const amountPaid = money(rawAmountPaid);
  if (!Number.isFinite(amountPaid) || amountPaid < total)
    return {
      ok: false,
      message: "O valor recebido deve ser igual ou maior que o total da comanda.",
    };
  return {
    ok: true,
    total,
    amountPaid,
    changeAmount: money(amountPaid - total),
  };
}
