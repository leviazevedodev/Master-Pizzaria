function amount(order) {
  const value = Number(order?.total || 0);
  return Number.isFinite(value) ? value : 0;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function buildFinancialSummary(orders = []) {
  const completed = orders.filter(
    (order) =>
      order.status === "DELIVERED" &&
      ["APPROVED", "CASH_PENDING"].includes(order.paymentStatus),
  );
  const canceled = orders.filter((order) => order.status === "CANCELED");
  const refunded = orders.filter(
    (order) => order.paymentStatus === "REFUNDED",
  );

  const retainedRevenue = completed.reduce(
    (total, order) => total + amount(order),
    0,
  );
  const refundedValue = refunded.reduce(
    (total, order) => total + amount(order),
    0,
  );
  const canceledValue = canceled.reduce(
    (total, order) => total + amount(order),
    0,
  );
  return buildFinancialSummaryFromTotals({
    completedOrders: completed.length,
    completedValue: retainedRevenue,
    canceledOrders: canceled.length,
    canceledValue,
    refundedOrders: refunded.length,
    refundedValue,
  });
}

export function buildFinancialSummaryFromTotals({
  completedOrders = 0,
  completedValue = 0,
  canceledOrders = 0,
  canceledValue = 0,
  refundedOrders = 0,
  refundedValue = 0,
} = {}) {
  const retainedRevenue = Number(completedValue || 0);
  const refunds = Number(refundedValue || 0);
  const grossRevenue = retainedRevenue + refunds;

  return {
    orders: Number(completedOrders || 0),
    completedOrders: Number(completedOrders || 0),
    canceledOrders: Number(canceledOrders || 0),
    refundedOrders: Number(refundedOrders || 0),
    grossRevenue: roundMoney(grossRevenue),
    canceledValue: roundMoney(canceledValue),
    refundedValue: roundMoney(refunds),
    netRevenue: roundMoney(grossRevenue - refunds),
    revenue: roundMoney(retainedRevenue),
    averageTicket: roundMoney(
      Number(completedOrders) ? retainedRevenue / Number(completedOrders) : 0,
    ),
  };
}
