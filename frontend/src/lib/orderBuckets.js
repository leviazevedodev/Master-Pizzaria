const OPEN_STATUSES = new Set([
  "RECEIVED",
  "PREPARING",
  "OUT_FOR_DELIVERY",
  "SERVED",
]);

export function buildOrderBuckets(
  orders = [],
  { includeDineIn = false, deliveryOnly = false } = {},
) {
  const allowed = orders.filter((order) => {
    if (deliveryOnly) return order.fulfillmentType === "DELIVERY";
    return includeDineIn || order.fulfillmentType !== "DINE_IN";
  });
  const byStatus = (status) =>
    allowed.filter((order) => order.status === status);
  return {
    OPEN: allowed.filter((order) => OPEN_STATUSES.has(order.status)),
    PREP_QUEUE: allowed.filter((order) =>
      ["RECEIVED", "PREPARING"].includes(order.status),
    ),
    RECEIVED: byStatus("RECEIVED"),
    PREPARING: byStatus("PREPARING"),
    READY_FOR_DELIVERY: byStatus("READY_FOR_DELIVERY"),
    READY_FOR_PICKUP: byStatus("READY_FOR_PICKUP"),
    READY_FOR_TABLE: byStatus("READY_FOR_TABLE"),
    SERVED: byStatus("SERVED"),
    SCHEDULED: byStatus("SCHEDULED")
      .slice()
      .sort(
        (a, b) =>
          new Date(a.scheduledAt || a.createdAt) -
          new Date(b.scheduledAt || b.createdAt),
      ),
    OUT_FOR_DELIVERY: byStatus("OUT_FOR_DELIVERY"),
    DELIVERED: byStatus("DELIVERED"),
    CANCELED: byStatus("CANCELED"),
  };
}
