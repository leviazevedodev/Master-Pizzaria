import { isCourierDispatchPath } from "./admin-permissions.js";
import { tableRoutePermission } from "./dine-in-access.js";

const OPERATION_SETTING_FIELDS = new Set([
  "isOpen",
  "deliveryEnabled",
  "pickupEnabled",
  "schedulingEnabled",
]);

const DELIVERY_SETTING_FIELDS = new Set([
  "deliveryPricingMode",
  "deliveryHybridEnabled",
  "deliveryPricePerKm",
  "deliveryMinimumKm",
  "deliveryMinimumFee",
  "deliveryMaxDistanceKm",
  "freeDeliveryThreshold",
  "deliveryFee",
  "defaultMinimumOrder",
]);

export function permissionNeededForAdminRequest(req) {
  const path = req.path || "/";
  const method = String(req.method || "GET").toUpperCase();
  if (path.startsWith("/staff")) return "__OWNER__";
  const tablePermission = tableRoutePermission(path, method);
  if (tablePermission) return tablePermission;
  if (path.startsWith("/dashboard")) return "overview";
  if (path.startsWith("/team-analytics")) return "analytics";
  if (path.startsWith("/business-insights")) return "reports";
  if (path.startsWith("/inventory") || path.includes("/recipe"))
    return "inventory";
  if (/^\/kitchen\/orders\/[^/]+\/advance\/?$/.test(path))
    return "__ORDER_OR_KITCHEN__";
  if (path.startsWith("/kitchen")) return "kitchen";
  if (path.startsWith("/delivery-surcharges")) return "delivery";
  if (isCourierDispatchPath(path)) return "__COURIER_DISPATCH__";
  if (path.startsWith("/courier") || path.startsWith("/orders"))
    return "orders";
  if (path.startsWith("/customers") || path.startsWith("/customer-segments"))
    return "customers";
  if (path.startsWith("/promotions") || path.startsWith("/coupons"))
    return "promotions";
  if (path.startsWith("/delivery-areas")) return "delivery";
  if (path.startsWith("/map/deliveries")) return "orders";
  if (path.startsWith("/cash")) return "operations";
  if (path.startsWith("/goals") || path.startsWith("/operations-intelligence"))
    return "reports";
  if (
    path.startsWith("/logs") ||
    path.startsWith("/health") ||
    path.startsWith("/advanced/settings")
  )
    return "settings";
  if (path.startsWith("/store-hours") || path.startsWith("/operations"))
    return "operations";
  if (path.startsWith("/media")) return "__CONTENT__";
  if (path.startsWith("/combos"))
    return method === "GET" ? "__PRODUCT_READ__" : "products";
  if (path.startsWith("/products") || path.startsWith("/sizes"))
    return method === "GET" ? "__PRODUCT_READ__" : "products";
  if (path.startsWith("/categories") || path.startsWith("/subcategories"))
    return method === "GET" ? "__CATEGORY_READ__" : "categories";
  if (path.startsWith("/flavors") || path.startsWith("/modifier-"))
    return method === "GET" ? "__ALTERATION_READ__" : "alterations";
  if (path.startsWith("/modifier-groups"))
    return method === "GET" ? "__ALTERATION_READ__" : "alterations";
  if (path.startsWith("/settings")) {
    if (method === "GET") return "__SHARED_SETTINGS__";
    const keys = Object.keys(req.body || {});
    if (keys.length && keys.every((key) => OPERATION_SETTING_FIELDS.has(key)))
      return "operations";
    if (keys.length && keys.every((key) => DELIVERY_SETTING_FIELDS.has(key)))
      return "delivery";
    return "settings";
  }
  return null;
}
