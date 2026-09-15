const TERMINAL_FAILURES = new Set(["REJECTED", "REFUNDED"]);

export function paymentStatusFromProvider(providerStatus) {
  if (providerStatus === "approved") return "APPROVED";
  if (["refunded", "charged_back"].includes(providerStatus)) return "REFUNDED";
  if (["rejected", "cancelled"].includes(providerStatus)) return "REJECTED";
  return "PENDING";
}

export function nextPaymentState(
  currentStatus,
  providerStatus,
  currentPaidAt = null,
  approvedAt = null,
  now = new Date(),
) {
  const candidate = paymentStatusFromProvider(providerStatus);
  const staleAfterRefund = currentStatus === "REFUNDED" && candidate !== "REFUNDED";
  const staleAfterRejection =
    currentStatus === "REJECTED" && candidate !== "REJECTED";
  const staleAfterApproval =
    currentStatus === "APPROVED" &&
    ["PENDING", "REJECTED"].includes(candidate);
  const status =
    staleAfterRefund || staleAfterRejection || staleAfterApproval
      ? currentStatus
      : candidate;
  const parsedApproval = approvedAt ? new Date(approvedAt) : null;
  const paidAt =
    status === "APPROVED" && parsedApproval && !Number.isNaN(parsedApproval.getTime())
      ? parsedApproval
      : status === "APPROVED"
        ? currentPaidAt || now
        : currentPaidAt;
  return { status, paidAt, ignored: status !== candidate };
}

export function releasesReservedBenefits(currentStatus, nextStatus) {
  return TERMINAL_FAILURES.has(nextStatus) && !TERMINAL_FAILURES.has(currentStatus);
}
