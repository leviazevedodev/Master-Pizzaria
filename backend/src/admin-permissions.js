export function canDispatchCouriers(user, permissions) {
  if (!user?.isAdmin || user.staffActive === false) return false;
  if (["DELIVERY", "WAITER"].includes(user.staffRole)) return false;
  if (permissions == null) return true;
  return Array.isArray(permissions) && permissions.includes("orders");
}

export function isCourierDispatchPath(path) {
  return (
    /^\/orders\/[^/]+\/assign-courier\/?$/.test(path) ||
    /^\/courier\/auto-assign\/[^/]+\/?$/.test(path)
  );
}
