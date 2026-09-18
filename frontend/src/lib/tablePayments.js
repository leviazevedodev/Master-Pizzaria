export const TABLE_PAYMENT_LABELS = Object.freeze({
  CASH: "Dinheiro",
  PIX: "Pix",
  CREDIT: "Cartão de crédito",
  DEBIT: "Cartão de débito",
});

export function tablePaymentOptions(settings = {}) {
  const enabled = settings.tablePaymentMethods || Object.keys(TABLE_PAYMENT_LABELS);
  return [
    ...Object.entries(TABLE_PAYMENT_LABELS)
      .filter(([value]) => enabled.includes(value))
      .map(([value, label]) => ({ value, label })),
    ...(settings.customPaymentMethods || [])
      .filter((method) => method.active !== false && method.tableEnabled !== false)
      .map((method) => ({ value: `CUSTOM:${method.id}`, label: method.label })),
  ];
}
