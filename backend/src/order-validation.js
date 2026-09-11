const REQUIRED_DELIVERY_FIELDS = [
  ["postalCode", "CEP"],
  ["state", "estado"],
  ["city", "cidade"],
  ["neighborhood", "bairro"],
  ["street", "rua/avenida"],
  ["addressNumber", "número"],
];

export function missingDeliveryAddressFields(address = {}) {
  return REQUIRED_DELIVERY_FIELDS.filter(
    ([key]) => !String(address[key] ?? "").trim(),
  ).map(([, label]) => label);
}
