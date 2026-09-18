export const OPERATION_REFRESH_MS = 5000;

export function kitchenCountdown(order, now, fallbackMinutes = 45) {
  const ready = !["RECEIVED", "PREPARING"].includes(order.status);
  if (ready) return { label: "Pronto", ratio: 1, tone: "ready", description: "Pedido pronto" };

  const configured = Number(order.estimatedDeliveryMax ?? fallbackMinutes);
  const duration = (Number.isFinite(configured) && configured > 0 ? configured : 45) * 60000;
  const start = Date.parse(order.acceptedAt || order.createdAt);
  const estimated = Date.parse(order.estimatedTo);
  const deadline = Number.isFinite(estimated) ? estimated : start + duration;
  if (!Number.isFinite(deadline)) {
    return { label: "—", ratio: 0, tone: "unknown", description: "Prazo não informado" };
  }

  const remaining = deadline - now;
  const overdue = remaining < 0;
  const seconds = Math.ceil(Math.abs(remaining) / 1000);
  const label = `${overdue ? "+" : ""}${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return {
    label,
    ratio: Math.max(0, Math.min(1, remaining / duration)),
    tone: overdue ? "late" : remaining <= duration * 0.25 ? "soon" : "normal",
    description: `${overdue ? "Prazo excedido em" : "Tempo previsto restante:"} ${label.replace("+", "")}`,
  };
}

export function managementErrorMessage(error) {
  const code = error?.response?.data?.code;
  if (["P2021", "P2022", "DATABASE_SCHEMA_OUTDATED", "SCHEMA_OUTDATED", "MISSING_MIGRATIONS"].includes(code)) {
    return "A estrutura do banco precisa ser atualizada com as migrações desta versão.";
  }
  if (error?.response?.data?.message) return error.response.data.message;
  if (!error?.response) return "Sem resposta do servidor. Verifique a conexão e tente atualizar.";
  if (error.response.status === 403) return "Esta conta não tem permissão para consultar esta área.";
  return "Não foi possível consultar esta área. Tente atualizar.";
}
