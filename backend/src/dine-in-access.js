// Estas ações pertencem também ao fluxo de Pedidos. Cadastro e abertura de
// mesas continuam exclusivos da permissão tables.
export function tableRoutePermission(path, method) {
  const orderAction = method === "POST" && (
    /^\/table-orders\/[^/]+\/(served|cancel)\/?$/.test(path) ||
    /^\/table-sessions\/[^/]+\/close\/?$/.test(path)
  );
  const paymentSummary = method === "GET" &&
    /^\/table-session-summary\/[^/]+\/?$/.test(path);
  if (orderAction || paymentSummary) return "__TABLE_ORDER__";
  if (path.startsWith("/tables") || path.startsWith("/table-")) return "tables";
  return null;
}

export function canManageDineInOrders(user, permissions) {
  if (!user?.isAdmin || user.staffActive === false || user.staffRole === "DELIVERY")
    return false;
  return permissions == null || user.staffRole === "WAITER" ||
    permissions.includes("orders") || permissions.includes("tables");
}
