export const COURIER_DELIVERED_VISIBILITY_MS = 7 * 24 * 60 * 60 * 1000;
export const canMarkKitchenPrinted = (role, kitchenAccess) => role !== "DELIVERY" && kitchenAccess === true;

export function adminOrderFilter({ role, userId, now = new Date() }) {
  const confirmed = { paymentStatus: { in: ["APPROVED", "CASH_PENDING"] } };
  if (role === "WAITER")
    return { ...confirmed, fulfillmentType: "DINE_IN", status: "READY_FOR_TABLE" };
  if (role === "DELIVERY")
    return {
      ...confirmed,
      fulfillmentType: "DELIVERY",
      OR: [
        { status: "READY_FOR_DELIVERY", assignedCourierId: null },
        { status: "OUT_FOR_DELIVERY", assignedCourierId: userId },
        { status: "DELIVERED", deliveredAt: { gt: new Date(now.getTime() - COURIER_DELIVERED_VISIBILITY_MS) }, OR: [
          { assignedCourierId: userId },
          { history: { some: { status: "DELIVERED", changedByUserId: userId } } },
        ] },
      ],
    };
  return {
    OR: [
      { paymentStatus: { in: ["APPROVED", "CASH_PENDING", "REFUNDED"] } },
      { status: "CANCELED" },
    ],
  };
}
