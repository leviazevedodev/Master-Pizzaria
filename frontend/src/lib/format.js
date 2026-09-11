export const money = (value) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(value || 0),
  );

export const shortOrder = (value = "") =>
  value.toString().replaceAll("-", "").slice(-8).toUpperCase();

export const digits = (value = "") => value.replace(/\D/g, "");

export function formatPhone(value = "") {
  const clean = digits(value).slice(0, 11);
  if (clean.length <= 2) return clean;
  if (clean.length <= 7) return `(${clean.slice(0, 2)}) ${clean.slice(2)}`;
  return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
}

export function formatCep(value = "") {
  const clean = digits(value).slice(0, 8);
  return clean.length > 5 ? `${clean.slice(0, 5)}-${clean.slice(5)}` : clean;
}

export function etaRange(order) {
  if (!order) return "";
  let from = order.estimatedFrom ? new Date(order.estimatedFrom) : null;
  let to = order.estimatedTo ? new Date(order.estimatedTo) : null;
  if (
    (!from ||
      Number.isNaN(from.getTime()) ||
      !to ||
      Number.isNaN(to.getTime())) &&
    order.acceptedAt
  ) {
    const base = new Date(order.acceptedAt);
    const min = Number(order.estimatedDeliveryMin);
    const max = Number(order.estimatedDeliveryMax);
    if (
      !Number.isNaN(base.getTime()) &&
      Number.isFinite(min) &&
      Number.isFinite(max)
    ) {
      from = new Date(base.getTime() + min * 60000);
      to = new Date(base.getTime() + max * 60000);
    }
  }
  if (
    !from ||
    !to ||
    Number.isNaN(from.getTime()) ||
    Number.isNaN(to.getTime())
  )
    return "";
  const time = (date) =>
    date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const sameDay = from.toDateString() === to.toDateString();
  if (sameDay) return `${time(from)}-${time(to)}`;
  return `${from.toLocaleDateString("pt-BR")} ${time(from)} - ${to.toLocaleDateString("pt-BR")} ${time(to)}`;
}
