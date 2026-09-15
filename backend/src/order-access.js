export function adminOrderFilter({ role, userId }) {
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
        { status: "DELIVERED", OR: [
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
