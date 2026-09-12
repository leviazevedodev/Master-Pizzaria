export const CONFIRMED_PAYMENT_STATUSES = Object.freeze([
  "APPROVED",
  "CASH_PENDING",
]);

const HIDDEN_READY_STATUSES = new Set([
  "READY_FOR_DELIVERY",
  "READY_FOR_TABLE",
]);

export function customerVisibleStatus(status) {
  return HIDDEN_READY_STATUSES.has(status) ? "PREPARING" : status;
}

export function customerCanCancel(status) {
  return status === "SCHEDULED" || status === "RECEIVED";
}

export function isConfirmedPaymentStatus(status) {
  return CONFIRMED_PAYMENT_STATUSES.includes(status);
}
