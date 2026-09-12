import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BarChart3,
  Check,
  ChevronRight,
  Clock3,
  Eye,
  EyeOff,
  ImagePlus,
  Layers3,
  LogOut,
  MapPin,
  PackagePlus,
  Pencil,
  Plus,
  RefreshCw,
  Route,
  Save,
  Search,
  Settings,
  ShoppingBag,
  Tags,
  Trash2,
  Upload,
  UserRound,
  Users,
  X,
  Megaphone,
  Palette,
  CreditCard,
  Power,
  ShieldCheck,
  AlertTriangle,
  CalendarClock,
  KeyRound,
  Activity,
  DollarSign,
  Trophy,
  CalendarDays,
  Headset,
  ReceiptText,
  Pizza,
  UtensilsCrossed,
  ChefHat,
  Boxes,
  ClipboardList,
  Star,
  Gauge,
  Sun,
  Moon,
  Armchair,
  Printer,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api, authHeaders, mediaUrl } from "../lib/api";
import { settleWithConcurrency } from "../lib/async";
import MotoIcon from "../components/MotoIcon";
import { fitImageFile } from "../lib/imageFit";
import { etaRange, money } from "../lib/format";
import { buildOrderBuckets } from "../lib/orderBuckets";
import {
  InventoryAdmin,
  KitchenAdmin,
  ReportsAdmin,
  CustomerDetailModal,
  DeliveryTimeRules,
  ManagementHub,
} from "../components/AdvancedAdminSections";
import TablesAdmin from "../components/TablesAdmin";
import MenuPrintStudio from "../components/MenuPrintStudio";

const STATUS_LABEL = {
  SCHEDULED: "Agendado",
  RECEIVED: "Recebido",
  PREPARING: "Em preparação",
  READY_FOR_DELIVERY: "Pronto para entrega",
  OUT_FOR_DELIVERY: "Entregando",
  READY_FOR_PICKUP: "Pronto para retirada",
  READY_FOR_TABLE: "Pronto para servir",
  SERVED: "Servido na mesa",
  DELIVERED: "Entregue",
  CANCELED: "Cancelado",
};
const PAYMENT_LABEL = {
  CASH: "Dinheiro",
  CARD: "Pagamento online",
  PIX: "Pix",
  MACHINE_PIX: "Pix na maquineta",
  DEBIT: "Débito",
  CREDIT: "Crédito",
  BANESE_DEBIT: "Banese débito",
};
const paymentLabel = (order) =>
  order?.paymentMethodLabel ||
  PAYMENT_LABEL[order?.paymentMethod] ||
  order?.paymentMethod ||
  "—";
const paymentFilterKey = (order) =>
  order?.paymentMethod === "CUSTOM"
    ? `CUSTOM:${order.paymentMethodLabel || "Personalizado"}`
    : order?.paymentMethod;
const paymentFilterLabel = (key) =>
  key?.startsWith("CUSTOM:") ? key.slice(7) : PAYMENT_LABEL[key] || key;
const ORDER_VIEW_LABELS = {
  OPEN: "Em aberto",
  RECEIVED: "Recebidos",
  PREPARING: "Em preparação",
  READY_FOR_DELIVERY: "Prontos para entrega",
  READY_FOR_PICKUP: "Prontos p/ retirada",
  READY_FOR_TABLE: "Pronto para servir",
  SERVED: "Aguardando fechamento",
  SCHEDULED: "Agendamentos",
  OUT_FOR_DELIVERY: "Entregando",
  DELIVERED: "Entregues",
  CANCELED: "Cancelados",
};
const TABS = [
  ["overview", Headset, "Atendimento", "overview"],
  ["analytics", Activity, "Desempenho", "analytics"],
  ["orders", ShoppingBag, "Pedidos", "orders"],
  ["kitchen", ChefHat, "Cozinha", "kitchen"],
  ["tables", Armchair, "Mesas", "tables"],
  ["operations", Power, "Operação", "operations"],
  ["catalog", Pizza, "Cardápio", "catalog"],
  ["inventory", Boxes, "Estoque", "inventory"],
  ["delivery", MotoIcon, "Entregas", "delivery"],
  ["customers", Users, "Clientes", "customers"],
  ["reports", ClipboardList, "Relatórios", "reports"],
  ["settings", Settings, "Loja", "settings"],
  ["management", Gauge, "Gestão 360°", "__OWNER__"],
  ["staff", ShieldCheck, "Funcionários", "__OWNER__"],
];
const EMPTY_PRODUCT = {
  name: "",
  slug: "",
  description: "",
  price: "",
  categoryId: "",
  subcategoryId: "",
  image: "",
  badge: "",
  featured: false,
  available: true,
  sortOrder: 0,
  allowFlavorSplit: false,
  maxFlavors: 1,
  flavorPricingMode: "MAX",
  flavorIds: [],
  modifierGroupIds: [],
  isFlavorOption: false,
  sizePrices: [],
  stockTracked: false,
  stockQuantity: 0,
  stockLowThreshold: 5,
  costPrice: 0,
  pausedUntil: "",
  availableStartTime: "",
  availableEndTime: "",
  removableIngredients: "",
};
function toIsoDateTime(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default function AdminPage({
  session,
  onLogout,
  onLogoutAll,
  onCatalogChanged,
}) {
  const permissions = session.user.adminPermissions;
  const isOwner = permissions == null;
  const isDeliveryStaff = session.user.staffRole === "DELIVERY";
  const isWaiter = session.user.staffRole === "WAITER";
  const can = (key) => {
    if (isOwner) return true;
    if (isWaiter && ["tables", "orders"].includes(key)) return true;
    const list = Array.isArray(permissions) ? permissions : [];
    const catalogKeys = ["products", "promotions", "alterations", "categories"];
    if (key === "catalog")
      return (
        list.includes("catalog") ||
        catalogKeys.some((item) => list.includes(item))
      );
    if (catalogKeys.includes(key) && list.includes("catalog")) return true;
    return list.includes(key);
  };
  const availableTabs = TABS.filter(([, , , permission]) =>
    permission === "__OWNER__" ? isOwner : can(permission),
  );
  const [tab, setTab] = useState(() => availableTabs[0]?.[0] || "overview"),
    [dashboard, setDashboard] = useState(null),
    [analytics, setAnalytics] = useState(null),
    [orders, setOrders] = useState([]),
    [products, setProducts] = useState([]),
    [sizes, setSizes] = useState([]),
    [categories, setCategories] = useState([]),
    [subcategories, setSubcategories] = useState([]),
    [modifierGroups, setModifierGroups] = useState([]),
    [areas, setAreas] = useState([]),
    [promotions, setPromotions] = useState([]),
    [customers, setCustomers] = useState([]),
    [settings, setSettings] = useState(null),
    [hours, setHours] = useState([]),
    [staff, setStaff] = useState([]),
    [customerSearch, setCustomerSearch] = useState(""),
    [loading, setLoading] = useState(true),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const messageTimer = useRef(null);
  const loadAllInProgress = useRef(false);
  const liveRefreshInProgress = useRef(false);
  const [orderSearch, setOrderSearch] = useState(""),
    [orderView, setOrderView] = useState(() =>
      isDeliveryStaff ? "READY_FOR_DELIVERY" : "OPEN",
    ),
    [overviewView, setOverviewView] = useState(() =>
      isDeliveryStaff ? "READY_FOR_DELIVERY" : "OPEN",
    ),
    [selectedOrder, setSelectedOrder] = useState(null),
    [selectedCustomerId, setSelectedCustomerId] = useState(null),
    [productEditor, setProductEditor] = useState(null),
    [productForm, setProductForm] = useState(EMPTY_PRODUCT),
    [imageUploading, setImageUploading] = useState(false),
    [showArchived, setShowArchived] = useState(false),
    [statusSaving, setStatusSaving] = useState(false),
    [statusSavingId, setStatusSavingId] = useState(null),
    [cancelTarget, setCancelTarget] = useState(null),
    [catalogSection, setCatalogSection] = useState("products"),
    [adminDark, setAdminDark] = useState(() => {
      try {
        return localStorage.getItem("master-pizza-admin-theme") === "dark";
      } catch {
        return false;
      }
    });
  const [categoryForm, setCategoryForm] = useState({
      name: "",
      slug: "",
      sortOrder: 0,
    }),
    [sizeForm, setSizeForm] = useState({
      name: "",
      slug: "",
      diameterCm: "",
      sortOrder: 0,
    }),
    [subForm, setSubForm] = useState({
      categoryId: "",
      name: "",
      slug: "",
      sortOrder: 0,
    }),
    [modifierGroupForm, setModifierGroupForm] = useState({
      name: "",
      description: "",
      required: false,
      minSelect: 0,
      maxSelect: 1,
      sortOrder: 0,
    }),
    [modifierOptionForms, setModifierOptionForms] = useState({}),
    [areaForm, setAreaForm] = useState({
      city: "",
      neighborhood: "",
      fee: 4,
      distanceKm: "",
      minimumOrder: 0,
      freeDeliveryThreshold: "",
      sortOrder: 0,
    }),
    [promotionForm, setPromotionForm] = useState({
      productId: "",
      title: "",
      subtitle: "",
      image: "",
      originalPrice: "",
      promoPrice: "",
      sizePrices: {},
      sortOrder: 0,
      active: true,
      startAt: "",
      endAt: "",
    }),
    [staffForm, setStaffForm] = useState({
      name: "",
      email: "",
      phone: "",
      password: "",
      staffRole: "STAFF",
      permissions: ["overview", "orders"],
    });
  const headers = authHeaders(session.token);
  useEffect(() => {
    if (!availableTabs.some(([id]) => id === tab))
      setTab(availableTabs[0]?.[0] || "overview");
  }, [permissions]);
  useEffect(() => {
    try {
      localStorage.setItem(
        "master-pizza-admin-theme",
        adminDark ? "dark" : "light",
      );
    } catch {}
  }, [adminDark]);
  useEffect(() => {
    const allowed = [
      "products",
      "promotions",
      "alterations",
      "categories",
    ].filter(can);
    if (can("products")) allowed.push("sizes", "print");
    if (tab === "catalog" && !allowed.includes(catalogSection))
      setCatalogSection(allowed[0] || "products");
  }, [tab, permissions, catalogSection]);

  async function loadAll() {
    if (loadAllInProgress.current) return;
    loadAllInProgress.current = true;
    setLoading(true);
    setError("");
    try {
      // A consulta leve de configurações também funciona como verificação de
      // disponibilidade. Se o banco estiver fora, interrompe o restante para
      // não repetir a mesma tentativa em todas as áreas do painel.
      const settingsResponse = await api.get("/admin/settings", headers);
      const data = { settings: settingsResponse.data };
      const failures = [];
      const jobs = {};
      if (can("overview"))
        jobs.dashboard = () => api.get("/admin/dashboard", headers);
      if (can("analytics"))
        jobs.analytics = () => api.get("/admin/team-analytics", headers);
      if (can("overview") || can("orders"))
        jobs.orders = () => api.get("/admin/orders", headers);
      if (can("products") || can("promotions"))
        jobs.products = () => api.get(
          `/admin/products${showArchived && can("products") ? "?archived=1" : ""}`,
          headers,
        );
      if (can("products"))
        jobs.sizes = () => api.get("/admin/sizes", headers);
      if (can("categories") || can("products")) {
        jobs.categories = () => api.get("/admin/categories", headers);
        jobs.subcategories = () => api.get("/admin/subcategories", headers);
      }
      if (can("alterations") || can("products")) {
        jobs.modifiers = () => api.get("/admin/modifier-groups", headers);
      }
      if (can("delivery"))
        jobs.areas = () => api.get("/admin/delivery-areas", headers);
      if (can("promotions"))
        jobs.promotions = () => api.get("/admin/promotions", headers);
      if (can("customers"))
        jobs.customers = () => api.get("/admin/customers", headers);
      if (can("settings") || can("operations"))
        jobs.hours = () => api.get("/admin/store-hours", headers);
      if (isOwner) jobs.staff = () => api.get("/admin/staff", headers);
      const entries = Object.entries(jobs);
      const results = await settleWithConcurrency(entries, 1);
      results.forEach((result, index) => {
        const key = entries[index][0];
        if (result.status === "fulfilled") data[key] = result.value.data;
        else failures.push({ key, error: result.reason });
      });
      if (failures.length) {
        const first = failures[0]?.error;
        const names = failures.map((item) => item.key).join(", ");
        setError(
          `${first?.response?.data?.message || "Uma parte do painel não respondeu."} Área(s): ${names}. As demais áreas continuam disponíveis.`,
        );
      }
      if (data.dashboard) setDashboard(data.dashboard);
      if (data.analytics) setAnalytics(data.analytics);
      if (data.orders) setOrders(data.orders);
      if (data.products) {
        setProducts(data.products);
        if (!promotionForm.productId && data.products[0])
          setPromotionForm((x) => ({
            ...x,
            productId: data.products[0].id,
            originalPrice: data.products[0].price,
          }));
      }
      if (data.sizes) setSizes(data.sizes);
      if (data.categories) {
        setCategories(data.categories);
        if (!subForm.categoryId && data.categories[0])
          setSubForm((x) => ({ ...x, categoryId: data.categories[0].id }));
      }
      if (data.subcategories) setSubcategories(data.subcategories);
      if (data.modifiers) setModifierGroups(data.modifiers);
      if (data.areas) setAreas(data.areas);
      if (data.promotions) setPromotions(data.promotions);
      if (data.customers) setCustomers(data.customers);
      if (data.settings) setSettings(data.settings);
      if (data.hours) setHours(data.hours);
      if (data.staff) setStaff(data.staff);
    } catch (err) {
      fail(err, "Não foi possível carregar as áreas permitidas do painel.");
    } finally {
      loadAllInProgress.current = false;
      setLoading(false);
    }
  }
  useEffect(() => {
    loadAll();
  }, [showArchived]);
  useEffect(
    () => () => {
      window.clearTimeout(messageTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (!["overview", "orders", "analytics"].includes(tab))
      return undefined;
    const timer = window.setInterval(
      async () => {
        if (liveRefreshInProgress.current) return;
        liveRefreshInProgress.current = true;
        try {
          if (tab === "overview" && can("overview")) {
            const d = await api.get(
              "/admin/dashboard",
              authHeaders(session.token),
            );
            const o = await api.get(
              "/admin/orders",
              authHeaders(session.token),
            );
            setDashboard(d.data);
            setOrders(o.data);
          } else if (tab === "orders" && can("orders")) {
            const { data } = await api.get(
              "/admin/orders",
              authHeaders(session.token),
            );
            setOrders(data);
          } else if (tab === "analytics" && can("analytics")) {
            const { data } = await api.get(
              "/admin/team-analytics",
              authHeaders(session.token),
            );
            setAnalytics(data);
          }
        } catch {
        } finally {
          liveRefreshInProgress.current = false;
        }
      },
      isDeliveryStaff ? 5000 : 20000,
    );
    return () => window.clearInterval(timer);
  }, [
    tab,
    session.token,
    permissions,
    isDeliveryStaff,
  ]);

  function notify(text) {
    setMessage(text);
    window.clearTimeout(messageTimer.current);
    messageTimer.current = window.setTimeout(() => setMessage(""), 2800);
  }
  function fail(err, fallback) {
    setError(err.response?.data?.message || fallback);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  const orderBuckets = useMemo(
    () =>
      buildOrderBuckets(orders, {
        includeDineIn: isWaiter,
        deliveryOnly: isDeliveryStaff,
      }),
    [orders, isDeliveryStaff, isWaiter],
  );
  const overviewBuckets = useMemo(
    () =>
      buildOrderBuckets(orders, {
        includeDineIn: !isDeliveryStaff,
        deliveryOnly: isDeliveryStaff,
      }),
    [orders, isDeliveryStaff],
  );
  useEffect(() => {
    if (
      isDeliveryStaff &&
      !["READY_FOR_DELIVERY", "OUT_FOR_DELIVERY", "DELIVERED"].includes(
        orderView,
      )
    )
      setOrderView("READY_FOR_DELIVERY");
    if (
      isDeliveryStaff &&
      !["READY_FOR_DELIVERY", "OUT_FOR_DELIVERY", "DELIVERED"].includes(
        overviewView,
      )
    )
      setOverviewView("READY_FOR_DELIVERY");
  }, [isDeliveryStaff, orderView, overviewView]);
  const currentBucket = orderBuckets[orderView] || [];
  const filteredOrders = useMemo(
    () =>
      currentBucket.filter((o) => {
        const text =
          `${o.shortCode} ${o.customerName} ${o.customerPhone} ${o.neighborhood || ""} ${o.city || ""}`.toLowerCase();
        return (
          !orderSearch.trim() || text.includes(orderSearch.trim().toLowerCase())
        );
      }),
    [currentBucket, orderSearch],
  );
  const overviewOrders = overviewBuckets[overviewView] || [];
  const filteredCustomers = useMemo(
    () =>
      customers.filter((c) => {
        const text = `${c.name} ${c.email} ${c.phone || ""}`.toLowerCase();
        return (
          !customerSearch.trim() ||
          text.includes(customerSearch.trim().toLowerCase())
        );
      }),
    [customers, customerSearch],
  );

  async function changeStatus(id, status, cancelReason = "") {
    if (statusSavingId === id) return;
    setStatusSavingId(id);
    try {
      const order = orders.find((item) => item.id === id);
      let data;
      if (order?.fulfillmentType === "DINE_IN") {
        if (["PREPARING", "READY_FOR_TABLE"].includes(status)) {
          ({ data } = await api.patch(
            `/admin/kitchen/orders/${id}/advance`,
            {},
            headers,
          ));
        } else if (status === "SERVED") {
          ({ data } = await api.post(
            `/admin/table-orders/${id}/served`,
            {},
            headers,
          ));
        } else if (status === "CANCELED") {
          ({ data } = await api.post(
            `/admin/table-orders/${id}/cancel`,
            { reason: cancelReason },
            headers,
          ));
        } else {
          throw new Error("Etapa inválida para este pedido presencial.");
        }
      } else {
        ({ data } = await api.patch(
          `/admin/orders/${id}/status`,
          { status, cancelReason },
          headers,
        ));
      }
      setOrders((list) => list.map((o) => (o.id === id ? data : o)));
      if (selectedOrder?.id === id) setSelectedOrder(data);
      notify(
        data.idempotent
          ? "Pedido já estava atualizado."
          : status === "OUT_FOR_DELIVERY" && isDeliveryStaff
            ? "Entrega aceita. Agora ela é exclusiva para você."
            : "Status atualizado.",
      );
      if (can("analytics")) {
        api
          .get("/admin/team-analytics", headers)
          .then(({ data: next }) => setAnalytics(next))
          .catch(() => {});
      }
    } catch (err) {
      if (
        isDeliveryStaff &&
        err.response?.data?.code === "DELIVERY_ALREADY_CLAIMED"
      ) {
        setSelectedOrder(null);
        try {
          const fresh = await api.get("/admin/orders", headers);
          setOrders(fresh.data);
        } catch {}
        fail(err, "Esta entrega já foi aceita por outro entregador.");
      } else fail(err, "Não foi possível atualizar o pedido.");
    } finally {
      setStatusSavingId(null);
    }
  }
  async function openOrder(order) {
    setSelectedOrder(order);
    try {
      const { data } = await api.get(`/admin/orders/${order.id}`, headers);
      setSelectedOrder(data);
    } catch {}
  }
  async function reorderRows(
    endpoint,
    rows,
    row,
    direction,
    scope = () => true,
  ) {
    const ordered = rows
      .filter(scope)
      .slice()
      .sort(
        (a, b) =>
          Number(a.sortOrder || 0) - Number(b.sortOrder || 0) ||
          String(a.name || a.title || "").localeCompare(
            String(b.name || b.title || ""),
            "pt-BR",
          ),
      );
    const index = ordered.findIndex((item) => item.id === row.id),
      target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    const moved = ordered.splice(index, 1)[0];
    ordered.splice(target, 0, moved);
    try {
      await Promise.all(
        ordered.map((item, i) =>
          Number(item.sortOrder) !== i + 1
            ? api.patch(
                `/admin/${endpoint}/${item.id}`,
                { sortOrder: i + 1 },
                headers,
              )
            : Promise.resolve(),
        ),
      );
      await loadAll();
      await onCatalogChanged?.();
    } catch (err) {
      fail(err, "Não foi possível reorganizar a prioridade.");
    }
  }

  function openNewProduct() {
    setProductEditor("new");
    setProductForm({
      ...EMPTY_PRODUCT,
      categoryId: categories[0]?.id || "",
      sortOrder: products.length + 1,
    });
  }
  function openEditProduct(p) {
    setProductEditor(p.id);
    setProductForm({
      name: p.name,
      slug: p.slug,
      description: p.description,
      price: p.basePrice ?? p.price,
      categoryId: p.categoryId,
      subcategoryId: p.subcategoryId || "",
      image: p.image || "",
      badge: p.badge || "",
      featured: Boolean(p.featured),
      available: Boolean(p.available),
      sortOrder: p.sortOrder || 0,
      allowFlavorSplit: Boolean(p.allowFlavorSplit),
      isFlavorOption: Boolean(p.isFlavorOption),
      maxFlavors: Number(p.maxFlavors || 1),
      flavorPricingMode: p.flavorPricingMode || "MAX",
      flavorIds: [],
      modifierGroupIds: p.modifierGroupIds || [],
      sizePrices: (p.availableSizes || []).map((size) => ({
        sizeId: size.id,
        price: Number(size.price),
        sortOrder: Number(size.sortOrder || 0),
      })),
      stockTracked: Boolean(p.stockTracked),
      stockQuantity: Number(p.stockQuantity || 0),
      stockLowThreshold: Number(p.stockLowThreshold || 5),
      costPrice: Number(p.costPrice || 0),
      pausedUntil: p.pausedUntil ? String(p.pausedUntil).slice(0, 16) : "",
      availableStartTime: p.availableStartTime || "",
      availableEndTime: p.availableEndTime || "",
      removableIngredients: Array.isArray(p.removableIngredients)
        ? p.removableIngredients.join(", ")
        : "",
    });
  }
  async function uploadImage(file) {
    return requestCrop(
      file,
      (url) => setProductForm((x) => ({ ...x, image: url })),
      "Foto do produto",
      4 / 3,
    );
  }
  async function saveProduct(e) {
    e.preventDefault();
    try {
      const payload = {
        ...productForm,
        price: Number(productForm.price),
        sortOrder: Number(productForm.sortOrder || 0),
        maxFlavors: Number(productForm.maxFlavors || 1),
        stockQuantity: Number(productForm.stockQuantity || 0),
        stockLowThreshold: Number(productForm.stockLowThreshold || 0),
        costPrice: Number(productForm.costPrice || 0),
        pausedUntil: productForm.pausedUntil
          ? new Date(productForm.pausedUntil).toISOString()
          : null,
        removableIngredients: String(productForm.removableIngredients || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
      };
      if (productEditor === "new")
        await api.post("/admin/products", payload, headers);
      else
        await api.patch(`/admin/products/${productEditor}`, payload, headers);
      setProductEditor(null);
      notify(
        productEditor === "new" ? "Produto criado." : "Produto atualizado.",
      );
      await loadAll();
      await onCatalogChanged?.();
    } catch (err) {
      fail(err, "Não foi possível salvar o produto.");
    }
  }
  async function toggleProduct(p) {
    try {
      const { data } = await api.patch(
        `/admin/products/${p.id}`,
        { available: !p.available },
        headers,
      );
      setProducts((list) => list.map((x) => (x.id === p.id ? data : x)));
      await onCatalogChanged?.();
    } catch (err) {
      fail(err, "Não foi possível alterar o produto.");
    }
  }
  async function priorityProduct(p, delta) {
    const ordered = products
      .filter((x) => !x.deletedAt)
      .slice()
      .sort(
        (a, b) =>
          Number(a.sortOrder || 0) - Number(b.sortOrder || 0) ||
          new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
      );
    const index = ordered.findIndex((item) => item.id === p.id),
      target = index + delta;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    const moved = ordered.splice(index, 1)[0];
    ordered.splice(target, 0, moved);
    const normalized = ordered.map((item, i) => ({
      ...item,
      sortOrder: i + 1,
    }));
    setProducts((current) => {
      const map = new Map(normalized.map((item) => [item.id, item.sortOrder]));
      return current
        .map((item) =>
          map.has(item.id) ? { ...item, sortOrder: map.get(item.id) } : item,
        )
        .sort(
          (a, b) => Number(a.sortOrder || 9999) - Number(b.sortOrder || 9999),
        );
    });
    try {
      await api.post(
        "/admin/products/reorder",
        { orderedIds: normalized.map((item) => item.id) },
        headers,
      );
      await onCatalogChanged?.();
    } catch (err) {
      await loadAll();
      fail(err, "Não foi possível reorganizar a prioridade dos produtos.");
    }
  }
  async function archiveProduct() {
    if (productEditor === "new") return;
    const p = products.find((x) => x.id === productEditor);
    if (!window.confirm(`Arquivar “${p?.name}” do catálogo?`)) return;
    if (
      !window.confirm("Confirme novamente. Pedidos antigos serão preservados.")
    )
      return;
    try {
      await api.delete(`/admin/products/${productEditor}`, headers);
      setProductEditor(null);
      notify("Produto arquivado.");
      await loadAll();
      await onCatalogChanged?.();
    } catch (err) {
      fail(err, "Não foi possível arquivar o produto.");
    }
  }
  async function restoreProduct(p) {
    try {
      await api.post(`/admin/products/${p.id}/restore`, {}, headers);
      notify("Produto restaurado.");
      await loadAll();
      await onCatalogChanged?.();
    } catch (err) {
      fail(err, "Não foi possível restaurar o produto.");
    }
  }
  async function createSize(e) {
    e.preventDefault();
    try {
      await api.post(
        "/admin/sizes",
        {
          ...sizeForm,
          diameterCm:
            sizeForm.diameterCm === "" ? null : Number(sizeForm.diameterCm),
          sortOrder: Number(sizeForm.sortOrder || sizes.length + 1),
        },
        headers,
      );
      setSizeForm({
        name: "",
        slug: "",
        diameterCm: "",
        sortOrder: sizes.length + 1,
      });
      notify("Tamanho criado.");
      await loadAll();
      await onCatalogChanged?.();
    } catch (err) {
      fail(err, "Não foi possível criar o tamanho.");
    }
  }
  async function updateSize(row, patch) {
    try {
      await api.patch(`/admin/sizes/${row.id}`, patch, headers);
      await loadAll();
      await onCatalogChanged?.();
    } catch (err) {
      fail(err, "Não foi possível atualizar o tamanho.");
    }
  }
  async function removeSize(row) {
    if (!window.confirm(`Remover ou pausar o tamanho “${row.name}”?`)) return;
    try {
      await api.delete(`/admin/sizes/${row.id}`, headers);
      notify("Tamanho atualizado.");
      await loadAll();
      await onCatalogChanged?.();
    } catch (err) {
      fail(err, "Não foi possível remover o tamanho.");
    }
  }

  async function createCategory(e) {
    e.preventDefault();
    try {
      await api.post(
        "/admin/categories",
        {
          ...categoryForm,
          sortOrder: Number(categoryForm.sortOrder || categories.length + 1),
        },
        headers,
      );
      setCategoryForm({ name: "", slug: "", sortOrder: categories.length + 1 });
      notify("Categoria adicionada.");
      await loadAll();
      await onCatalogChanged?.();
    } catch (err) {
      fail(err, "Não foi possível adicionar a categoria.");
    }
  }
  async function updateCategory(row, patch) {
    try {
      await api.patch(`/admin/categories/${row.id}`, patch, headers);
      await loadAll();
      await onCatalogChanged?.();
    } catch (err) {
      fail(err, "Não foi possível atualizar a categoria.");
    }
  }
  async function removeCategory(row) {
    if (!window.confirm(`Remover “${row.name}”?`)) return;
    try {
      await api.delete(`/admin/categories/${row.id}`, headers);
      notify("Categoria atualizada.");
      await loadAll();
      await onCatalogChanged?.();
    } catch (err) {
      fail(err, "Não foi possível remover a categoria.");
    }
  }

  async function createSub(e) {
    e.preventDefault();
    try {
      await api.post(
        "/admin/subcategories",
        {
          ...subForm,
          sortOrder: Number(
            subForm.sortOrder ||
              subcategories.filter((x) => x.categoryId === subForm.categoryId)
                .length + 1,
          ),
        },
        headers,
      );
      setSubForm({
        categoryId: categories[0]?.id || "",
        name: "",
        slug: "",
        sortOrder: subcategories.length + 1,
      });
      notify("Subcategoria adicionada.");
      await loadAll();
      await onCatalogChanged?.();
    } catch (err) {
      fail(err, "Não foi possível adicionar a subcategoria.");
    }
  }
  async function updateSub(row, patch) {
    try {
      await api.patch(`/admin/subcategories/${row.id}`, patch, headers);
      await loadAll();
      await onCatalogChanged?.();
    } catch (err) {
      fail(err, "Não foi possível atualizar a subcategoria.");
    }
  }
  async function removeSub(row) {
    if (!window.confirm(`Remover “${row.name}”?`)) return;
    try {
      await api.delete(`/admin/subcategories/${row.id}`, headers);
      notify("Subcategoria atualizada.");
      await loadAll();
      await onCatalogChanged?.();
    } catch (err) {
      fail(err, "Não foi possível remover a subcategoria.");
    }
  }

  async function createPromotion(e) {
    e.preventDefault();
    try {
      await api.post(
        "/admin/promotions",
        {
          ...promotionForm,
          startAt: toIsoDateTime(promotionForm.startAt),
          endAt: toIsoDateTime(promotionForm.endAt),
          originalPrice: Number(promotionForm.originalPrice),
          promoPrice: Number(promotionForm.promoPrice),
          sortOrder: Number(promotionForm.sortOrder || promotions.length + 1),
        },
        headers,
      );
      setPromotionForm({
        productId: products[0]?.id || "",
        title: "",
        subtitle: "",
        image: "",
        originalPrice: products[0]?.price || "",
        promoPrice: "",
        sizePrices: {},
        sortOrder: promotions.length + 1,
        active: true,
        startAt: "",
        endAt: "",
      });
      notify("Promoção adicionada.");
      await loadAll();
      await onCatalogChanged?.();
    } catch (err) {
      fail(err, "Não foi possível criar a promoção.");
    }
  }
  async function updatePromotion(row, patch) {
    try {
      await api.patch(`/admin/promotions/${row.id}`, patch, headers);
      notify("Promoção atualizada.");
      await loadAll();
      await onCatalogChanged?.();
    } catch (err) {
      fail(err, "Não foi possível atualizar a promoção.");
    }
  }
  async function removePromotion(row) {
    if (!window.confirm(`Remover a promoção “${row.title}”?`)) return;
    try {
      await api.delete(`/admin/promotions/${row.id}`, headers);
      notify("Promoção removida.");
      await loadAll();
      await onCatalogChanged?.();
    } catch (err) {
      fail(err, "Não foi possível remover a promoção.");
    }
  }
  async function updateModifierOptionPromotion(row, patch) {
    try {
      await api.patch(`/admin/modifier-options/${row.id}`, patch, headers);
      notify("Promoção do adicional atualizada.");
      await loadAll();
      await onCatalogChanged?.();
    } catch (err) {
      fail(err, "Não foi possível atualizar a promoção do adicional.");
    }
  }
  async function uploadMedia(file, onDone) {
    if (!file) return;
    if (file.size > 1_800_000)
      return setError("A imagem deve ter no máximo 1,8 MB.");
    const form = new FormData();
    form.append("image", file);
    setImageUploading(true);
    try {
      const { data } = await api.post("/admin/media", form, {
        headers: {
          Authorization: `Bearer ${session.token}`,
          "Content-Type": "multipart/form-data",
        },
      });
      onDone(data.url);
      notify("Imagem enviada.");
    } catch (err) {
      fail(err, "Não foi possível enviar a imagem.");
    } finally {
      setImageUploading(false);
    }
  }
  async function requestCrop(file, onDone, label = "Imagem", aspect = 1) {
    if (!file) return;
    setError("");
    try {
      setImageUploading(true);
      const fitted = await fitImageFile(file, { aspect });
      await uploadMedia(fitted, onDone);
      notify(`${label} ajustada automaticamente.`);
    } catch (err) {
      setError(err.message || "Não foi possível ajustar a imagem.");
    } finally {
      setImageUploading(false);
    }
  }

  async function createArea(e) {
    e.preventDefault();
    try {
      await api.post(
        "/admin/delivery-areas",
        {
          ...areaForm,
          fee: Number(areaForm.fee),
          distanceKm:
            areaForm.distanceKm === "" ? null : Number(areaForm.distanceKm),
          minimumOrder: Number(areaForm.minimumOrder || 0),
          freeDeliveryThreshold:
            areaForm.freeDeliveryThreshold === ""
              ? null
              : Number(areaForm.freeDeliveryThreshold),
          sortOrder: Number(areaForm.sortOrder || 0),
        },
        headers,
      );
      setAreaForm({
        city: "",
        neighborhood: "",
        fee: 4,
        distanceKm: "",
        minimumOrder: 0,
        freeDeliveryThreshold: "",
        sortOrder: areas.length + 1,
      });
      notify("Área adicionada.");
      await loadAll();
      await onCatalogChanged?.();
    } catch (err) {
      fail(err, "Não foi possível adicionar a área.");
    }
  }
  async function updateArea(row, patch) {
    try {
      await api.patch(`/admin/delivery-areas/${row.id}`, patch, headers);
      await loadAll();
      await onCatalogChanged?.();
    } catch (err) {
      fail(err, "Não foi possível atualizar a área.");
    }
  }
  async function removeArea(row) {
    if (!window.confirm(`Remover “${row.neighborhood}”?`)) return;
    try {
      await api.delete(`/admin/delivery-areas/${row.id}`, headers);
      notify("Área removida.");
      await loadAll();
      await onCatalogChanged?.();
    } catch (err) {
      fail(err, "Não foi possível remover a área.");
    }
  }

  async function saveStoreSettings(e) {
    e.preventDefault();
    const blocked = new Set([
      "isOpen",
      "deliveryEnabled",
      "pickupEnabled",
      "schedulingEnabled",
      "deliveryPricingMode",
      "deliveryHybridEnabled",
      "deliveryPricePerKm",
      "deliveryMinimumKm",
      "deliveryMinimumFee",
      "deliveryMaxDistanceKm",
      "deliveryFee",
      "freeDeliveryThreshold",
    ]);
    const payload = Object.fromEntries(
      Object.entries(settings || {}).filter(([key]) => !blocked.has(key)),
    );
    try {
      const { data } = await api.patch("/admin/settings", payload, headers);
      setSettings((current) => ({ ...current, ...data }));
      notify("Configurações salvas.");
      await onCatalogChanged?.();
    } catch (err) {
      fail(err, "Não foi possível salvar as configurações.");
    }
  }
  async function saveDeliverySettings(e) {
    e.preventDefault();
    const fields = [
      "deliveryPricingMode",
      "deliveryHybridEnabled",
      "deliveryPricePerKm",
      "deliveryMinimumKm",
      "deliveryMinimumFee",
      "deliveryMaxDistanceKm",
      "deliveryFee",
      "freeDeliveryThreshold",
      "defaultMinimumOrder",
    ];
    const payload = Object.fromEntries(
      fields.map((key) => [key, settings?.[key]]),
    );
    try {
      const { data } = await api.patch("/admin/settings", payload, headers);
      setSettings((current) => ({ ...current, ...data }));
      notify("Regra de entrega salva.");
      await onCatalogChanged?.();
    } catch (err) {
      fail(err, "Não foi possível salvar as regras de entrega.");
    }
  }
  async function saveOperations(patch) {
    const previous = settings;
    setSettings((current) => (current ? { ...current, ...patch } : current));
    setStatusSaving(true);
    setError("");
    try {
      const { data } = await api.patch("/admin/operations", patch, headers);
      setSettings((current) => ({ ...current, ...data }));
      notify("Operação atualizada.");
      await onCatalogChanged?.();
    } catch (err) {
      setSettings(previous);
      fail(err, "Não foi possível alterar a operação da loja.");
    } finally {
      setStatusSaving(false);
    }
  }
  async function toggleStoreOpen(next) {
    await saveOperations({ isOpen: next });
  }
  function generateStaffPassword() {
    const bytes = new Uint32Array(3);
    crypto.getRandomValues(bytes);
    const password = `Mp#${bytes[0].toString(36)}${bytes[1].toString(36)}${String(bytes[2] % 1000).padStart(3, "0")}A1`;
    setStaffForm((current) => ({ ...current, password }));
  }
  async function createStaff(e) {
    e.preventDefault();
    try {
      const { data } = await api.post("/admin/staff", staffForm, headers);
      setStaff((list) => [data, ...list]);
      setStaffForm({
        name: "",
        email: "",
        phone: "",
        password: "",
        staffRole: "STAFF",
        permissions: ["overview", "orders"],
      });
      notify("Conta de funcionário criada.");
    } catch (err) {
      fail(err, "Não foi possível criar o funcionário.");
    }
  }
  async function updateStaff(row, patch) {
    try {
      const { data } = await api.patch(
        `/admin/staff/${row.id}`,
        patch,
        headers,
      );
      setStaff((list) =>
        list.map((item) => (item.id === row.id ? data : item)),
      );
      notify("Permissões atualizadas.");
    } catch (err) {
      fail(err, "Não foi possível atualizar o funcionário.");
    }
  }
  async function disableStaff(row) {
    if (!window.confirm(`Desativar o acesso de ${row.name}?`)) return;
    try {
      const { data } = await api.patch(
        `/admin/staff/${row.id}`,
        { staffActive: false },
        headers,
      );
      setStaff((list) =>
        list.map((item) => (item.id === row.id ? data : item)),
      );
      notify("Acesso do funcionário desativado.");
    } catch (err) {
      fail(err, "Não foi possível desativar o funcionário.");
    }
  }
  async function deleteStaff(row) {
    if (!window.confirm(`Excluir definitivamente a conta de ${row.name}?`))
      return;
    if (
      !window.confirm(
        "Essa ação remove o login do funcionário, mas o nome continua preservado no histórico dos pedidos já alterados. Confirmar?",
      )
    )
      return;
    try {
      await api.delete(`/admin/staff/${row.id}`, headers);
      setStaff((list) => list.filter((item) => item.id !== row.id));
      notify("Funcionário excluído.");
    } catch (err) {
      fail(err, "Não foi possível excluir o funcionário.");
    }
  }
  async function deleteCustomer(row) {
    if (
      !window.confirm(
        `Excluir a conta de ${row.name}? Isso só funciona se não houver pedidos em aberto.`,
      )
    )
      return;
    try {
      await api.delete(`/admin/customers/${row.id}`, headers);
      setCustomers((list) => list.filter((item) => item.id !== row.id));
      notify("Conta do cliente excluída. Ele poderá se cadastrar novamente.");
    } catch (err) {
      fail(err, "Não foi possível excluir o cliente.");
    }
  }
  async function saveHour(row, patch) {
    try {
      const { data } = await api.patch(
        `/admin/store-hours/${row.id}`,
        patch,
        headers,
      );
      setHours((list) => list.map((h) => (h.id === row.id ? data : h)));
      notify("Horário atualizado.");
      await onCatalogChanged?.();
    } catch (err) {
      fail(err, "Não foi possível salvar o horário.");
    }
  }
  async function lookupStoreCep() {
    const cep = String(settings.storePostalCode || "").replace(/\D/g, "");
    if (cep.length !== 8) return setError("Informe um CEP válido da loja.");
    try {
      const { data } = await api.get(`/address/cep/${cep}`);
      if (data.latitude == null || data.longitude == null) {
        setSettings((current) => ({
          ...current,
          storePostalCode: data.postalCode || cep,
        }));
        return setError(
          "O CEP foi localizado, mas o serviço não retornou coordenadas. Informe latitude/longitude manualmente ou tente outro CEP da unidade.",
        );
      }
      const payload = {
        storePostalCode: data.postalCode || cep,
        storeLatitude: data.latitude,
        storeLongitude: data.longitude,
        storeGeoSource: "cep",
      };
      const saved = await api.patch("/admin/settings", payload, headers);
      setSettings((current) => ({ ...current, ...saved.data }));
      notify(
        "CEP e localização da loja salvos. O frete por distância já pode usar esta origem.",
      );
      await onCatalogChanged?.();
    } catch (err) {
      fail(err, "Não foi possível consultar o CEP da loja.");
    }
  }

  if (loading && !settings)
    return (
      <div className="admin-loading">Carregando painel da Master Pizzaria...</div>
    );
  const currentTabLabel =
    availableTabs.find(([id]) => id === tab)?.[2] || "Painel";
  const scheduledCount =
    dashboard?.scheduledOrders ?? overviewBuckets.SCHEDULED.length;
  return (
    <div className={`admin-shell ${adminDark ? "admin-dark" : ""}`}>
      <aside className="admin-sidebar">
        <Link className="admin-logo" to="/">
          <img
            src={
              mediaUrl(settings?.logoImage) || "/images/master-pizzaria-logo.png"
            }
            alt="Master Pizzaria"
          />
        </Link>
        <nav>
          {availableTabs.map(([id, Icon, label]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => {
                setTab(id);
                if ((id === "orders" || id === "overview") && !isDeliveryStaff)
                  setOrderView("OPEN");
                if ((id === "orders" || id === "overview") && isDeliveryStaff) {
                  setOrderView("READY_FOR_DELIVERY");
                  setOverviewView("READY_FOR_DELIVERY");
                }
              }}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="admin-sidebar-bottom">
          <div className="admin-user-mini">
            <UserRound />
            <span>
              <small>Conectado como</small>
              <b>{session.user.name}</b>
              {!isOwner && <em>Funcionário</em>}
            </span>
            <button
              type="button"
              className="admin-theme-toggle"
              onClick={() => setAdminDark((value) => !value)}
              title={adminDark ? "Usar modo claro" : "Usar modo escuro"}
              aria-label={adminDark ? "Usar modo claro" : "Usar modo escuro"}
            >
              {adminDark ? <Moon size={18} /> : <Sun size={18} />}
            </button>
          </div>
          <button className="admin-logout" onClick={() => onLogout()}>
            <LogOut size={18} /> Sair do painel
          </button>
          <button
            className="admin-logout admin-logout-all"
            onClick={() => onLogoutAll?.()}
          >
            <ShieldCheck size={18} /> Sair de todos
          </button>
          <Link to="/">
            <ArrowLeft size={16} /> Ver loja
          </Link>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-header">
          <div>
            <span className="eyebrow dark">Painel administrativo</span>
            <h1>{currentTabLabel}</h1>
          </div>
          <button className="outline-btn" onClick={loadAll}>
            <RefreshCw size={16} /> Atualizar
          </button>
        </header>
        {error && (
          <div className="admin-alert error">
            <b>{error}</b>
            <button onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {message && (
          <div className="admin-alert success">
            <Check size={16} />
            <b>{message}</b>
          </div>
        )}

        {tab === "overview" && can("overview") && (
          <>
            <section className="admin-stats admin-stats-five">
              <Stat label="Pedidos hoje" value={dashboard?.todayOrders || 0} />
              <Stat label="Em andamento" value={dashboard?.openOrders || 0} />
              <Stat label="Agendados" value={scheduledCount} />
              <Stat
                label="Em alerta de prazo"
                value={dashboard?.warningOrders || 0}
              />
              <Stat
                label="Prazo atrasado"
                value={dashboard?.overdueOrders || 0}
              />
            </section>
            <section className="admin-panel">
              <div className="panel-title">
                <div>
                  <span>
                    {overviewView === "SCHEDULED" ? "Agenda" : "Operação agora"}
                  </span>
                  <h2>{ORDER_VIEW_LABELS[overviewView] || "Pedidos"}</h2>
                  <p>
                    {overviewView === "OPEN"
                      ? "Todos os pedidos que ainda precisam de atendimento."
                      : overviewView === "RECEIVED"
                        ? "Pedidos recém-chegados esperando aceite da equipe."
                        : overviewView === "PREPARING"
                          ? "Pedidos já aceitos e em produção."
                          : overviewView === "READY_FOR_TABLE"
                           ? "Pedidos do salão concluídos pela cozinha e aguardando o garçom."
                            : overviewView === "SERVED"
                              ? "Mesas já servidas que aguardam conferência, pagamento e liberação."
                            : "Visualização separada para facilitar o trabalho da equipe."}
                  </p>
                </div>
                <div className="panel-actions">
                  <OverviewOrderTabs
                    value={overviewView}
                    onChange={setOverviewView}
                    buckets={overviewBuckets}
                    deliveryOnly={isDeliveryStaff}
                  />
                  {can("orders") && (
                    <button
                      className="text-refresh"
                      onClick={() => setTab("orders")}
                    >
                      Ver todos <ChevronRight size={16} />
                    </button>
                  )}
                </div>
              </div>
              <OrderList
                orders={overviewOrders.slice(0, 8)}
                onStatus={changeStatus}
                onCancel={setCancelTarget}
                onOpen={openOrder}
                lateWarningMinutes={settings?.lateWarningMinutes || 30}
                deliveryOnly={isDeliveryStaff}
                savingId={statusSavingId}
              />
            </section>
          </>
        )}

        {tab === "analytics" && can("analytics") && (
          <TeamAnalytics data={analytics} />
        )}

        {tab === "orders" && can("orders") && (
          <section className="admin-panel">
            <div className="panel-title">
              <div>
                <span>Gestão de pedidos</span>
                <h2>{ORDER_VIEW_LABELS[orderView] || "Pedidos recentes"}</h2>
                <p>
                  {orderView === "OPEN"
                    ? "Use os filtros rápidos para separar entrega, concluídos, cancelados e agendamentos."
                    : "Esta fila está separada da operação principal."}
                </p>
              </div>
              <div className="panel-actions">
                <OrderViewTabs
                  value={orderView}
                  onChange={setOrderView}
                  buckets={orderBuckets}
                  deliveryOnly={isDeliveryStaff}
                />
                <b>{filteredOrders.length} exibidos</b>
              </div>
            </div>
            <div className="admin-filters">
              <label>
                <Search size={16} />
                <input
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  placeholder="Buscar cliente, telefone, bairro, cidade ou código"
                />
              </label>
            </div>
            <p className="admin-help-line">
              <Eye size={16} /> Clique em um pedido para ver endereço completo,
              itens, sabores, pagamento, previsão e histórico.
            </p>
            <OrderList
              orders={filteredOrders}
              onStatus={changeStatus}
              onCancel={setCancelTarget}
              onOpen={openOrder}
              lateWarningMinutes={settings?.lateWarningMinutes || 30}
              deliveryOnly={isDeliveryStaff}
              savingId={statusSavingId}
            />
          </section>
        )}

        {tab === "kitchen" && can("kitchen") && (
          <KitchenAdmin
            session={session}
            settings={settings}
            notify={notify}
            fail={fail}
          />
        )}
        {tab === "tables" && can("tables") && (
          <TablesAdmin
            session={session}
            settings={settings}
            notify={notify}
            fail={fail}
          />
        )}
        {tab === "operations" && can("operations") && (
          <OperationsAdmin
            settings={settings}
            saveOperations={saveOperations}
            statusSaving={statusSaving}
            hours={hours}
            setHours={setHours}
            saveHour={saveHour}
          />
        )}
        {tab === "catalog" && can("catalog") && (
          <div className="catalog-admin-page">
            <div className="catalog-section-nav">
              {can("products") && (
                <button
                  type="button"
                  className={catalogSection === "products" ? "active" : ""}
                  onClick={() => setCatalogSection("products")}
                >
                  <Pizza size={16} /> Produtos
                </button>
              )}
              {can("products") && (
                <button
                  type="button"
                  className={catalogSection === "sizes" ? "active" : ""}
                  onClick={() => setCatalogSection("sizes")}
                >
                  <Layers3 size={16} /> Tamanhos
                </button>
              )}
              {can("products") && (
                <button
                  type="button"
                  className={catalogSection === "print" ? "active" : ""}
                  onClick={() => setCatalogSection("print")}
                >
                  <Printer size={16} /> Impressão
                </button>
              )}
              {can("promotions") && (
                <button
                  type="button"
                  className={catalogSection === "promotions" ? "active" : ""}
                  onClick={() => setCatalogSection("promotions")}
                >
                  <Megaphone size={16} /> Promoções
                </button>
              )}
              {can("alterations") && (
                <button
                  type="button"
                  className={catalogSection === "alterations" ? "active" : ""}
                  onClick={() => setCatalogSection("alterations")}
                >
                  <UtensilsCrossed size={16} /> Adicionais
                </button>
              )}
              {can("categories") && (
                <button
                  type="button"
                  className={catalogSection === "categories" ? "active" : ""}
                  onClick={() => setCatalogSection("categories")}
                >
                  <Tags size={16} /> Categorias
                </button>
              )}
            </div>
            {catalogSection === "products" && can("products") && (
              <section className="admin-panel">
                <div className="panel-title">
                  <div>
                    <span>Cardápio</span>
                    <h2>Produtos e prioridade</h2>
                    <p>
                      Cadastre os itens, configure sabores, tamanhos, estoque e
                      ordem de exibição.
                    </p>
                  </div>
                  <div className="panel-actions">
                    <label className="compact-check">
                      <input
                        type="checkbox"
                        checked={showArchived}
                        onChange={(e) => setShowArchived(e.target.checked)}
                      />{" "}
                      Mostrar arquivados
                    </label>
                    <button className="primary-btn" onClick={openNewProduct}>
                      <Plus size={16} /> Novo produto
                    </button>
                  </div>
                </div>
                <div className="admin-product-table">
                  {products.map((p) => (
                    <article
                      key={p.id}
                      className={p.deletedAt ? "archived" : ""}
                    >
                      <img src={mediaUrl(p.image)} alt="" />
                      <div className="product-admin-main">
                        <b>{p.name}</b>
                        <small>
                          {p.category?.name}
                          {p.subcategory?.name
                            ? ` • ${p.subcategory.name}`
                            : ""}{" "}
                          • {money(p.price)}
                        </small>
                        {(p.allowFlavorSplit ||
                          p.availableSizes?.length > 0) && (
                          <em>
                            <Layers3 size={13} />
                            Personalização configurada
                          </em>
                        )}
                        {p.isFlavorOption && (
                          <em>
                            <Pizza size={13} />
                            Disponível como sabor
                          </em>
                        )}
                      </div>
                      <div className="priority-controls">
                        <small>Prioridade {p.sortOrder}</small>
                        <span>
                          <button onClick={() => priorityProduct(p, -1)}>
                            <ArrowUp size={15} />
                          </button>
                          <button onClick={() => priorityProduct(p, 1)}>
                            <ArrowDown size={15} />
                          </button>
                        </span>
                      </div>
                      {p.deletedAt ? (
                        <span className="availability off">Arquivado</span>
                      ) : (
                        <button
                          className={
                            p.available
                              ? "availability-button on"
                              : "availability-button off"
                          }
                          onClick={() => toggleProduct(p)}
                        >
                          {p.available ? "Ativo • pausar" : "Pausado • ativar"}
                        </button>
                      )}
                      <div className="row-actions">
                        <button
                          className="icon-action"
                          onClick={() => openEditProduct(p)}
                        >
                          <Pencil size={17} /> Editar
                        </button>
                        {p.deletedAt && (
                          <button
                            className="icon-action"
                            onClick={() => restoreProduct(p)}
                          >
                            Restaurar
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
            {catalogSection === "sizes" && can("products") && (
              <SizesAdmin
                rows={sizes}
                form={sizeForm}
                setForm={setSizeForm}
                create={createSize}
                update={updateSize}
                remove={removeSize}
                reorder={(row, d) => reorderRows("sizes", sizes, row, d)}
              />
            )}{" "}
            {catalogSection === "print" && can("products") && (
              <MenuPrintStudio
                products={products}
                categories={categories}
                subcategories={subcategories}
                settings={settings}
                notify={notify}
                onDigitalMenuChange={async (enabled) => {
                  const { data } = await api.patch(
                    "/admin/settings",
                    { digitalMenuEnabled: enabled },
                    headers,
                  );
                  setSettings((current) => ({ ...current, ...data }));
                  await onCatalogChanged?.();
                }}
              />
            )}{" "}
            {catalogSection === "promotions" && can("promotions") && (
              <PromotionsAdmin
                rows={promotions}
                products={products.filter((p) => !p.deletedAt)}
                modifierGroups={modifierGroups}
                form={promotionForm}
                setForm={setPromotionForm}
                create={createPromotion}
                update={updatePromotion}
                remove={removePromotion}
                updateModifierOption={updateModifierOptionPromotion}
                uploadMedia={(file, onDone) =>
                  requestCrop(file, onDone, "Imagem da promoção", 16 / 9)
                }
                imageUploading={imageUploading}
                reorder={(row, d) =>
                  reorderRows("promotions", promotions, row, d)
                }
              />
            )}{" "}
            {catalogSection === "alterations" && can("alterations") && (
              <AlterationsAdmin
                modifierGroups={modifierGroups}
                modifierGroupForm={modifierGroupForm}
                setModifierGroupForm={setModifierGroupForm}
                modifierOptionForms={modifierOptionForms}
                setModifierOptionForms={setModifierOptionForms}
                headers={headers}
                notify={notify}
                fail={fail}
                reload={loadAll}
                onCatalogChanged={onCatalogChanged}
                requestCrop={requestCrop}
                imageUploading={imageUploading}
                reorderGroup={(row, d) =>
                  reorderRows("modifier-groups", modifierGroups, row, d)
                }
                reorderOption={(group, row, d) =>
                  reorderRows("modifier-options", group.options || [], row, d)
                }
              />
            )}{" "}
            {catalogSection === "categories" && can("categories") && (
              <CategoriesAdmin
                categories={categories}
                subcategories={subcategories}
                categoryForm={categoryForm}
                setCategoryForm={setCategoryForm}
                subForm={subForm}
                setSubForm={setSubForm}
                createCategory={createCategory}
                updateCategory={updateCategory}
                removeCategory={removeCategory}
                createSub={createSub}
                updateSub={updateSub}
                removeSub={removeSub}
                reorderCategory={(row, d) =>
                  reorderRows("categories", categories, row, d)
                }
                reorderSub={(row, d) =>
                  reorderRows(
                    "subcategories",
                    subcategories,
                    row,
                    d,
                    (x) => x.categoryId === row.categoryId,
                  )
                }
              />
            )}
          </div>
        )}
        {tab === "inventory" && can("inventory") && (
          <InventoryAdmin
            session={session}
            products={products.filter((p) => !p.deletedAt)}
            notify={notify}
            fail={fail}
          />
        )}
        {tab === "delivery" && can("delivery") && (
          <>
            <DeliveryAdmin
              settings={settings}
              setSettings={setSettings}
              areas={areas}
              form={areaForm}
              setForm={setAreaForm}
              create={createArea}
              update={updateArea}
              remove={removeArea}
              saveSettings={saveDeliverySettings}
            />
            <DeliveryTimeRules session={session} notify={notify} fail={fail} />
          </>
        )}
        {tab === "customers" && can("customers") && (
          <section className="admin-panel">
            <div className="panel-title">
              <div>
                <span>Relacionamento</span>
                <h2>Clientes cadastrados</h2>
                <p>
                  VIPs, inativos, histórico completo, observações internas e
                  bloqueio administrativo.
                </p>
              </div>
              <b>
                {filteredCustomers.length}/{customers.length}
              </b>
            </div>
            <div className="customer-search-box">
              <Search size={17} />
              <input
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Buscar cliente por nome, e-mail ou telefone"
              />
            </div>
            <div className="customer-list">
              {filteredCustomers.map((c) => (
                <article
                  key={c.id}
                  className={`customer-row-clickable ${c.customerBlocked ? "blocked" : ""}`}
                  onClick={() => setSelectedCustomerId(c.id)}
                >
                  <div className="customer-avatar">
                    <UserRound />
                  </div>
                  <div className="customer-identity">
                    <b>
                      {c.name}{" "}
                      {c.vip && (
                        <em className="customer-vip-tag">
                          <Star size={12} /> VIP
                        </em>
                      )}{" "}
                      {c.inactive && (
                        <em className="customer-inactive-tag">Inativo</em>
                      )}
                    </b>
                    <small>
                      {c.email} • {formatPhoneSimple(c.phone)}
                    </small>
                  </div>
                  <div className="customer-stats-mini">
                    <span>
                      <small>Pedidos</small>
                      <b>{c.ordersCount}</b>
                    </span>
                    <span>
                      <small>Total gasto</small>
                      <b>{money(c.lifetimeSpent || 0)}</b>
                    </span>
                  </div>
                  <button
                    className="subtle-danger customer-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteCustomer(c);
                    }}
                    title="Excluir conta do cliente"
                  >
                    <Trash2 size={15} />
                    <span>Excluir conta</span>
                  </button>
                </article>
              ))}
            </div>
          </section>
        )}
        {tab === "reports" && can("reports") && (
          <ReportsAdmin session={session} fail={fail} />
        )}
        {tab === "settings" && can("settings") && settings && (
          <StoreSettings
            settings={settings}
            setSettings={setSettings}
            saveSettings={saveStoreSettings}
            lookupStoreCep={lookupStoreCep}
            goProducts={() => {
              setTab("catalog");
              setCatalogSection("products");
            }}
            uploadMedia={(file, onDone, label, aspect) =>
              requestCrop(file, onDone, label, aspect)
            }
            imageUploading={imageUploading}
          />
        )}
        {tab === "management" && isOwner && (
          <ManagementHub
            session={session}
            notify={notify}
            fail={fail}
            onSettingsChanged={onCatalogChanged}
          />
        )}
        {tab === "staff" && isOwner && (
          <StaffAdmin
            staff={staff}
            form={staffForm}
            setForm={setStaffForm}
            createStaff={createStaff}
            updateStaff={updateStaff}
            disableStaff={disableStaff}
            deleteStaff={deleteStaff}
            generatePassword={generateStaffPassword}
          />
        )}
      </main>

      {selectedCustomerId && (
        <CustomerDetailModal
          session={session}
          customerId={selectedCustomerId}
          onClose={() => setSelectedCustomerId(null)}
          onChanged={loadAll}
          fail={fail}
        />
      )}
      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onStatus={changeStatus}
          onCancel={setCancelTarget}
          deliveryOnly={isDeliveryStaff}
          savingId={statusSavingId}
        />
      )}
      {cancelTarget && (
        <CancelOrderModal
          order={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onConfirm={async (reason) => {
            await changeStatus(cancelTarget.id, "CANCELED", reason);
            setCancelTarget(null);
          }}
          saving={statusSavingId === cancelTarget.id}
        />
      )}

      {productEditor && (
        <ProductEditorModal
          productForm={productForm}
          setProductForm={setProductForm}
          categories={categories}
          subcategories={subcategories}
          sizes={sizes}
          modifierGroups={modifierGroups}
          onClose={() => setProductEditor(null)}
          onSave={saveProduct}
          onUpload={uploadImage}
          imageUploading={imageUploading}
          isNew={productEditor === "new"}
          onArchive={archiveProduct}
        />
      )}
    </div>
  );
}

function OverviewOrderTabs({ value, onChange, buckets, deliveryOnly = false }) {
  const views = deliveryOnly
    ? ["READY_FOR_DELIVERY", "OUT_FOR_DELIVERY", "DELIVERED"]
    : [
        "OPEN",
        "RECEIVED",
        "PREPARING",
        "READY_FOR_TABLE",
        "SERVED",
        "READY_FOR_DELIVERY",
        "SCHEDULED",
        "OUT_FOR_DELIVERY",
        "READY_FOR_PICKUP",
      ];
  const labels = {
    OPEN: "Em aberto",
    RECEIVED: "Recebidos",
    PREPARING: "Em preparação",
    READY_FOR_TABLE: "Pronto para servir",
    SERVED: "Aguardando fechamento",
    READY_FOR_DELIVERY: "Prontos para entrega",
    SCHEDULED: "Agendamentos",
    OUT_FOR_DELIVERY: "Entregando",
    READY_FOR_PICKUP: "Prontos p/ retirada",
    DELIVERED: "Entregues",
  };
  return (
    <div className="order-view-tabs overview-order-tabs">
      {views.map((key) => {
        const count = buckets[key]?.length || 0;
        const calling = ["RECEIVED", "READY_FOR_TABLE", "SERVED"].includes(key) && count > 0;
        return (
          <button
            key={key}
            className={`${value === key ? "active" : ""} ${calling ? "attention-pulse" : ""}`.trim()}
            onClick={() => onChange(key)}
          >
            {key === "SCHEDULED" && <CalendarClock size={15} />} {labels[key]}{" "}
            <b>{count}</b>
          </button>
        );
      })}
    </div>
  );
}
function OrderViewTabs({ value, onChange, buckets, deliveryOnly = false }) {
  const views = deliveryOnly
    ? ["READY_FOR_DELIVERY", "OUT_FOR_DELIVERY", "DELIVERED"]
    : [
        "OPEN",
        "RECEIVED",
        "PREPARING",
        "READY_FOR_TABLE",
        "SERVED",
        "READY_FOR_DELIVERY",
        "SCHEDULED",
        "OUT_FOR_DELIVERY",
        "READY_FOR_PICKUP",
        "DELIVERED",
        "CANCELED",
      ];
  return (
    <div className="order-view-tabs">
      {views.map((key) => (
        <button
          key={key}
          className={value === key ? "active" : ""}
          onClick={() => onChange(key)}
        >
          {key === "SCHEDULED" && <CalendarClock size={15} />}{" "}
          {ORDER_VIEW_LABELS[key]} <b>{buckets[key]?.length || 0}</b>
        </button>
      ))}
    </div>
  );
}
function PriorityArrows({ value, onUp, onDown }) {
  return (
    <div className="priority-controls compact-priority">
      <small>Prioridade {value}</small>
      <span>
        <button type="button" onClick={onUp} title="Subir">
          <ArrowUp size={14} />
        </button>
        <button type="button" onClick={onDown} title="Descer">
          <ArrowDown size={14} />
        </button>
      </span>
    </div>
  );
}
function Stat({ label, value }) {
  return (
    <article>
      <small>{label}</small>
      <b>{value}</b>
    </article>
  );
}

function deadlineState(order, minutes = 30) {
  if (
    order.fulfillmentType === "DINE_IN" ||
    ["DELIVERED", "CANCELED"].includes(order.status) ||
    !order.estimatedTo
  )
    return "";
  const remaining = new Date(order.estimatedTo).getTime() - Date.now();
  if (!Number.isFinite(remaining)) return "";
  if (remaining <= 0) return "overdue";
  if (remaining <= Math.max(1, Number(minutes || 30)) * 60000) return "warning";
  return "";
}

function nextStatusForOrder(order) {
  if (order.fulfillmentType === "DINE_IN") {
    if (order.status === "RECEIVED") return "PREPARING";
    if (order.status === "PREPARING") return "READY_FOR_TABLE";
    if (order.status === "READY_FOR_TABLE") return "SERVED";
    return null;
  }
  if (order.status === "SCHEDULED") return "RECEIVED";
  if (order.status === "RECEIVED") return "PREPARING";
  if (order.status === "PREPARING")
    return order.fulfillmentType === "PICKUP"
      ? "READY_FOR_PICKUP"
      : "READY_FOR_DELIVERY";
  if (order.status === "READY_FOR_DELIVERY") return null; // aguarda um entregador aceitar a corrida
  if (
    order.status === "OUT_FOR_DELIVERY" ||
    order.status === "READY_FOR_PICKUP"
  )
    return "DELIVERED";
  return null;
}
function nextStatusLabel(order) {
  const next = nextStatusForOrder(order);
  if (order.fulfillmentType === "DINE_IN") {
    if (next === "PREPARING") return "Iniciar preparo";
    if (next === "READY_FOR_TABLE") return "Marcar pronto para servir";
    if (next === "SERVED") return "Marcar como servido";
  }
  if (order.status === "RECEIVED" && next === "PREPARING")
    return "Aceitar pedido e iniciar preparo";
  return next ? `Avançar para ${STATUS_LABEL[next]}` : "Pedido concluído";
}
function OrderStatusActions({
  order,
  onStatus,
  onCancel,
  deliveryOnly = false,
  compact = false,
  saving = false,
}) {
  if (deliveryOnly) {
    if (order.status === "READY_FOR_DELIVERY")
      return (
        <button
          disabled={saving}
          className="delivery-complete-btn"
          onClick={(e) => {
            e.stopPropagation();
            if (!saving) onStatus(order.id, "OUT_FOR_DELIVERY");
          }}
        >
          <MotoIcon size={15} /> {saving ? "Aceitando..." : "Aceitar entrega"}
        </button>
      );
    if (order.status === "OUT_FOR_DELIVERY")
      return (
        <button
          disabled={saving}
          className="delivery-complete-btn"
          onClick={(e) => {
            e.stopPropagation();
            if (!saving) onStatus(order.id, "DELIVERED");
          }}
        >
          <Check size={15} /> {saving ? "Salvando..." : "Marcar Entregue"}
        </button>
      );
    return (
      <span className="final-status-label">
        {STATUS_LABEL[order.status] || order.status}
      </span>
    );
  }
  const next = nextStatusForOrder(order);
  const final = ["DELIVERED", "CANCELED"].includes(order.status);
  const waitingCourier = order.status === "READY_FOR_DELIVERY";
  const waitingTablePayment =
    order.fulfillmentType === "DINE_IN" && order.status === "SERVED";
  return (
    <div
      className={`status-step-actions ${compact ? "compact" : ""}`}
      onClick={(e) => e.stopPropagation()}
    >
      {next && (
        <button
          disabled={saving}
          className="advance-status-btn"
          onClick={() => !saving && onStatus(order.id, next)}
        >
          <ChevronRight size={15} />
          {saving ? "Salvando..." : nextStatusLabel(order)}
        </button>
      )}
      {waitingCourier && (
        <span className="final-status-label">Aguardando entregador</span>
      )}
      {waitingTablePayment && (
        <span className="final-status-label">Servido • aguardando fechamento</span>
      )}
      {!final && (
        <button
          disabled={saving}
          className="cancel-status-btn"
          onClick={() => !saving && onCancel?.(order)}
        >
          Cancelar
        </button>
      )}
      {final && (
        <span className="final-status-label">{STATUS_LABEL[order.status]}</span>
      )}
    </div>
  );
}
function OrderList({
  orders,
  onStatus,
  onCancel,
  onOpen,
  lateWarningMinutes = 30,
  deliveryOnly = false,
  savingId = null,
}) {
  if (!orders.length)
    return (
      <div className="empty-admin">
        <ShoppingBag />
        <p>Nenhum pedido por aqui.</p>
      </div>
    );
  return (
    <div className="order-list">
      {orders.map((o) => {
        const urgency = deadlineState(o, lateWarningMinutes);
        const eta = etaRange(o);
        return (
          <article
            className={`admin-order clickable status-card-${String(o.status).toLowerCase()} ${o.fulfillmentType === "DINE_IN" ? "dine-in-order" : ""} ${urgency ? `deadline-${urgency}` : ""}`}
            key={o.id}
            onClick={() => onOpen(o)}
          >
            <div className="order-code">
              <b>#{o.shortCode}</b>
              {o.fulfillmentType === "DINE_IN" && (
                <em className="dine-in-order-badge">
                  <UtensilsCrossed size={12} /> Presencial
                </em>
              )}
              <small>
                {new Date(o.createdAt).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </small>
              {o.scheduledAt && (
                <em className="scheduled-order-mark">
                  Agendado •{" "}
                  {new Date(o.scheduledAt).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </em>
              )}
              {eta && o.fulfillmentType !== "DINE_IN" && (
                <span className="admin-order-eta">
                  <Clock3 size={13} />
                  {o.fulfillmentType === "PICKUP" ? "Pronto" : "Entrega"}:{" "}
                  <b>{eta}</b>
                </span>
              )}
            </div>
            <div className="order-client">
              <b>{o.customerName}</b>
              <small>
                {o.fulfillmentType === "DINE_IN"
                  ? o.table?.name || `Mesa ${o.table?.number || "—"}`
                  : formatPhoneSimple(o.customerPhone)}
              </small>
              <small>
                {o.fulfillmentType === "DINE_IN"
                  ? "Atendimento no salão"
                  : o.fulfillmentType === "PICKUP"
                  ? "Retirada"
                  : `Entrega • ${o.neighborhood || o.city || ""}`}
              </small>
            </div>
            <div className="order-products">
              {o.items.slice(0, 3).map((item) => (
                <span key={item.id}>
                  {item.quantity}× {item.name}
                </span>
              ))}
              <small>{paymentLabel(o)}</small>
            </div>
            {urgency && (
              <span
                className={`deadline-alert ${urgency}`}
                title={
                  urgency === "overdue"
                    ? "O prazo estimado já foi atingido."
                    : `Faltam até ${lateWarningMinutes} minutos para o limite da previsão.`
                }
              >
                <AlertTriangle size={18} />
                <b>
                  {urgency === "overdue"
                    ? "Prazo atingido"
                    : `Atenção • ≤ ${lateWarningMinutes} min`}
                </b>
              </span>
            )}
            <strong>{money(o.total)}</strong>
            <OrderStatusActions
              order={o}
              onStatus={onStatus}
              onCancel={onCancel}
              deliveryOnly={deliveryOnly}
              compact
              saving={savingId === o.id}
            />
            <ChevronRight className="order-open-icon" />
          </article>
        );
      })}
    </div>
  );
}

function OrderDetailModal({
  order,
  onClose,
  onStatus,
  onCancel,
  deliveryOnly = false,
  savingId = null,
}) {
  const isDineIn = order.fulfillmentType === "DINE_IN";
  const tableName =
    order.table?.name || `Mesa ${order.table?.number || "não identificada"}`;
  const fullAddress =
    order.fulfillmentType === "DELIVERY"
      ? [
          order.street,
          order.addressNumber,
          order.neighborhood,
          order.city,
          order.state,
          order.complement,
          order.postalCode,
        ]
          .filter(Boolean)
          .join(", ")
      : isDineIn
        ? `${tableName} • Atendimento no salão`
        : "Retirada na loja";
  const eta = etaRange(order);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section className="order-detail-modal">
        <div className="modal-head">
          <div>
            <span className="eyebrow dark">
              {isDineIn ? "Pedido presencial" : "Pedido"} #{order.shortCode}
            </span>
            <h2>{order.customerName}</h2>
            <p>{new Date(order.createdAt).toLocaleString("pt-BR")}</p>
          </div>
          <button className="icon-close" onClick={onClose}>
            <X />
          </button>
        </div>
        {eta && !isDineIn && (
          <div className="order-detail-eta">
            <Clock3 />
            <span>
              <small>
                {order.fulfillmentType === "PICKUP"
                  ? "Previsão para ficar pronto"
                  : "Previsão de entrega"}
              </small>
              <b>{eta}</b>
            </span>
          </div>
        )}
        <div className="order-detail-grid">
          <article>
            <small>Status</small>
            <b>{STATUS_LABEL[order.status] || order.status}</b>
            <OrderStatusActions
              order={order}
              onStatus={onStatus}
              onCancel={onCancel}
              deliveryOnly={deliveryOnly}
              saving={savingId === order.id}
            />
          </article>
          <article>
            <small>{isDineIn ? "Mesa" : "Telefone"}</small>
            <b>
              {isDineIn ? tableName : formatPhoneSimple(order.customerPhone)}
            </b>
          </article>
          <article className="span-2">
            <small>Endereço / operação</small>
            <b>{fullAddress}</b>
          </article>
          {order.referencePoint && (
            <article className="span-2">
              <small>Ponto de referência</small>
              <b>{order.referencePoint}</b>
            </article>
          )}
          {order.distanceKm != null && (
            <article>
              <small>Distância calculada</small>
              <b>{Number(order.distanceKm).toFixed(2)} km</b>
            </article>
          )}
          <article>
            <small>Pagamento</small>
            <b>{paymentLabel(order)}</b>
            <small>
              {isDineIn
                ? "Pagamento realizado no fechamento da mesa"
                : order.paymentStatus === "APPROVED"
                ? "Pagamento aprovado"
                : order.paymentStatus === "CASH_PENDING"
                  ? "Pagamento na entrega/retirada"
                  : "Aguardando confirmação"}
            </small>
          </article>
          {order.assignedCourier && (
            <article>
              <small>Entregador atribuído</small>
              <b>{order.assignedCourier.name}</b>
              <small>{formatPhoneSimple(order.assignedCourier.phone)}</small>
            </article>
          )}
          {order.scheduledAt && (
            <article>
              <small>Agendamento</small>
              <b>{new Date(order.scheduledAt).toLocaleString("pt-BR")}</b>
            </article>
          )}
          {order.acceptedAt && (
            <article>
              <small>Aceito pela loja</small>
              <b>{new Date(order.acceptedAt).toLocaleString("pt-BR")}</b>
            </article>
          )}
          {!isDineIn && (
            <article>
              <small>Troco para</small>
              <b>{order.changeFor ? money(order.changeFor) : "Não informado"}</b>
            </article>
          )}
          {order.status === "CANCELED" && order.cancelReason && (
            <article className="span-2 cancel-reason-admin">
              <small>Motivo do cancelamento</small>
              <b>{order.cancelReason}</b>
            </article>
          )}
        </div>
        <div className="order-detail-items">
          <h3>Itens do pedido</h3>
          {order.items.map((item) => (
            <div key={item.id} className="order-detail-item-rich">
              <span>
                <b>
                  {item.quantity}× {item.name}
                </b>
                {item.flavors?.length > 0 && (
                  <small>
                    Sabores: {item.flavors.map((f) => f.name).join(" • ")}
                  </small>
                )}
                {item.options?.length > 0 && (
                  <small>
                    Adicionais:{" "}
                    {item.options
                      .map((o) => `${o.groupName}: ${o.optionName}`)
                      .join(" • ")}
                  </small>
                )}
                {item.notes && <em>Observação do item: {item.notes}</em>}
              </span>
              <strong>{money(Number(item.unitPrice) * item.quantity)}</strong>
            </div>
          ))}
        </div>
        <div className="order-detail-totals">
          <span>
            Subtotal <b>{money(order.subtotal)}</b>
          </span>
          <span>
            Entrega <b>{money(order.deliveryFee)}</b>
          </span>
          <strong>Total {money(order.total)}</strong>
        </div>
        <div className="order-history">
          <h3>Histórico</h3>
          {order.history?.map((item) => (
            <span key={item.id}>
              <i />
              <b>{STATUS_LABEL[item.status] || item.status}</b>
              <small>
                {new Date(item.createdAt).toLocaleString("pt-BR")}
                {item.changedByName
                  ? ` • ${item.changedByName}${item.changedByRole ? ` (${item.changedByRole})` : ""}`
                  : ""}
              </small>
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

function CancelOrderModal({ order, onClose, onConfirm, saving = false }) {
  const [reason, setReason] = useState("");
  return (
    <div
      className="modal-backdrop cancel-modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        className="cancel-order-modal"
        onSubmit={(e) => {
          e.preventDefault();
          if (reason.trim().length >= 3) onConfirm(reason.trim());
        }}
      >
        <div className="cancel-modal-icon">
          <AlertTriangle size={24} />
        </div>
        <div>
          <span className="eyebrow dark">
            Cancelar pedido #{order.shortCode}
          </span>
          <h2>Informe o motivo</h2>
          <p>
            O cliente verá este motivo em “Seus pedidos” e no acompanhamento.
          </p>
        </div>
        <label>
          Motivo
          <textarea
            autoFocus
            required
            minLength="3"
            maxLength="280"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex.: ingrediente indisponível, solicitação do cliente..."
          />
          <small>{reason.length}/280</small>
        </label>
        <div className="cancel-modal-actions">
          <button type="button" className="ghost-dark-btn" onClick={onClose}>
            Voltar
          </button>
          <button
            disabled={saving || reason.trim().length < 3}
            className="cancel-confirm-btn"
          >
            {saving ? "Cancelando..." : "Confirmar cancelamento"}
          </button>
        </div>
      </form>
    </div>
  );
}

const STAFF_PERMISSION_OPTIONS = TABS.filter(
  ([, , , permission]) => permission !== "__OWNER__",
).map(([id, Icon, label, permission]) => ({ id, Icon, label, permission }));

function OperationsAdmin({
  settings,
  saveOperations,
  statusSaving,
  hours,
  setHours,
  saveHour,
}) {
  const controls = [
    [
      "isOpen",
      "Loja aberta",
      "Ao abrir manualmente, a loja permanece aberta até o próximo horário de fechamento configurado.",
      settings?.isOpen,
    ],
    [
      "deliveryEnabled",
      "Entrega disponível",
      "Mostra e aceita a opção de entrega no checkout.",
      settings?.deliveryEnabled,
    ],
    [
      "pickupEnabled",
      "Retirada disponível",
      "Mostra e aceita a retirada diretamente na loja.",
      settings?.pickupEnabled,
    ],
    [
      "schedulingEnabled",
      "Agendamento disponível",
      "Permite que clientes reservem uma entrega futura. Se a loja estiver fechada, esta opção decide se ainda é possível comprar agendando.",
      settings?.schedulingEnabled,
    ],
  ];
  return (
    <>
      <section className="admin-panel operations-admin">
        <div className="panel-title">
          <div>
            <span>Controle rápido</span>
            <h2>Operação da loja</h2>
            <p>
              Esses comandos foram separados das configurações gerais para a
              equipe alterar o funcionamento do dia com segurança.
            </p>
          </div>
          <Power />
        </div>
        <div className="operation-control-grid">
          {controls.map(([key, title, description, value]) => (
            <article key={key} className={value ? "enabled" : "disabled"}>
              <span className={`operation-light ${value ? "on" : "off"}`} />
              <div>
                <b>{title}</b>
                <small>{description}</small>
              </div>
              <button
                disabled={statusSaving}
                className={
                  value ? "operation-toggle active" : "operation-toggle"
                }
                onClick={() => saveOperations({ [key]: !value })}
              >
                {statusSaving
                  ? "Salvando..."
                  : value
                    ? "Ativo"
                    : "Desativado"}
              </button>
            </article>
          ))}
        </div>
        <div className="operation-tip">
          <ShieldCheck />
          <span>
            <b>Alteração imediata</b>
            <small>
              O estado salvo aqui é persistido no banco e refletido no site
              público.
            </small>
          </span>
        </div>
      </section>
      <StoreHoursEditor
        hours={hours}
        setHours={setHours}
        saveHour={saveHour}
      />
    </>
  );
}

function StoreHoursEditor({ hours = [], setHours, saveHour }) {
  return (
    <section className="admin-panel hours-panel operations-hours-panel">
      <div className="panel-title">
        <div>
          <span>Horário público</span>
          <h2>Funcionamento por dia</h2>
          <p>
            Estes horários informam o cliente e validam os agendamentos quando
            a loja estiver fechada.
          </p>
        </div>
        <Clock3 />
      </div>
      <div className="hours-admin-list">
        {hours.map((hour) => (
          <article key={hour.id}>
            <b>{hour.label}</b>
            <label>
              <span>Abre</span>
              <input
                type="time"
                value={hour.openTime}
                disabled={hour.closed}
                onChange={(event) =>
                  setHours((rows) =>
                    rows.map((row) =>
                      row.id === hour.id
                        ? { ...row, openTime: event.target.value }
                        : row,
                    ),
                  )
                }
                onBlur={(event) =>
                  saveHour(hour, { openTime: event.target.value })
                }
              />
            </label>
            <label>
              <span>Fecha</span>
              <input
                type="time"
                value={hour.closeTime}
                disabled={hour.closed}
                onChange={(event) =>
                  setHours((rows) =>
                    rows.map((row) =>
                      row.id === hour.id
                        ? { ...row, closeTime: event.target.value }
                        : row,
                    ),
                  )
                }
                onBlur={(event) =>
                  saveHour(hour, { closeTime: event.target.value })
                }
              />
            </label>
            <button
              type="button"
              className={hour.closed ? "area-toggle" : "area-toggle active"}
              onClick={() => saveHour(hour, { closed: !hour.closed })}
            >
              {hour.closed ? "Fechado" : "Aberto"}
            </button>
          </article>
        ))}
      </div>
      <p className="field-note">
        Altere o horário e clique fora do campo para salvar. O botão define se
        aquele dia aceita agendamento.
      </p>
    </section>
  );
}

function TeamAnalytics({ data }) {
  const [period, setPeriod] = useState("day");
  const [teamScope, setTeamScope] = useState("ALL");
  const [selectedMember, setSelectedMember] = useState(null);
  const [paymentFilter, setPaymentFilter] = useState("ALL");
  if (!data)
    return (
      <section className="admin-panel analytics-loading">
        <Activity className="spin" />
        <div>
          <h2>Carregando desempenho...</h2>
          <p>Consolidando pedidos, entregas e movimentações da equipe.</p>
        </div>
      </section>
    );
  const periodOptions = [
    ["day", "Diário", "hoje"],
    ["week", "Semanal", "na semana"],
    ["month", "Mensal", "no mês"],
    ["year", "Anual", "no ano"],
  ];
  const current = data.periods?.[period] || {};
  const chartMode =
    { day: "daily", week: "weekly", month: "monthly", year: "yearly" }[
      period
    ] || "monthly";
  const chartRows = data.history?.[chartMode] || data.monthly || [];
  const maxRevenue = Math.max(
    1,
    ...chartRows.map((row) => Number(row.revenue || 0)),
  );
  const maxOrders = Math.max(
    1,
    ...chartRows.map((row) => Number(row.completed || 0)),
  );

  const teamRows = (data.team || []).filter(
    (row) =>
      teamScope === "ALL" ||
      (teamScope === "DELIVERY"
        ? row.role === "DELIVERY"
        : row.role !== "DELIVERY"),
  );
  const periodDeliveredFor = (row) =>
    (row.details?.delivered || []).filter((item) => item.periods?.[period]);
  const periodCanceledFor = (row) =>
    (row.details?.canceled || []).filter((item) => item.periods?.[period]);
  const aggregate = teamRows.reduce(
    (acc, row) => {
      const delivered = periodDeliveredFor(row);
      acc.people++;
      acc.completed += delivered.length;
      acc.total += delivered.reduce(
        (v, item) => v + Number(item.total || 0),
        0,
      );
      acc.cash += delivered.reduce(
        (v, item) => v + Number(item.cashCollected || 0),
        0,
      );
      acc.freight += delivered.reduce(
        (v, item) => v + Number(item.deliveryFee || 0),
        0,
      );
      acc.km += delivered.reduce(
        (v, item) => v + Number(item.distanceKm || 0),
        0,
      );
      acc.canceled += periodCanceledFor(row).length;
      return acc;
    },
    {
      people: 0,
      completed: 0,
      total: 0,
      cash: 0,
      freight: 0,
      km: 0,
      canceled: 0,
    },
  );

  const member = selectedMember
    ? (data.team || []).find((row) => row.id === selectedMember)
    : null;
  const memberAll = member?.details?.delivered || [];
  const memberPeriod = memberAll.filter((item) => item.periods?.[period]);
  const paymentOptions = [
    ...new Set(memberPeriod.map(paymentFilterKey).filter(Boolean)),
  ];
  const details =
    paymentFilter === "ALL"
      ? memberPeriod
      : memberPeriod.filter((item) => paymentFilterKey(item) === paymentFilter);
  const sum = (key) =>
    details.reduce((total, item) => total + Number(item[key] || 0), 0);
  const filteredTotal = sum("total"),
    filteredFreight = sum("deliveryFee"),
    filteredKm = sum("distanceKm"),
    filteredCash = sum("cashCollected");
  const memberCanceled = (member?.details?.canceled || []).filter(
    (item) => item.periods?.[period],
  ).length;
  const periodLabel =
    periodOptions.find(([key]) => key === period)?.[1] || "Período";
  const scopeLabel =
    teamScope === "ALL"
      ? "Equipe completa"
      : teamScope === "DELIVERY"
        ? "Entregadores"
        : "Funcionários";

  return (
    <div className="analytics-page">
      <section className="admin-panel analytics-head">
        <div>
          <span className="eyebrow dark">Gestão da equipe</span>
          <h2>Desempenho e resultados</h2>
          <p>
            Compare faturamento, frete, entregas, quilômetros e desempenho por
            dia, semana, mês ou ano.
          </p>
        </div>
        <div className="analytics-updated">
          <Activity size={18} />
          <span>
            <small>Atualizado</small>
            <b>
              {new Date(data.updatedAt).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </b>
          </span>
        </div>
      </section>

      <section className="admin-panel financial-period-panel">
        <div className="financial-period-tabs">
          {periodOptions.map(([key, label]) => (
            <button
              type="button"
              key={key}
              className={period === key ? "active" : ""}
              onClick={() => setPeriod(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="financial-kpis">
          <article>
            <span>
              <ReceiptText size={18} />
            </span>
            <div>
              <small>
                Faturamento {periodOptions.find(([k]) => k === period)?.[2]}
              </small>
              <b>{money(current.revenue || 0)}</b>
            </div>
          </article>
          <article>
            <span>
              <MotoIcon size={19} />
            </span>
            <div>
              <small>Valor de fretes</small>
              <b>{money(current.deliveryFees || 0)}</b>
            </div>
          </article>
          <article className="net-sales">
            <span>
              <DollarSign size={18} />
            </span>
            <div>
              <small>Valor sem frete</small>
              <b>
                {money(
                  current.netRevenue ??
                    Number(current.revenue || 0) -
                      Number(current.deliveryFees || 0),
                )}
              </b>
            </div>
          </article>
          <article>
            <span>
              <ShoppingBag size={18} />
            </span>
            <div>
              <small>Concluídos</small>
              <b>{current.completed || 0}</b>
            </div>
          </article>
        </div>
        <p className="financial-note">
          Valor sem frete = total dos pedidos − taxas de entrega. Não desconta
          ingredientes, salários, impostos ou outros custos.
        </p>
      </section>

      <section className="admin-panel analytics-chart-panel">
        <div className="panel-title">
          <div>
            <span>Histórico financeiro</span>
            <h2>Faturamento por período</h2>
            <p>
              O gráfico acompanha automaticamente o filtro geral acima. No
              celular, arraste para os lados.
            </p>
          </div>
          <DollarSign />
        </div>
        <div className="analytics-chart-scroll">
          <div
            className={`analytics-chart history-${chartMode}`}
            style={{
              gridTemplateColumns: `repeat(${Math.max(chartRows.length, 1)}, minmax(64px,1fr))`,
            }}
          >
            {chartRows.map((row) => {
              const height = Math.max(
                4,
                Math.round((Number(row.revenue || 0) / maxRevenue) * 100),
              );
              const orderHeight = Math.max(
                3,
                Math.round((Number(row.completed || 0) / maxOrders) * 100),
              );
              return (
                <div className="analytics-month" key={row.key}>
                  <div className="analytics-bars">
                    <div
                      className="analytics-order-shadow"
                      style={{ height: `${orderHeight}%` }}
                    />
                    <div
                      className="analytics-revenue-bar"
                      style={{ height: `${height}%` }}
                    >
                      <b>{row.completed}</b>
                    </div>
                  </div>
                  <small>{row.label}</small>
                  <strong>{money(row.revenue)}</strong>
                </div>
              );
            })}
          </div>
        </div>
        <div className="analytics-legend">
          <span>
            <i className="legend-revenue" /> Faturamento
          </span>
          <span>
            <i className="legend-orders" /> Pedidos concluídos
          </span>
        </div>
      </section>

      <section className="admin-panel team-aggregate-panel">
        <div className="panel-title">
          <div>
            <span>Totais da equipe</span>
            <h2>
              {scopeLabel} • {periodLabel}
            </h2>
            <p>
              Veja todos juntos ou separe funcionários e entregadores, mantendo
              o mesmo período selecionado acima.
            </p>
          </div>
          <Users />
        </div>
        <div className="team-scope-tabs">
          <button
            type="button"
            className={teamScope === "ALL" ? "active" : ""}
            onClick={() => setTeamScope("ALL")}
          >
            Todos juntos
          </button>
          <button
            type="button"
            className={teamScope === "STAFF" ? "active" : ""}
            onClick={() => setTeamScope("STAFF")}
          >
            Funcionários
          </button>
          <button
            type="button"
            className={teamScope === "DELIVERY" ? "active" : ""}
            onClick={() => setTeamScope("DELIVERY")}
          >
            Entregadores
          </button>
        </div>
        <div className="team-aggregate-grid">
          <article>
            <small>Pessoas</small>
            <b>{aggregate.people}</b>
          </article>
          <article>
            <small>Pedidos concluídos</small>
            <b>{aggregate.completed}</b>
          </article>
          <article>
            <small>Valor movimentado</small>
            <b>{money(aggregate.total)}</b>
          </article>
          <article>
            <small>Dinheiro recebido</small>
            <b>{money(aggregate.cash)}</b>
          </article>
          <article>
            <small>Fretes</small>
            <b>{money(aggregate.freight)}</b>
          </article>
          <article>
            <small>Km registrados</small>
            <b>{aggregate.km.toFixed(1)} km</b>
          </article>
          <article>
            <small>Cancelados</small>
            <b>{aggregate.canceled}</b>
          </article>
        </div>
      </section>

      <section className="admin-panel">
        <div className="panel-title">
          <div>
            <span>Equipe</span>
            <h2>Funcionários e entregadores</h2>
            <p>
              Clique em uma pessoa para analisar ganhos, dinheiro recebido,
              frete e quilômetros no período selecionado.
            </p>
          </div>
          <Users />
        </div>
        <div className="team-performance-list">
          {teamRows.length ? (
            teamRows.map((row) => {
              const periodDelivered = periodDeliveredFor(row);
              const pTotal = periodDelivered.reduce(
                (v, item) => v + Number(item.total || 0),
                0,
              );
              const pCash = periodDelivered.reduce(
                (v, item) => v + Number(item.cashCollected || 0),
                0,
              );
              const pKm = periodDelivered.reduce(
                (v, item) => v + Number(item.distanceKm || 0),
                0,
              );
              const pFreight = periodDelivered.reduce(
                (v, item) => v + Number(item.deliveryFee || 0),
                0,
              );
              return (
                <article
                  key={row.id}
                  className="team-performance-clickable"
                  onClick={() => {
                    setSelectedMember(row.id);
                    setPaymentFilter("ALL");
                  }}
                >
                  <div className="team-person">
                    <div
                      className={`team-avatar ${row.role === "DELIVERY" ? "delivery" : "staff"}`}
                    >
                      {row.role === "DELIVERY" ? (
                        <MotoIcon size={20} />
                      ) : (
                        <UserRound size={18} />
                      )}
                    </div>
                    <span>
                      <b>{row.name}</b>
                      <small>
                        {row.role === "DELIVERY"
                          ? "Entregador"
                          : "Funcionário / administrador"}{" "}
                        • {periodLabel}
                      </small>
                    </span>
                  </div>
                  <div className="team-metric">
                    <small>Concluídos</small>
                    <b>{periodDelivered.length}</b>
                  </div>
                  <div className="team-metric money">
                    <small>Valor</small>
                    <b>{money(pTotal)}</b>
                  </div>
                  <div className="team-metric money">
                    <small>Dinheiro recebido</small>
                    <b>{money(pCash)}</b>
                  </div>
                  <div className="team-metric">
                    <small>Km</small>
                    <b>{pKm.toFixed(1)} km</b>
                  </div>
                  <div className="team-metric">
                    <small>Fretes</small>
                    <b>{money(pFreight)}</b>
                  </div>
                  <ChevronRight size={18} className="team-open-indicator" />
                </article>
              );
            })
          ) : (
            <div className="empty-admin">
              <Activity />
              <p>Sem atividade suficiente neste filtro.</p>
            </div>
          )}
        </div>
      </section>

      {member && (
        <div
          className="modal-backdrop team-detail-backdrop"
          onMouseDown={(e) =>
            e.target === e.currentTarget && setSelectedMember(null)
          }
        >
          <section className="team-detail-modal">
            <div className="modal-head">
              <div>
                <span className="eyebrow dark">Desempenho individual</span>
                <h2>{member.name}</h2>
                <p>
                  {member.role === "DELIVERY"
                    ? "Entregador"
                    : "Funcionário / administrador"}{" "}
                  • {periodLabel}
                </p>
              </div>
              <button
                type="button"
                className="icon-close"
                onClick={() => setSelectedMember(null)}
              >
                <X />
              </button>
            </div>
            <div className="member-period-tabs">
              {periodOptions.map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  className={period === key ? "active" : ""}
                  onClick={() => {
                    setPeriod(key);
                    setPaymentFilter("ALL");
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="team-detail-summary team-detail-summary-six">
              <article>
                <small>Total movimentado</small>
                <b>{money(filteredTotal)}</b>
              </article>
              <article>
                <small>Dinheiro recebido pessoalmente</small>
                <b>{money(filteredCash)}</b>
              </article>
              <article>
                <small>Fretes</small>
                <b>{money(filteredFreight)}</b>
              </article>
              <article>
                <small>Km percorridos</small>
                <b>{filteredKm.toFixed(1)} km</b>
              </article>
              <article>
                <small>Sem frete</small>
                <b>{money(filteredTotal - filteredFreight)}</b>
              </article>
              <article>
                <small>Cancelados</small>
                <b>{memberCanceled}</b>
              </article>
            </div>
            <div className="team-payment-filter">
              <span>
                <b>Filtrar entregas por pagamento</b>
                <small>
                  O filtro também recalcula valor, dinheiro recebido, frete e
                  km.
                </small>
              </span>
              <select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value)}
              >
                <option value="ALL">Todas as formas</option>
                {paymentOptions.map((key) => (
                  <option key={key} value={key}>
                    {paymentFilterLabel(key)}
                  </option>
                ))}
              </select>
            </div>
            <div className="team-filtered-summary">
              <span>
                <small>Registros</small>
                <b>{details.length}</b>
              </span>
              <span>
                <small>Valor total</small>
                <b>{money(filteredTotal)}</b>
              </span>
              <span>
                <small>Dinheiro em mãos</small>
                <b>{money(filteredCash)}</b>
              </span>
              <span>
                <small>Fretes</small>
                <b>{money(filteredFreight)}</b>
              </span>
              <span>
                <small>Distância</small>
                <b>{filteredKm.toFixed(1)} km</b>
              </span>
            </div>
            <div className="team-delivery-history">
              <div className="team-detail-table-head">
                <b>Pedidos entregues</b>
                <span>{details.length} registros</span>
              </div>
              {details.length ? (
                details.map((item) => (
                  <article key={`${item.orderId}-${item.at}`}>
                    <div>
                      <b>#{item.shortCode}</b>
                      <small>
                        {item.customerName} •{" "}
                        {new Date(item.at).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </small>
                    </div>
                    <span>
                      <small>Pagamento</small>
                      <b>
                        {paymentLabel(item)}
                      </b>
                      <small>
                        {item.paymentStatus === "APPROVED"
                          ? "Confirmado online"
                          : item.paymentMethod === "CASH"
                            ? "Recebido na entrega"
                            : item.paymentStatus || ""}
                      </small>
                    </span>
                    <span>
                      <small>Total</small>
                      <b>{money(item.total)}</b>
                      {item.cashCollected > 0 && (
                        <small className="cash-received-mark">
                          Em dinheiro: {money(item.cashCollected)}
                        </small>
                      )}
                    </span>
                    <span>
                      <small>Frete</small>
                      <b>{money(item.deliveryFee)}</b>
                    </span>
                    <span>
                      <small>Sem frete</small>
                      <b>{money(item.netRevenue)}</b>
                    </span>
                    {item.distanceKm != null && (
                      <span>
                        <small>Distância</small>
                        <b>{Number(item.distanceKm).toFixed(1)} km</b>
                      </span>
                    )}
                  </article>
                ))
              ) : (
                <div className="empty-admin">
                  <MotoIcon />
                  <p>Nenhum pedido para este período/filtro.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function TrendingFallback(props) {
  return <BarChart3 {...props} />;
}

function StaffAdmin({
  staff,
  form,
  setForm,
  createStaff,
  updateStaff,
  disableStaff,
  deleteStaff,
  generatePassword,
}) {
  const [showStaffPassword, setShowStaffPassword] = useState(false);
  function toggleFormPermission(permission) {
    setForm({
      ...form,
      permissions: form.permissions.includes(permission)
        ? form.permissions.filter((x) => x !== permission)
        : [...form.permissions, permission],
    });
  }
  function toggleRowPermission(row, permission) {
    const current = Array.isArray(row.adminPermissions)
      ? row.adminPermissions
      : [];
    updateStaff(row, {
      permissions: current.includes(permission)
        ? current.filter((x) => x !== permission)
        : [...current, permission],
    });
  }
  return (
    <div className="staff-admin-layout">
      <section className="admin-panel">
        <div className="panel-title">
          <div>
            <span>Equipe</span>
            <h2>Funcionários com acesso</h2>
            <p>
              Cada conta enxerga somente as abas liberadas pelo proprietário.
            </p>
          </div>
          <b>{staff.length}</b>
        </div>
        <div className="staff-list">
          {staff.length ? (
            staff.map((row) => (
              <article
                key={row.id}
                className={!row.staffActive ? "disabled" : ""}
              >
                <div className="staff-identity">
                  <span className="staff-avatar">
                    {String(row.name || "?")
                      .slice(0, 1)
                      .toUpperCase()}
                  </span>
                  <div>
                    <b>{row.name}</b>
                    <small>
                      {row.email}
                      {row.phone ? ` • ${formatPhoneSimple(row.phone)}` : ""}
                    </small>
                  </div>
                  <button
                    className={
                      row.staffActive ? "staff-state active" : "staff-state"
                    }
                    onClick={() =>
                      updateStaff(row, { staffActive: !row.staffActive })
                    }
                  >
                    {row.staffActive ? "Acesso ativo" : "Acesso bloqueado"}
                  </button>
                </div>
                <div className="staff-role-row">
                  <label>
                    Função
                    <select
                      value={row.staffRole || "STAFF"}
                      onChange={(e) =>
                        updateStaff(row, {
                          staffRole: e.target.value,
                          permissions:
                            e.target.value === "DELIVERY"
                              ? ["orders"]
                              : e.target.value === "WAITER"
                                ? ["tables", "orders"]
                              : row.adminPermissions || [],
                        })
                      }
                    >
                      <option value="STAFF">Funcionário</option>
                      <option value="WAITER">Garçom</option>
                      <option value="DELIVERY">Entregador</option>
                    </select>
                  </label>
                  {row.staffRole === "DELIVERY" && (
                    <span className="delivery-role-note">
                      <MotoIcon size={15} /> Só pode abrir Pedidos e marcar
                      entregas em aberto como Entregue.
                    </span>
                  )}
                  {row.staffRole === "WAITER" && (
                    <span className="delivery-role-note">
                      <Armchair size={15} /> Acesso exclusivo ao salão, mesas e
                      comandas presenciais.
                    </span>
                  )}
                </div>
                {row.staffRole === "STAFF" && (
                  <div className="staff-permissions">
                    <small>Permissões</small>
                    <div>
                      {STAFF_PERMISSION_OPTIONS.map(
                        ({ permission, Icon, label }) => (
                          <label
                            key={permission}
                            className={
                              row.adminPermissions?.includes(permission)
                                ? "selected"
                                : ""
                            }
                          >
                            <input
                              type="checkbox"
                              checked={Boolean(
                                row.adminPermissions?.includes(permission),
                              )}
                              onChange={() =>
                                toggleRowPermission(row, permission)
                              }
                            />
                            <Icon size={15} />
                            <span>{label}</span>
                          </label>
                        ),
                      )}
                    </div>
                  </div>
                )}
                <div className="staff-actions">
                  <button
                    className="ghost-dark-btn"
                    onClick={() => {
                      const password = window.prompt(
                        `Nova senha temporária para ${row.name}:`,
                      );
                      if (password) updateStaff(row, { password });
                    }}
                  >
                    <KeyRound size={15} /> Redefinir senha
                  </button>
                  {row.staffActive && (
                    <button
                      className="ghost-dark-btn staff-disable"
                      onClick={() => disableStaff(row)}
                    >
                      Desativar
                    </button>
                  )}
                  <button
                    className="subtle-danger staff-delete"
                    onClick={() => deleteStaff(row)}
                  >
                    <Trash2 size={15} /> Excluir
                  </button>
                </div>
              </article>
            ))
          ) : (
            <div className="empty-admin">
              <Users />
              <p>Nenhum funcionário criado.</p>
            </div>
          )}
        </div>
      </section>

      <form
        className="admin-panel compact-form staff-create-form"
        onSubmit={createStaff}
      >
        <div className="panel-title">
          <div>
            <span>Novo acesso</span>
            <h2>Criar funcionário</h2>
          </div>
          <ShieldCheck />
        </div>
        <label>
          Nome
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label>
          E-mail
          <input
            required
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>
        <label>
          Telefone
          <input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </label>
        <label>
          Função
          <select
            value={form.staffRole || "STAFF"}
            onChange={(e) =>
              setForm({
                ...form,
                staffRole: e.target.value,
                permissions:
                  e.target.value === "DELIVERY"
                    ? ["orders"]
                    : e.target.value === "WAITER"
                      ? ["tables", "orders"]
                      : form.permissions,
              })
            }
          >
            <option value="STAFF">Funcionário</option>
            <option value="WAITER">Garçom</option>
            <option value="DELIVERY">Entregador</option>
          </select>
        </label>
        <label>
          Senha temporária
          <div className="password-generate-field">
            <input
              required
              type={showStaffPassword ? "text" : "password"}
              minLength="12"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <button
              type="button"
              className="password-visibility"
              onClick={() => setShowStaffPassword((value) => !value)}
              aria-label={showStaffPassword ? "Ocultar senha" : "Mostrar senha"}
            >
              {showStaffPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
            <button
              type="button"
              className="ghost-dark-btn"
              onClick={generatePassword}
            >
              Gerar
            </button>
          </div>
        </label>
        {form.staffRole === "STAFF" ? (
          <div className="staff-create-permissions">
            <b>Abas permitidas</b>
            <div>
              {STAFF_PERMISSION_OPTIONS.map(({ permission, Icon, label }) => (
                <label
                  key={permission}
                  className={
                    form.permissions.includes(permission) ? "selected" : ""
                  }
                >
                  <input
                    type="checkbox"
                    checked={form.permissions.includes(permission)}
                    onChange={() => toggleFormPermission(permission)}
                  />
                  <Icon size={15} />
                  {label}
                </label>
              ))}
            </div>
          </div>
        ) : form.staffRole === "DELIVERY" ? (
          <div className="delivery-role-create-note">
            <MotoIcon />
            <span>
              <b>Conta de entregador</b>
              <small>
                Terá somente a aba Pedidos e apenas a ação “Marcar como
                entregue”.
              </small>
            </span>
          </div>
        ) : (
          <div className="delivery-role-create-note">
            <Armchair />
            <span>
              <b>Conta de garçom</b>
              <small>
                Terá somente a aba Mesas para abrir comandas, lançar pedidos,
                servir e receber pagamentos.
              </small>
            </span>
          </div>
        )}
        <button className="primary-btn full">
          <Plus size={16} /> Criar conta
        </button>
      </form>
    </div>
  );
}

function PromotionsAdmin({
  rows,
  products,
  modifierGroups,
  form,
  setForm,
  create,
  update,
  remove,
  updateModifierOption,
  uploadMedia,
  imageUploading,
  reorder,
}) {
  const [mode, setMode] = useState("PRODUCTS");
  const selected = products.find((p) => p.id === form.productId);
  const orderedRows = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          Number(a.sortOrder || 0) - Number(b.sortOrder || 0) ||
          String(a.title || "").localeCompare(String(b.title || ""), "pt-BR"),
      ),
    [rows],
  );
  const orderedProducts = useMemo(
    () =>
      [...products].sort(
        (a, b) =>
          Number(a.sortOrder || 0) - Number(b.sortOrder || 0) ||
          String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"),
      ),
    [products],
  );
  const additionalGroups = useMemo(
    () =>
      modifierGroups
        .map((group) => [
          group.name,
          (group.options || [])
            .map((item) => ({
              ...item,
              promoKind: "OPTION",
              groupName: group.name,
              groupSortOrder: group.sortOrder || 0,
            }))
            .sort(
              (a, b) =>
                Number(a.sortOrder || 0) - Number(b.sortOrder || 0) ||
                String(a.name || "").localeCompare(
                  String(b.name || ""),
                  "pt-BR",
                ),
            ),
        ])
        .filter(([, items]) => items.length),
    [modifierGroups],
  );
  const additionalRows = useMemo(
    () => additionalGroups.flatMap(([, items]) => items),
    [additionalGroups],
  );
  function chooseProduct(id) {
    const p = products.find((row) => row.id === id);
    setForm({
      ...form,
      productId: id,
      originalPrice: p?.basePrice ?? p?.price ?? form.originalPrice,
      promoPrice: "",
      sizePrices: {},
      title: form.title || p?.name || "",
    });
  }
  function saveAdditional(row, patch) {
    return updateModifierOption(row, patch);
  }
  function dt(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function toggleAdditionalPromo(row) {
    if (
      !row.promoActive &&
      (row.promoPrice == null ||
        Number(row.promoPrice) >= Number(row.basePrice ?? row.price))
    ) {
      window.alert(
        "Informe primeiro um preço promocional menor que o preço base.",
      );
      return;
    }
    saveAdditional(row, { promoActive: !row.promoActive });
  }
  return (
    <div className="promotions-control">
      <div className="promotion-kind-tabs">
        <button
          type="button"
          className={mode === "PRODUCTS" ? "active" : ""}
          onClick={() => setMode("PRODUCTS")}
        >
          <Pizza size={17} /> Produtos
        </button>
        <button
          type="button"
          className={mode === "ADDITIONALS" ? "active" : ""}
          onClick={() => setMode("ADDITIONALS")}
        >
          <UtensilsCrossed size={17} /> Adicionais
        </button>
      </div>

      {mode === "PRODUCTS" ? (
        <div className="admin-two-column promotions-admin-layout">
          <section className="admin-panel">
            <div className="panel-title">
              <div>
                <span>Vitrine promocional</span>
                <h2>Promoções de produtos</h2>
                <p>
                  A lista abaixo segue somente a prioridade da promoção, sem
                  separar por categoria.
                </p>
              </div>
              <b>{rows.length}</b>
            </div>
            <div className="promotion-admin-list promotion-product-rows">
              {orderedRows.length ? (
                orderedRows.map((r) => (
                  <article
                    key={r.id}
                    className={`promotion-product-editor ${!r.active ? "paused" : ""}`}
                  >
                    <div className="promotion-product-identity">
                      <img
                        src={mediaUrl(r.image) || mediaUrl(r.product?.image)}
                        alt={`Imagem de ${r.product?.name || r.title}`}
                      />
                      <div className="promotion-admin-main">
                        <small>Produto: {r.product?.name}</small>
                        <input
                          aria-label={`Título da promoção de ${r.product?.name || r.title}`}
                          defaultValue={r.title}
                          onBlur={(e) =>
                            e.target.value !== r.title &&
                            update(r, { title: e.target.value })
                          }
                        />
                        <textarea
                          aria-label={`Descrição da promoção de ${r.product?.name || r.title}`}
                          defaultValue={r.subtitle || ""}
                          placeholder="Descrição curta"
                          onBlur={(e) =>
                            e.target.value !== (r.subtitle || "") &&
                            update(r, { subtitle: e.target.value })
                          }
                        />
                      </div>
                    </div>

                    <div className="promotion-pricing-panel">
                      <div className="promotion-section-heading">
                        <span>Preços da oferta</span>
                        <small>
                          Use um valor específico por tamanho ou deixe vazio
                          para aplicar o desconto geral.
                        </small>
                      </div>
                      <div className="promotion-admin-values">
                        <label>
                          <span>Preço base</span>
                          <div className="promo-money-input">
                            <i>R$</i>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              defaultValue={r.originalPrice}
                              onBlur={(e) =>
                                Number(e.target.value) !==
                                  Number(r.originalPrice) &&
                                update(r, {
                                  originalPrice: Number(e.target.value),
                                })
                              }
                            />
                          </div>
                        </label>
                        <label>
                          <span>Preço promocional</span>
                          <div className="promo-money-input featured">
                            <i>R$</i>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              defaultValue={r.promoPrice}
                              onBlur={(e) =>
                                Number(e.target.value) !==
                                  Number(r.promoPrice) &&
                                update(r, {
                                  promoPrice: Number(e.target.value),
                                })
                              }
                            />
                          </div>
                        </label>
                      </div>
                      {(r.product?.availableSizes || []).length > 0 && (
                        <div className="promotion-size-prices compact">
                          {r.product.availableSizes.map((size) => (
                            <label key={size.id}>
                              <span>
                                {size.name}
                                <small>Preço normal: {money(size.price)}</small>
                              </span>
                              <div className="promo-money-input">
                                <i>R$</i>
                                <input
                                  aria-label={`Preço promocional do tamanho ${size.name}`}
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  defaultValue={
                                    r.sizePrices?.[size.sizeId] ?? ""
                                  }
                                  placeholder="Desconto geral"
                                  onBlur={(event) => {
                                    const raw = event.target.value;
                                    const current = { ...(r.sizePrices || {}) };
                                    if (raw === "") delete current[size.sizeId];
                                    else current[size.sizeId] = Number(raw);
                                    update(r, { sizePrices: current });
                                  }}
                                />
                              </div>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="promotion-schedule-fields">
                      <div className="promotion-section-heading">
                        <span>Período da oferta</span>
                        <small>Deixe vazio para manter sem prazo.</small>
                      </div>
                      <label>
                        Início
                        <input
                          type="datetime-local"
                          defaultValue={dt(r.startAt)}
                          onBlur={(e) =>
                            update(r, {
                              startAt: toIsoDateTime(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        Término
                        <input
                          type="datetime-local"
                          defaultValue={dt(r.endAt)}
                          onBlur={(e) =>
                            update(r, { endAt: toIsoDateTime(e.target.value) })
                          }
                        />
                      </label>
                    </div>

                    <div className="promotion-admin-actions">
                      <PriorityArrows
                        value={r.sortOrder}
                        onUp={() => reorder(r, -1)}
                        onDown={() => reorder(r, 1)}
                      />
                      <label
                        className="upload-icon-button media-upload-standard media-upload-mini"
                        title="Trocar imagem"
                      >
                        <Upload size={16} />
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          disabled={imageUploading}
                          onChange={(e) =>
                            uploadMedia(e.target.files?.[0], (url) =>
                              update(r, { image: url }),
                            )
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className={
                          r.active ? "area-toggle active" : "area-toggle"
                        }
                        onClick={() => update(r, { active: !r.active })}
                      >
                        {r.active ? "Ativa" : "Pausada"}
                      </button>
                      <button
                        type="button"
                        className="subtle-danger"
                        onClick={() => remove(r)}
                        title="Remover promoção"
                      >
                        <Trash2 size={16} /> Remover
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="empty-admin">
                  <Megaphone />
                  <p>Nenhuma promoção de produto criada.</p>
                </div>
              )}
            </div>
          </section>
          <form
            className="admin-panel compact-form promotion-create-form"
            onSubmit={create}
          >
            <div className="panel-title">
              <div>
                <span>Nova promoção</span>
                <h2>Adicionar produto em oferta</h2>
              </div>
              <Megaphone />
            </div>
            <label>
              Produto
              <select
                required
                value={form.productId}
                onChange={(e) => chooseProduct(e.target.value)}
              >
                <option value="">Selecione</option>
                {orderedProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Título
              <input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Ex.: Quarta da Pizza"
              />
            </label>
            <label>
              Descrição
              <textarea
                value={form.subtitle}
                onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
                placeholder="Texto curto da oferta"
              />
            </label>
            <div className="two-cols">
              <label>
                Preço base
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.originalPrice}
                  onChange={(e) =>
                    setForm({ ...form, originalPrice: e.target.value })
                  }
                />
              </label>
              <label>
                Preço promocional
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.promoPrice}
                  onChange={(e) =>
                    setForm({ ...form, promoPrice: e.target.value })
                  }
                />
              </label>
            </div>
            {(selected?.availableSizes || []).length > 0 && (
              <div className="promotion-size-prices">
                <b>Preço promocional por tamanho</b>
                <small>
                  Opcional. Quando vazio, o tamanho usa o desconto geral acima.
                </small>
                {selected.availableSizes.map((size) => (
                  <label key={size.id}>
                    <span>{size.name} <small>base {money(size.price)}</small></span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.sizePrices?.[size.sizeId] ?? ""}
                      placeholder="Valor promocional"
                      onChange={(event) =>
                        setForm({
                          ...form,
                          sizePrices: {
                            ...(form.sizePrices || {}),
                            [size.sizeId]: event.target.value,
                          },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            )}
            <div className="two-cols">
              <label>
                Início opcional
                <input
                  type="datetime-local"
                  value={form.startAt}
                  onChange={(e) =>
                    setForm({ ...form, startAt: e.target.value })
                  }
                />
              </label>
              <label>
                Fim opcional
                <input
                  type="datetime-local"
                  value={form.endAt}
                  onChange={(e) => setForm({ ...form, endAt: e.target.value })}
                />
              </label>
            </div>
            <div className="promo-image-preview">
              {form.image || selected?.image ? (
                <img
                  src={mediaUrl(form.image) || mediaUrl(selected?.image)}
                  alt="Prévia"
                />
              ) : (
                <Megaphone />
              )}
            </div>
            <label
              className="upload-icon-button media-upload-standard"
              title="Anexar imagem"
            >
              <Upload size={16} />
              <span>{imageUploading ? "Enviando..." : "Anexar imagem"}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={imageUploading}
                onChange={(e) =>
                  uploadMedia(e.target.files?.[0], (url) =>
                    setForm((x) => ({ ...x, image: url })),
                  )
                }
              />
            </label>
            <label>
              Ou URL da imagem
              <input
                value={form.image}
                onChange={(e) => setForm({ ...form, image: e.target.value })}
              />
            </label>
            <label className="switch-label">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />{" "}
              Publicar promoção
            </label>
            <button className="primary-btn full">
              <Plus size={16} /> Criar promoção
            </button>
          </form>
        </div>
      ) : (
        <section className="admin-panel additional-promotions-panel">
          <div className="panel-title">
            <div>
              <span>Promoções internas</span>
              <h2>Adicionais em promoção</h2>
              <p>
                Os adicionais continuam separados pelo grupo ao qual pertencem,
                mas em linhas compactas para comportar muitos itens.
              </p>
            </div>
            <b>{additionalRows.filter((r) => r.promoActive).length} ativas</b>
          </div>
          <div className="additional-promo-groups">
            {additionalGroups.map(([groupName, groupRows]) => (
              <section
                className="additional-promo-group compact"
                key={groupName}
              >
                <div className="promotion-group-title">
                  <UtensilsCrossed size={15} />
                  <b>{groupName}</b>
                  <span>{groupRows.length}</span>
                </div>
                <div className="additional-promo-compact-list">
                  {groupRows.map((row) => (
                    <article
                      key={`${row.promoKind}-${row.id}`}
                      className={row.promoActive ? "promo-enabled" : ""}
                    >
                      <div className="additional-promo-identity">
                        {row.image ? (
                          <img src={mediaUrl(row.image)} alt="" />
                        ) : (
                          <span>
                            <UtensilsCrossed size={18} />
                          </span>
                        )}
                        <div>
                          <b>{row.name}</b>
                          <small>{row.description || row.groupName}</small>
                          {row.promoActive && <em>Promoção ativa</em>}
                        </div>
                      </div>
                      <div className="additional-promo-prices compact">
                        <label>
                          <span>Preço base</span>
                          <div className="money-input">
                            <small>R$</small>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              defaultValue={row.basePrice ?? row.price ?? 0}
                              onBlur={(e) =>
                                Number(e.target.value) !==
                                  Number(row.basePrice ?? row.price ?? 0) &&
                                saveAdditional(row, {
                                  price: Number(e.target.value),
                                })
                              }
                            />
                          </div>
                        </label>
                        <label>
                          <span>Promocional</span>
                          <div className="money-input">
                            <small>R$</small>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              defaultValue={row.promoPrice ?? ""}
                              placeholder="0,00"
                              onBlur={(e) =>
                                saveAdditional(row, {
                                  promoPrice:
                                    e.target.value === ""
                                      ? null
                                      : Number(e.target.value),
                                })
                              }
                            />
                          </div>
                        </label>
                      </div>
                      <div className="additional-promo-schedule compact">
                        <label>
                          Início
                          <input
                            type="datetime-local"
                            defaultValue={dt(row.promoStartAt)}
                            onBlur={(e) =>
                              saveAdditional(row, {
                                promoStartAt: toIsoDateTime(e.target.value),
                              })
                            }
                          />
                        </label>
                        <label>
                          Término
                          <input
                            type="datetime-local"
                            defaultValue={dt(row.promoEndAt)}
                            onBlur={(e) =>
                              saveAdditional(row, {
                                promoEndAt: toIsoDateTime(e.target.value),
                              })
                            }
                          />
                        </label>
                      </div>
                      <div className="additional-promo-actions">
                        <button
                          type="button"
                          className={
                            row.promoActive
                              ? "area-toggle active"
                              : "area-toggle"
                          }
                          onClick={() => toggleAdditionalPromo(row)}
                        >
                          {row.promoActive ? "Ativa" : "Ativar"}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function DeliveryAdmin({
  settings,
  setSettings,
  areas,
  form,
  setForm,
  create,
  update,
  remove,
  saveSettings,
}) {
  return (
    <>
      <form
        className="admin-panel delivery-pricing-panel"
        onSubmit={saveSettings}
      >
        <div className="panel-title">
          <div>
            <span>Cálculo de entrega</span>
            <h2>Frete, pedido mínimo e entrega grátis</h2>
            <p>
              O CEP identifica cidade e bairro. Quando não existe uma exceção, o
              sistema calcula a rota automaticamente a partir da loja.
            </p>
          </div>
          <Route />
        </div>
        <div className="delivery-mode-options">
          <button
            type="button"
            className={settings.deliveryPricingMode === "AREA" ? "active" : ""}
            onClick={() =>
              setSettings({ ...settings, deliveryPricingMode: "AREA" })
            }
          >
            <MotoIcon />
            <span>
              <b>Exceções fixas</b>
              <small>
                Áreas especiais podem ter taxa, pedido mínimo e entrega grátis
                próprios.
              </small>
            </span>
          </button>
          <button
            type="button"
            className={
              settings.deliveryPricingMode === "DISTANCE" ? "active" : ""
            }
            onClick={() =>
              setSettings({ ...settings, deliveryPricingMode: "DISTANCE" })
            }
          >
            <Route />
            <span>
              <b>Distância automática</b>
              <small>
                Calcula a distância sem precisar cadastrar cada bairro.
              </small>
            </span>
          </button>
        </div>
        {settings.deliveryPricingMode === "AREA" && (
          <div className="delivery-hybrid-switch">
            <label
              className={
                settings.deliveryHybridEnabled !== false
                  ? "payment-toggle active"
                  : "payment-toggle"
              }
            >
              <input
                type="checkbox"
                checked={settings.deliveryHybridEnabled !== false}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    deliveryHybridEnabled: e.target.checked,
                  })
                }
              />
              <span>
                <b>Calcular automaticamente fora das exceções</b>
                <small>
                  Se não houver regra fixa para a região, usa distância
                  automática.
                </small>
              </span>
            </label>
          </div>
        )}
        {(settings.deliveryPricingMode === "DISTANCE" ||
          settings.deliveryHybridEnabled !== false) && (
          <>
            <div className="settings-grid delivery-policy-grid">
              <label>
                Km da saída
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={settings.deliveryMinimumKm ?? 2}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      deliveryMinimumKm: Number(e.target.value),
                    })
                  }
                />
                <small>Distância já incluída no valor da saída.</small>
              </label>
              <label>
                Valor da saída (R$)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={settings.deliveryMinimumFee ?? 0}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      deliveryMinimumFee: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                Km excedente (R$/km)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={settings.deliveryPricePerKm ?? 0}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      deliveryPricePerKm: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                Raio máximo padrão (km)
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={settings.deliveryMaxDistanceKm ?? 0}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      deliveryMaxDistanceKm: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                Pedido mínimo padrão (R$)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={settings.defaultMinimumOrder ?? 0}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      defaultMinimumOrder: Number(e.target.value),
                    })
                  }
                />
                <small>Vale para regiões sem regra específica.</small>
              </label>
              <label>
                Entrega grátis a partir de (R$)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={settings.freeDeliveryThreshold ?? 0}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      freeDeliveryThreshold: Number(e.target.value),
                    })
                  }
                />
                <small>0 desativa a gratuidade global.</small>
              </label>
            </div>
            <div className="delivery-formula-preview">
              <Route />
              <span>
                <b>Como fica o cálculo</b>
                <small>
                  Saída de até {Number(settings.deliveryMinimumKm || 0).toFixed(1)} km:{" "}
                  {money(settings.deliveryMinimumFee || 0)}. Depois: valor da saída
                  + km excedente × {money(settings.deliveryPricePerKm || 0)}/km.
                </small>
              </span>
            </div>
          </>
        )}
        <button className="primary-btn">
          <Save size={16} /> Salvar regras de entrega
        </button>
      </form>

      <div className="admin-two-column delivery-layout">
        <section className="admin-panel">
          <div className="panel-title">
            <div>
              <span>Exceções por região</span>
              <h2>Cidades e bairros especiais</h2>
              <p>
                Use para sobrescrever distância, taxa, pedido mínimo ou valor
                para entrega grátis.
              </p>
            </div>
            <b>{areas.filter((a) => a.active).length} ativas</b>
          </div>
          <div className="delivery-admin-list advanced-delivery-areas">
            {areas.length ? (
              areas.map((a) => (
                <article key={a.id}>
                  <div className="delivery-area-name">
                    <b>{a.neighborhood}</b>
                    <small>
                      {a.city}
                      {a.rawNeighborhood === "*"
                        ? " • cidade inteira"
                        : a.distanceKm != null
                          ? ` • ${Number(a.distanceKm).toFixed(1)} km`
                          : " • taxa fixa"}
                    </small>
                  </div>
                  <label>
                    Distância km
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      defaultValue={a.distanceKm ?? ""}
                      placeholder="auto/fixa"
                      onBlur={(e) =>
                        update(a, {
                          distanceKm:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Taxa fixa
                    <input
                      type="number"
                      step="0.01"
                      defaultValue={a.fee}
                      onBlur={(e) => update(a, { fee: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Pedido mínimo
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={a.minimumOrder || 0}
                      onBlur={(e) =>
                        update(a, { minimumOrder: Number(e.target.value || 0) })
                      }
                    />
                  </label>
                  <label>
                    Grátis a partir
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={a.freeDeliveryThreshold ?? ""}
                      placeholder="global"
                      onBlur={(e) =>
                        update(a, {
                          freeDeliveryThreshold:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className={a.active ? "area-toggle active" : "area-toggle"}
                    onClick={() => update(a, { active: !a.active })}
                  >
                    {a.active ? "Ativa" : "Pausada"}
                  </button>
                  <button
                    type="button"
                    className="subtle-danger"
                    onClick={() => remove(a)}
                  >
                    <Trash2 size={16} />
                  </button>
                </article>
              ))
            ) : (
              <div className="empty-admin">
                <Route />
                <p>
                  Nenhuma exceção cadastrada. O frete continuará automático.
                </p>
              </div>
            )}
          </div>
        </section>
        <form className="admin-panel compact-form" onSubmit={create}>
          <div className="panel-title">
            <div>
              <span>Nova exceção</span>
              <h2>Regra especial de região</h2>
            </div>
            <MapPin />
          </div>
          <label>
            Cidade
            <input
              required
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              placeholder="Ex.: Aracaju - SE"
            />
          </label>
          <label>
            Bairro / área <small>(opcional)</small>
            <input
              value={form.neighborhood}
              onChange={(e) =>
                setForm({ ...form, neighborhood: e.target.value })
              }
              placeholder="Vazio = cidade inteira"
            />
          </label>
          <label>
            Distância manual (km) <small>(opcional)</small>
            <input
              type="number"
              min="0"
              step="0.1"
              value={form.distanceKm}
              onChange={(e) => setForm({ ...form, distanceKm: e.target.value })}
              placeholder="Ex.: 3.2"
            />
          </label>
          <label>
            Taxa fixa (R$)
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={form.fee}
              onChange={(e) => setForm({ ...form, fee: e.target.value })}
            />
          </label>
          <div className="two-cols">
            <label>
              Pedido mínimo
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.minimumOrder || 0}
                onChange={(e) =>
                  setForm({ ...form, minimumOrder: e.target.value })
                }
              />
            </label>
            <label>
              Entrega grátis a partir
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.freeDeliveryThreshold}
                onChange={(e) =>
                  setForm({ ...form, freeDeliveryThreshold: e.target.value })
                }
                placeholder="Opcional"
              />
            </label>
          </div>
          <button className="primary-btn full">
            <Plus size={16} /> Adicionar exceção
          </button>
        </form>
      </div>
    </>
  );
}

function StoreSettings({
  settings,
  setSettings,
  saveSettings,
  lookupStoreCep,
  goProducts,
  uploadMedia,
  imageUploading,
}) {
  const [newPaymentName, setNewPaymentName] = useState("");
  const standardTablePayments = [
    ["CASH", "Dinheiro"],
    ["PIX", "Pix"],
    ["CREDIT", "Cartão de crédito"],
    ["DEBIT", "Cartão de débito"],
  ];
  const tablePaymentMethods = Array.isArray(settings.tablePaymentMethods)
    ? settings.tablePaymentMethods
    : standardTablePayments.map(([value]) => value);
  const customPaymentMethods = Array.isArray(settings.customPaymentMethods)
    ? settings.customPaymentMethods
    : [];
  const updateCustomPayment = (id, patch) =>
    setSettings((current) => ({
      ...current,
      customPaymentMethods: (current.customPaymentMethods || []).map((method) =>
        method.id === id ? { ...method, ...patch } : method,
      ),
    }));
  const addCustomPayment = () => {
    const label = newPaymentName.trim().replace(/\s+/g, " ").slice(0, 40);
    if (label.length < 2) return;
    if (
      customPaymentMethods.some(
        (method) => method.label.toLocaleLowerCase("pt-BR") === label.toLocaleLowerCase("pt-BR"),
      )
    )
      return window.alert("Essa forma de pagamento já foi adicionada.");
    const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    setSettings((current) => ({
      ...current,
      customPaymentMethods: [
        ...(current.customPaymentMethods || []),
        { id, label, active: true, siteEnabled: false, tableEnabled: true },
      ],
    }));
    setNewPaymentName("");
  };
  const removeCustomPayment = (id) =>
    setSettings((current) => ({
      ...current,
      customPaymentMethods: (current.customPaymentMethods || []).filter(
        (method) => method.id !== id,
      ),
    }));
  const toggleTablePayment = (value) =>
    setSettings((current) => {
      const methods = Array.isArray(current.tablePaymentMethods)
        ? current.tablePaymentMethods
        : standardTablePayments.map(([method]) => method);
      return {
        ...current,
        tablePaymentMethods: methods.includes(value)
          ? methods.filter((method) => method !== value)
          : [...methods, value],
      };
    });
  const uploadSetting = (key, file) => {
    const config = {
      logoImage: ["Logo do site", 16 / 7],
      heroImage: ["Imagem principal da home", 1 / 1.05],
      aboutImage: ["Imagem da seção Sobre", 4 / 3],
    }[key] || ["Imagem do site", 1];
    uploadMedia(
      file,
      (url) => setSettings((current) => ({ ...current, [key]: url })),
      config[0],
      config[1],
    );
  };
  function useDeviceLocation() {
    if (!navigator.geolocation)
      return window.alert("Este navegador não disponibiliza localização.");
    navigator.geolocation.getCurrentPosition(
      (position) =>
        setSettings((current) => ({
          ...current,
          storeLatitude: Number(position.coords.latitude.toFixed(7)),
          storeLongitude: Number(position.coords.longitude.toFixed(7)),
          storeGeoSource: "manual",
        })),
      () =>
        window.alert(
          "Não foi possível obter a localização. Você pode informar latitude e longitude manualmente.",
        ),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }
  function useGoogleMapsLink() {
    const raw = String(settings.storeGoogleMapsUrl || "").trim();
    let match = raw.match(/@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/);
    if (!match)
      match = raw.match(/!3d(-?\d{1,2}(?:\.\d+)?).*?!4d(-?\d{1,3}(?:\.\d+)?)/);
    if (!match) {
      try {
        const url = new URL(raw);
        const query = url.searchParams.get("q") ||
          url.searchParams.get("query") || url.searchParams.get("ll") || "";
        match = query.match(/^(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)$/);
      } catch {}
    }
    const latitude = Number(match?.[1]);
    const longitude = Number(match?.[2]);
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 || latitude > 90 ||
      longitude < -180 || longitude > 180
    )
      return window.alert(
        "O link foi salvo, mas não contém coordenadas visíveis. Abra o local no Google Maps, copie o link completo da barra de endereço e tente novamente.",
      );
    setSettings((current) => ({
      ...current,
      storeLatitude: Number(latitude.toFixed(7)),
      storeLongitude: Number(longitude.toFixed(7)),
      storeGeoSource: "google-maps",
    }));
  }
  return (
    <>
      <form className="admin-panel settings-form" onSubmit={saveSettings}>
        <div className="settings-quick-card">
          <div>
            <PackagePlus />
            <span>
              <b>Cardápio</b>
              <small>
                Produtos, promoções, adicionais e categorias ficam reunidos nas
                seções da aba Cardápio.
              </small>
            </span>
          </div>
          <button type="button" className="ghost-dark-btn" onClick={goProducts}>
            Abrir Cardápio
          </button>
        </div>
        <div className="panel-title">
          <div>
            <span>Configurações da loja</span>
            <h2>Atendimento, prazos e pagamentos</h2>
            <p>
              Os comandos de abrir/fechar, entrega e retirada agora ficam na aba
              Operação.
            </p>
          </div>
          <Settings />
        </div>
        <div className="store-location-card">
          <div className="panel-title compact">
            <div>
              <span>Origem do frete</span>
              <h3>Localização da unidade</h3>
              <p>
                Essa é a posição usada para calcular a distância automática até
                os bairros dos clientes.
              </p>
            </div>
            <MapPin />
          </div>
          <div className="store-location-grid">
            <label>
              CEP da loja
              <input
                inputMode="numeric"
                placeholder="00000-000"
                value={settings.storePostalCode || ""}
                onChange={(e) =>
                  setSettings({ ...settings, storePostalCode: e.target.value })
                }
              />
            </label>
            <label>
              Latitude
              <input
                type="number"
                step="0.0000001"
                value={settings.storeLatitude ?? ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    storeLatitude:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </label>
            <label>
              Longitude
              <input
                type="number"
                step="0.0000001"
                value={settings.storeLongitude ?? ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    storeLongitude:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </label>
          </div>
          <label className="store-maps-link">
            Link do Google Maps
            <input
              type="url"
              placeholder="https://www.google.com/maps/..."
              value={settings.storeGoogleMapsUrl || ""}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  storeGoogleMapsUrl: event.target.value,
                })
              }
            />
            <small>
              Cole o link completo do ponto da unidade para salvar e, quando o
              link trouxer latitude/longitude, aplicar as coordenadas.
            </small>
          </label>
          <div className="store-location-actions">
            <button
              type="button"
              className="ghost-dark-btn"
              onClick={lookupStoreCep}
            >
              <MapPin size={16} /> Localizar pelo CEP
            </button>
            <button
              type="button"
              className="ghost-dark-btn"
              onClick={useDeviceLocation}
            >
              <Route size={16} /> Usar localização deste aparelho
            </button>
            <button
              type="button"
              className="ghost-dark-btn"
              disabled={!settings.storeGoogleMapsUrl}
              onClick={useGoogleMapsLink}
            >
              <MapPin size={16} /> Aplicar link do Maps
            </button>
            {String(settings.storeGoogleMapsUrl || "").startsWith("https://") && (
              <a
                className="ghost-dark-btn"
                href={settings.storeGoogleMapsUrl}
                target="_blank"
                rel="noreferrer"
              >
                <Route size={16} /> Conferir no mapa
              </a>
            )}
            <span>
              <b>
                {settings.storeLatitude != null &&
                settings.storeLongitude != null
                  ? "Localização configurada"
                  : "Localização ainda não configurada"}
              </b>
              <small>
                {settings.storeGeoSource
                  ? `Origem: ${settings.storeGeoSource}`
                  : "Salve coordenadas confiáveis para melhorar o cálculo de frete."}
              </small>
            </span>
          </div>
        </div>
        <div className="payment-admin-box">
          <div className="panel-title compact">
            <div>
              <span>Formas aceitas agora</span>
              <h3>Pagamento</h3>
            </div>
            <CreditCard />
          </div>
          <div className="payment-toggle-grid">
            <label
              className={
                settings.cashPaymentEnabled
                  ? "payment-toggle active"
                  : "payment-toggle"
              }
            >
              <input
                type="checkbox"
                checked={Boolean(settings.cashPaymentEnabled)}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    cashPaymentEnabled: e.target.checked,
                  })
                }
              />
              <span>
                <b>Dinheiro</b>
                <small>
                  Pedido entra direto na operação; pagamento acontece na
                  entrega/retirada.
                </small>
              </span>
            </label>
            <label
              className={
                settings.onlinePaymentEnabled
                  ? "payment-toggle active"
                  : "payment-toggle"
              }
            >
              <input
                type="checkbox"
                checked={Boolean(settings.onlinePaymentEnabled)}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    onlinePaymentEnabled: e.target.checked,
                  })
                }
              />
              <span>
                <b>Pagamento online</b>
                <small>
                  {settings.onlinePaymentConfigured
                    ? "Mercado Pago configurado. O pedido só aparece para a loja após aprovação."
                    : "Configure Access Token, chave do webhook e URLs HTTPS públicas no backend."}
                </small>
              </span>
            </label>
          </div>
          <div className="custom-payment-manager">
            <div>
              <b>Formas padrão para mesas</b>
              <small>
                As quatro opções começam ativas. Desmarque qualquer uma para
                removê-la do fechamento das comandas.
              </small>
            </div>
            <div className="table-standard-payment-grid">
              {standardTablePayments.map(([value, label]) => (
                <label key={value}>
                  <input
                    type="checkbox"
                    checked={tablePaymentMethods.includes(value)}
                    onChange={() => toggleTablePayment(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
            <div>
              <b>Outras formas de pagamento</b>
              <small>
                Disponíveis somente para fechar comandas de mesa. No site,
                permanecem apenas Dinheiro, Pix e cartão pelo pagamento online.
              </small>
            </div>
            <div className="custom-payment-add">
              <input
                value={newPaymentName}
                maxLength={40}
                placeholder="Ex.: Vale-refeição"
                onChange={(event) => setNewPaymentName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addCustomPayment();
                  }
                }}
              />
              <button
                type="button"
                className="ghost-dark-btn"
                disabled={newPaymentName.trim().length < 2 || customPaymentMethods.length >= 20}
                onClick={addCustomPayment}
              >
                <Plus size={16} /> Adicionar
              </button>
            </div>
            {customPaymentMethods.length > 0 && (
              <div className="custom-payment-list">
                {customPaymentMethods.map((method) => (
                  <article key={method.id}>
                    <div className="custom-payment-name">
                      <input
                        type="checkbox"
                        aria-label={`Ativar ${method.label}`}
                        checked={method.active !== false}
                        onChange={(event) =>
                          updateCustomPayment(method.id, { active: event.target.checked })
                        }
                      />
                      <input
                        value={method.label}
                        maxLength={40}
                        aria-label="Nome da forma de pagamento"
                        onChange={(event) =>
                          updateCustomPayment(method.id, { label: event.target.value })
                        }
                      />
                    </div>
                    <label>
                      <input
                        type="checkbox"
                        checked={method.tableEnabled !== false}
                        onChange={(event) =>
                          updateCustomPayment(method.id, {
                            tableEnabled: event.target.checked,
                          })
                        }
                      />
                      Usar nas mesas
                    </label>
                    <button
                      type="button"
                      className="icon-action danger"
                      title={`Remover ${method.label}`}
                      onClick={() => removeCustomPayment(method.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="retention-policy-card">
          <div className="panel-title compact">
            <div>
              <span>Privacidade e retenção</span>
              <h3>Exclusão automática de dados</h3>
              <p>
                A limpeza é executada em segundo plano. Relatórios continuam
                íntegros durante o prazo fiscal definido.
              </p>
            </div>
            <ShieldCheck />
          </div>
          <div className="retention-policy-grid">
            <span><b>12 horas</b><small>Comandas encerradas na tela</small></span>
            <span><b>2 semanas</b><small>Carrinho e sessões abandonadas</small></span>
            <span><b>1 semana</b><small>Logs técnicos e de integração</small></span>
            <span><b>6 meses</b><small>Endereços e telefones</small></span>
            <span><b>5 anos</b><small>Pedidos, faturamento, pagamentos e fechamentos</small></span>
          </div>
        </div>
        <div className="settings-grid">
          <label>
            Nome da loja
            <input
              value={settings.storeName || ""}
              onChange={(e) =>
                setSettings({ ...settings, storeName: e.target.value })
              }
            />
          </label>
          <label>
            Telefone <small>(vazio = oculto)</small>
            <input
              value={settings.phone || ""}
              onChange={(e) =>
                setSettings({ ...settings, phone: e.target.value })
              }
            />
          </label>
          <label className="span-2">
            Endereço público da loja
            <input
              value={settings.address || ""}
              onChange={(e) =>
                setSettings({ ...settings, address: e.target.value })
              }
            />
          </label>
          <label>
            WhatsApp <small>(vazio = oculto)</small>
            <input
              value={settings.whatsappPrimary || ""}
              onChange={(e) =>
                setSettings({ ...settings, whatsappPrimary: e.target.value })
              }
            />
          </label>
          <label>
            WhatsApp 2
            <input
              value={settings.whatsappSecondary || ""}
              onChange={(e) =>
                setSettings({ ...settings, whatsappSecondary: e.target.value })
              }
            />
            <span className="inline-visibility-toggle">
              <input
                type="checkbox"
                checked={Boolean(settings.whatsappSecondaryVisible)}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    whatsappSecondaryVisible: e.target.checked,
                  })
                }
              />{" "}
              Exibir no site
            </span>
          </label>
          <label>
            Instagram <small>(vazio = oculto)</small>
            <input
              value={settings.instagram || ""}
              onChange={(e) =>
                setSettings({ ...settings, instagram: e.target.value })
              }
            />
          </label>
          <label>
            URL do Instagram
            <input
              value={settings.instagramUrl || ""}
              onChange={(e) =>
                setSettings({ ...settings, instagramUrl: e.target.value })
              }
            />
          </label>
          <label>
            Produtos na home
            <input
              type="number"
              min="4"
              max="8"
              value={settings.homeProductLimit || 8}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  homeProductLimit: Number(e.target.value),
                })
              }
            />
          </label>
          <label>
            Prazo mínimo (min)
            <input
              type="number"
              min="5"
              max="300"
              value={settings.estimatedDeliveryMin || 30}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  estimatedDeliveryMin: Number(e.target.value),
                })
              }
            />
            <small>
              Somado ao horário da compra/agendamento para formar a previsão.
            </small>
          </label>
          <label>
            Prazo máximo (min)
            <input
              type="number"
              min="5"
              max="300"
              value={settings.estimatedDeliveryMax || 45}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  estimatedDeliveryMax: Number(e.target.value),
                })
              }
            />
            <small>Ex.: compra 18:00 + 30–45 min = 18:30–18:45.</small>
          </label>
          <label>
            Alerta antes do prazo (min)
            <input
              type="number"
              min="1"
              max="180"
              value={settings.lateWarningMinutes || 30}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  lateWarningMinutes: Number(e.target.value),
                })
              }
            />
            <small>
              Pedidos ganham um alerta no painel quando entrarem nessa janela.
            </small>
          </label>
          <label className="span-2">
            Descrição do cardápio
            <textarea
              value={settings.menuSubtitle || ""}
              onChange={(e) =>
                setSettings({ ...settings, menuSubtitle: e.target.value })
              }
            />
          </label>
        </div>
        <section className="store-automation-card">
          <div className="panel-title compact">
            <div>
              <span>Automação</span>
              <h3>Operação automática</h3>
              <p>
                Ative recursos de atendimento, cozinha, entrega e
                relacionamento.
              </p>
            </div>
            <Activity />
          </div>
          <div className="automation-toggle-grid">
            <label
              className={
                settings.newOrderSoundEnabled !== false
                  ? "payment-toggle active"
                  : "payment-toggle"
              }
            >
              <input
                type="checkbox"
                checked={settings.newOrderSoundEnabled !== false}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    newOrderSoundEnabled: e.target.checked,
                  })
                }
              />
              <span>
                <b>Som de novo pedido</b>
                <small>
                  Toca na tela Cozinha quando chegar um pedido novo.
                </small>
              </span>
            </label>
            <label
              className={
                settings.browserNotificationsEnabled !== false
                  ? "payment-toggle active"
                  : "payment-toggle"
              }
            >
              <input
                type="checkbox"
                checked={settings.browserNotificationsEnabled !== false}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    browserNotificationsEnabled: e.target.checked,
                  })
                }
              />
              <span>
                <b>Notificação no navegador</b>
                <small>
                  O navegador ainda pedirá permissão neste aparelho.
                </small>
              </span>
            </label>
            <label
              className={
                settings.autoPrintEnabled
                  ? "payment-toggle active"
                  : "payment-toggle"
              }
            >
              <input
                type="checkbox"
                checked={Boolean(settings.autoPrintEnabled)}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    autoPrintEnabled: e.target.checked,
                  })
                }
              />
              <span>
                <b>Impressão automática</b>
                <small>
                  Ao chegar pedido novo, abre a impressão na tela Cozinha.
                </small>
              </span>
            </label>
            <label
              className={
                settings.smartCourierQueueEnabled !== false
                  ? "payment-toggle active"
                  : "payment-toggle"
              }
            >
              <input
                type="checkbox"
                checked={settings.smartCourierQueueEnabled !== false}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    smartCourierQueueEnabled: e.target.checked,
                  })
                }
              />
              <span>
                <b>Fila inteligente de entregadores</b>
                <small>
                  Ao sair para entrega, atribui o entregador ativo com menos
                  corridas em aberto.
                </small>
              </span>
            </label>
            <label
              className={
                settings.cartRecommendationsEnabled !== false
                  ? "payment-toggle active"
                  : "payment-toggle"
              }
            >
              <input
                type="checkbox"
                checked={settings.cartRecommendationsEnabled !== false}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    cartRecommendationsEnabled: e.target.checked,
                  })
                }
              />
              <span>
                <b>Recomendação na sacola</b>
                <small>Sugere produtos que costumam ser comprados junto.</small>
              </span>
            </label>
            <label
              className={
                settings.whatsappAutoEnabled
                  ? "payment-toggle active"
                  : "payment-toggle"
              }
            >
              <input
                type="checkbox"
                checked={Boolean(settings.whatsappAutoEnabled)}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    whatsappAutoEnabled: e.target.checked,
                  })
                }
              />
              <span>
                <b>WhatsApp automático</b>
                <small>
                  {settings.whatsappWebhookConfigured
                    ? "Webhook de mensageria configurado."
                    : "Requer WHATSAPP_WEBHOOK_URL no backend para enviar de verdade."}
                </small>
              </span>
            </label>
          </div>
          {settings.whatsappAutoEnabled && (
            <div className="whatsapp-template-grid">
              <label>
                Mensagem de pedido recebido
                <textarea
                  value={settings.whatsappOrderCreatedTemplate || ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      whatsappOrderCreatedTemplate: e.target.value,
                    })
                  }
                />
                <small>
                  Variáveis: {"{cliente}"}, {"{pedido}"}, {"{total}"},{" "}
                  {"{status}"}
                </small>
              </label>
              <label>
                Mensagem de atualização
                <textarea
                  value={settings.whatsappStatusTemplate || ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      whatsappStatusTemplate: e.target.value,
                    })
                  }
                />
                <small>
                  O envio real depende de WHATSAPP_WEBHOOK_URL no backend.
                </small>
              </label>
            </div>
          )}
        </section>
        <section className="store-customer-rules">
          <div className="panel-title compact">
            <div>
              <span>Relacionamento</span>
              <h3>Clientes VIP e inativos</h3>
            </div>
            <Users />
          </div>
          <div className="settings-grid">
            <label>
              VIP a partir de pedidos
              <input
                type="number"
                min="1"
                value={settings.vipMinOrders || 8}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    vipMinOrders: Number(e.target.value),
                  })
                }
              />
            </label>
            <label>
              VIP a partir de gasto (R$)
              <input
                type="number"
                min="0"
                step="0.01"
                value={settings.vipMinSpend || 400}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    vipMinSpend: Number(e.target.value),
                  })
                }
              />
            </label>
            <label>
              Cliente inativo após (dias)
              <input
                type="number"
                min="1"
                value={settings.inactiveCustomerDays || 60}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    inactiveCustomerDays: Number(e.target.value),
                  })
                }
              />
            </label>
          </div>
        </section>
        <button className="primary-btn">
          <Save size={16} /> Salvar configurações
        </button>
      </form>

      <form
        className="admin-panel settings-form visual-control-panel"
        onSubmit={saveSettings}
      >
        <div className="panel-title">
          <div>
            <span>Editor da fachada</span>
            <h2>Textos e imagens do site</h2>
            <p>Altere a apresentação da home sem editar código.</p>
          </div>
          <Palette />
        </div>
        <div className="logo-admin-setting">
          <div>
            <b>Logo do site</b>
            <small>
              Use uma imagem com fundo compatível com o cabeçalho preto.
            </small>
          </div>
          <div className="site-logo-preview">
            <img
              src={
                mediaUrl(settings.logoImage) || "/images/master-pizzaria-logo.png"
              }
              alt="Logo"
            />
          </div>
          <label
            className="upload-icon-button media-upload-standard"
            title="Trocar logo"
          >
            <Upload size={17} />
            <span>{imageUploading ? "Enviando..." : "Anexar imagem"}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={imageUploading}
              onChange={(e) => uploadSetting("logoImage", e.target.files?.[0])}
            />
          </label>
          <input
            className="logo-url-input"
            placeholder="Ou URL da logo"
            value={settings.logoImage || ""}
            onChange={(e) =>
              setSettings({ ...settings, logoImage: e.target.value })
            }
          />
        </div>
        <div className="visual-editor-grid">
          <div className="visual-editor-fields">
            <label>
              Título do cardápio
              <input
                value={settings.menuTitle || ""}
                onChange={(e) =>
                  setSettings({ ...settings, menuTitle: e.target.value })
                }
              />
            </label>
            <label>
              Texto pequeno do destaque
              <input
                value={settings.heroEyebrow || ""}
                onChange={(e) =>
                  setSettings({ ...settings, heroEyebrow: e.target.value })
                }
              />
            </label>
            <label>
              Título principal
              <textarea
                value={settings.heroTitle || ""}
                onChange={(e) =>
                  setSettings({ ...settings, heroTitle: e.target.value })
                }
              />
            </label>
            <label>
              Descrição principal
              <textarea
                value={settings.heroSubtitle || ""}
                onChange={(e) =>
                  setSettings({ ...settings, heroSubtitle: e.target.value })
                }
              />
            </label>
            <div className="hero-stamp-editor">
              <b>Cartão flutuante da imagem</b>
              <label>
                Título
                <input
                  value={settings.heroStampTitle ?? "Massa artesanal"}
                  onChange={(e) =>
                    setSettings({ ...settings, heroStampTitle: e.target.value })
                  }
                />
              </label>
              <label>
                Descrição
                <input
                  value={
                    settings.heroStampText ?? "preparo cuidadoso em cada pedido"
                  }
                  onChange={(e) =>
                    setSettings({ ...settings, heroStampText: e.target.value })
                  }
                />
              </label>
              <small>
                Deixe os dois campos vazios para esconder o cartão da página
                inicial.
              </small>
            </div>
          </div>
          <div className="admin-image-setting">
            <b>Imagem principal</b>
            <div className="site-image-preview">
              {settings.heroImage ? (
                <img src={mediaUrl(settings.heroImage)} alt="Destaque" />
              ) : (
                <ImagePlus />
              )}
            </div>
            <label
              className="upload-icon-button media-upload-standard"
              title="Anexar imagem"
            >
              <Upload size={17} />
              <span>{imageUploading ? "Enviando..." : "Anexar imagem"}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={imageUploading}
                onChange={(e) =>
                  uploadSetting("heroImage", e.target.files?.[0])
                }
              />
            </label>
            <input
              placeholder="Ou URL da imagem"
              value={settings.heroImage || ""}
              onChange={(e) =>
                setSettings({ ...settings, heroImage: e.target.value })
              }
            />
          </div>
        </div>
        <div className="visual-editor-grid about-editor">
          <div className="visual-editor-fields">
            <label>
              Etiqueta do Sobre
              <input
                value={settings.aboutEyebrow || ""}
                onChange={(e) =>
                  setSettings({ ...settings, aboutEyebrow: e.target.value })
                }
              />
            </label>
            <label>
              Título do Sobre
              <textarea
                value={settings.aboutTitle || ""}
                onChange={(e) =>
                  setSettings({ ...settings, aboutTitle: e.target.value })
                }
              />
            </label>
            <label>
              Texto do Sobre
              <textarea
                value={settings.aboutText || ""}
                onChange={(e) =>
                  setSettings({ ...settings, aboutText: e.target.value })
                }
              />
            </label>
          </div>
          <div className="admin-image-setting">
            <b>Imagem do Sobre</b>
            <div className="site-image-preview">
              {settings.aboutImage ? (
                <img src={mediaUrl(settings.aboutImage)} alt="Sobre" />
              ) : (
                <ImagePlus />
              )}
            </div>
            <label
              className="upload-icon-button media-upload-standard"
              title="Anexar imagem"
            >
              <Upload size={17} />
              <span>{imageUploading ? "Enviando..." : "Anexar imagem"}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={imageUploading}
                onChange={(e) =>
                  uploadSetting("aboutImage", e.target.files?.[0])
                }
              />
            </label>
            <input
              placeholder="Ou URL da imagem"
              value={settings.aboutImage || ""}
              onChange={(e) =>
                setSettings({ ...settings, aboutImage: e.target.value })
              }
            />
          </div>
        </div>
        <div className="settings-grid">
          <label>
            Título das promoções
            <input
              value={settings.promotionsTitle || ""}
              onChange={(e) =>
                setSettings({ ...settings, promotionsTitle: e.target.value })
              }
            />
          </label>
          <label>
            Subtítulo das promoções
            <input
              value={settings.promotionsSubtitle || ""}
              onChange={(e) =>
                setSettings({ ...settings, promotionsSubtitle: e.target.value })
              }
            />
          </label>
          <label className="span-2">
            Texto do rodapé
            <textarea
              value={settings.footerText || ""}
              onChange={(e) =>
                setSettings({ ...settings, footerText: e.target.value })
              }
            />
          </label>
        </div>
        <button className="primary-btn">
          <Save size={16} /> Salvar aparência
        </button>
      </form>

      <form className="admin-panel settings-form" onSubmit={saveSettings}>
        <div className="panel-title">
          <div>
            <span>Horário do sistema</span>
            <h2>Fuso horário</h2>
            <p>
              O frete não depende mais das coordenadas de um CEP. A distância é
              configurada por bairro na aba Entregas.
            </p>
          </div>
          <Clock3 />
        </div>
        <div className="settings-grid">
          <label>
            Fuso horário
            <input
              value={settings.timezone || "America/Maceio"}
              onChange={(e) =>
                setSettings({ ...settings, timezone: e.target.value })
              }
            />
          </label>
        </div>
        <button className="primary-btn">
          <Save size={16} /> Salvar fuso horário
        </button>
      </form>
    </>
  );
}

function CategoriesAdmin({
  categories,
  subcategories,
  categoryForm,
  setCategoryForm,
  subForm,
  setSubForm,
  createCategory,
  updateCategory,
  removeCategory,
  createSub,
  updateSub,
  removeSub,
  reorderCategory,
  reorderSub,
}) {
  return (
    <div className="categories-unified-admin">
      <div className="admin-two-column">
        <section className="admin-panel">
          <div className="panel-title">
            <div>
              <span>Estrutura do cardápio</span>
              <h2>Categorias e subcategorias</h2>
              <p>
                As subcategorias ficam dentro da categoria e só aparecem no site
                quando existirem.
              </p>
            </div>
            <b>{categories.length}</b>
          </div>
          <div className="category-tree-list">
            {categories.map((category) => (
              <article className="category-tree-card" key={category.id}>
                <div className="category-tree-head">
                  <div>
                    <b>{category.name}</b>
                    <small>
                      /{category.slug} • {category.productsCount || 0} produtos
                    </small>
                  </div>
                  <PriorityArrows
                    value={category.sortOrder}
                    onUp={() => reorderCategory(category, -1)}
                    onDown={() => reorderCategory(category, 1)}
                  />
                  <button
                    className={
                      category.active ? "area-toggle active" : "area-toggle"
                    }
                    onClick={() =>
                      updateCategory(category, { active: !category.active })
                    }
                  >
                    {category.active ? "Visível" : "Oculta"}
                  </button>
                  <button
                    className="subtle-danger"
                    onClick={() => removeCategory(category)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="subcategory-inline-list">
                  {subcategories
                    .filter((sub) => sub.categoryId === category.id)
                    .map((sub) => (
                      <div key={sub.id}>
                        <span>
                          <b>{sub.name}</b>
                          <small>
                            Prioridade {sub.sortOrder} •{" "}
                            {sub.productsCount || 0} produtos
                          </small>
                        </span>
                        <PriorityArrows
                          value={sub.sortOrder}
                          onUp={() => reorderSub(sub, -1)}
                          onDown={() => reorderSub(sub, 1)}
                        />
                        <button
                          className={
                            sub.active
                              ? "mini-visibility active"
                              : "mini-visibility"
                          }
                          onClick={() =>
                            updateSub(sub, { active: !sub.active })
                          }
                        >
                          {sub.active ? "Visível" : "Oculta"}
                        </button>
                        <button
                          className="subtle-danger"
                          onClick={() => removeSub(sub)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                </div>
              </article>
            ))}
          </div>
        </section>
        <div className="admin-stack">
          <form className="admin-panel compact-form" onSubmit={createCategory}>
            <div className="panel-title">
              <div>
                <span>Nova categoria</span>
                <h2>Adicionar categoria</h2>
              </div>
              <Tags />
            </div>
            <label>
              Nome
              <input
                required
                value={categoryForm.name}
                onChange={(e) =>
                  setCategoryForm({
                    ...categoryForm,
                    name: e.target.value,
                    slug: slugify(e.target.value),
                  })
                }
                placeholder="Ex.: Pizzas"
              />
            </label>
            <label>
              Slug
              <input
                required
                value={categoryForm.slug}
                onChange={(e) =>
                  setCategoryForm({ ...categoryForm, slug: e.target.value })
                }
              />
            </label>
            <small className="priority-create-note">
              A categoria será adicionada no fim. Depois use as setas para mudar
              a posição.
            </small>
            <button className="primary-btn full">
              <Plus size={16} /> Adicionar categoria
            </button>
          </form>
          <form className="admin-panel compact-form" onSubmit={createSub}>
            <div className="panel-title">
              <div>
                <span>Dentro da categoria</span>
                <h2>Adicionar subcategoria</h2>
              </div>
              <Tags />
            </div>
            <label>
              Categoria
              <select
                required
                value={subForm.categoryId}
                onChange={(e) =>
                  setSubForm({ ...subForm, categoryId: e.target.value })
                }
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nome
              <input
                required
                value={subForm.name}
                onChange={(e) =>
                  setSubForm({
                    ...subForm,
                    name: e.target.value,
                    slug: slugify(e.target.value),
                  })
                }
                placeholder="Ex.: Pizza grande"
              />
            </label>
            <label>
              Slug
              <input
                required
                value={subForm.slug}
                onChange={(e) =>
                  setSubForm({ ...subForm, slug: e.target.value })
                }
              />
            </label>
            <small className="priority-create-note">
              A subcategoria será adicionada no fim da categoria selecionada.
            </small>
            <button className="primary-btn full">
              <Plus size={16} /> Adicionar subcategoria
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function SizesAdmin({ rows, form, setForm, create, update, remove, reorder }) {
  return (
    <div className="admin-two-column">
      <section className="admin-panel">
        <div className="panel-title">
          <div>
            <span>Configuração de pizzas</span>
            <h2>Tamanhos</h2>
            <p>
              Crie os tamanhos uma vez e depois defina um preço diferente para
              cada produto.
            </p>
          </div>
          <b>{rows.length}</b>
        </div>
        <div className="category-admin-list">
          {rows.map((row) => (
            <article key={row.id} className={!row.active ? "paused" : ""}>
              <div>
                <b>{row.name}</b>
                <small>
                  {row.diameterCm ? `${row.diameterCm} cm • ` : ""}
                  {row.slug}
                </small>
              </div>
              <PriorityArrows
                value={row.sortOrder}
                onUp={() => reorder(row, -1)}
                onDown={() => reorder(row, 1)}
              />
              <button
                className={row.active ? "area-toggle active" : "area-toggle"}
                onClick={() => update(row, { active: !row.active })}
              >
                {row.active ? "Ativo" : "Pausado"}
              </button>
              <button className="subtle-danger" onClick={() => remove(row)}>
                <Trash2 size={15} />
              </button>
            </article>
          ))}
        </div>
      </section>
      <form className="admin-panel compact-form" onSubmit={create}>
        <div className="panel-title">
          <div>
            <span>Novo tamanho</span>
            <h2>Criar tamanho de pizza</h2>
          </div>
          <Layers3 />
        </div>
        <label>
          Nome
          <input
            required
            value={form.name}
            onChange={(e) =>
              setForm({
                ...form,
                name: e.target.value,
                slug: form.slug || slugify(e.target.value),
              })
            }
            placeholder="Ex.: Grande"
          />
        </label>
        <label>
          Slug
          <input
            required
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            placeholder="grande"
          />
        </label>
        <label>
          Diâmetro em cm
          <input
            type="number"
            min="1"
            value={form.diameterCm}
            onChange={(e) => setForm({ ...form, diameterCm: e.target.value })}
            placeholder="35"
          />
        </label>
        <button className="primary-btn full">
          <Plus size={16} /> Criar tamanho
        </button>
      </form>
    </div>
  );
}

function AlterationsAdmin({
  modifierGroups,
  modifierGroupForm,
  setModifierGroupForm,
  modifierOptionForms,
  setModifierOptionForms,
  headers,
  notify,
  fail,
  reload,
  onCatalogChanged,
  requestCrop,
  imageUploading,
  reorderGroup,
  reorderOption,
}) {
  async function createGroup(e) {
    e.preventDefault();
    try {
      await api.post(
        "/admin/modifier-groups",
        {
          ...modifierGroupForm,
          minSelect: Number(modifierGroupForm.minSelect || 0),
          maxSelect: Number(modifierGroupForm.maxSelect || 1),
          sortOrder: Number(
            modifierGroupForm.sortOrder || modifierGroups.length + 1,
          ),
        },
        headers,
      );
      setModifierGroupForm({
        name: "",
        description: "",
        required: false,
        minSelect: 0,
        maxSelect: 1,
        sortOrder: modifierGroups.length + 1,
      });
      notify("Grupo de adicionais criado.");
      await reload();
      await onCatalogChanged?.();
    } catch (err) {
      fail(err, "Não foi possível criar o grupo.");
    }
  }
  async function updateGroup(group, patch) {
    try {
      await api.patch(`/admin/modifier-groups/${group.id}`, patch, headers);
      await reload();
      await onCatalogChanged?.();
    } catch (err) {
      fail(err, "Não foi possível atualizar o grupo.");
    }
  }
  async function removeGroup(group) {
    if (!window.confirm(`Remover ou pausar o grupo “${group.name}”?`)) return;
    try {
      await api.delete(`/admin/modifier-groups/${group.id}`, headers);
      notify("Grupo atualizado.");
      await reload();
      await onCatalogChanged?.();
    } catch (err) {
      fail(err, "Não foi possível remover o grupo.");
    }
  }
  function optionForm(group) {
    return (
      modifierOptionForms[group.id] || {
        name: "",
        description: "",
        price: "",
        image: "",
        sortOrder: (group.options?.length || 0) + 1,
      }
    );
  }
  function setOptionForm(group, patch) {
    setModifierOptionForms((current) => ({
      ...current,
      [group.id]: { ...optionForm(group), ...patch },
    }));
  }
  async function createOption(e, group) {
    e.preventDefault();
    const form = optionForm(group);
    try {
      await api.post(
        `/admin/modifier-groups/${group.id}/options`,
        {
          ...form,
          price: Number(form.price || 0),
          sortOrder: Number(form.sortOrder || (group.options?.length || 0) + 1),
        },
        headers,
      );
      setModifierOptionForms((current) => ({
        ...current,
        [group.id]: {
          name: "",
          description: "",
          price: "",
          image: "",
          sortOrder: (group.options?.length || 0) + 2,
        },
      }));
      notify("Opção adicionada.");
      await reload();
      await onCatalogChanged?.();
    } catch (err) {
      fail(err, "Não foi possível adicionar a opção.");
    }
  }
  async function updateOption(option, patch) {
    try {
      await api.patch(`/admin/modifier-options/${option.id}`, patch, headers);
      await reload();
      await onCatalogChanged?.();
    } catch (err) {
      fail(err, "Não foi possível atualizar a opção.");
    }
  }
  async function removeOption(option) {
    if (!window.confirm(`Remover ou pausar “${option.name}”?`)) return;
    try {
      await api.delete(`/admin/modifier-options/${option.id}`, headers);
      notify("Opção atualizada.");
      await reload();
      await onCatalogChanged?.();
    } catch (err) {
      fail(err, "Não foi possível remover a opção.");
    }
  }
  function uploadOptionImage(group, file) {
    if (!file) return;
    requestCrop(
      file,
      (url) => setOptionForm(group, { image: url }),
      `Imagem do adicional`,
      4 / 3,
    );
  }
  function replaceOptionImage(option, file) {
    if (!file) return;
    requestCrop(
      file,
      (url) => updateOption(option, { image: url }),
      `Imagem de ${option.name}`,
      4 / 3,
    );
  }
  return (
    <div className="admin-two-column alterations-layout">
      <section className="admin-panel">
        <div className="panel-title">
          <div>
            <span>Personalização</span>
            <h2>Adicionais</h2>
            <p>
              Crie grupos de adicionais e suas opções. “Borda da pizza” é apenas
              um grupo de adicional padrão, não uma categoria do cardápio.
            </p>
          </div>
          <b>{modifierGroups.length}</b>
        </div>
        <div className="modifier-admin-list compact-modifier-admin">
          {modifierGroups.map((group) => (
            <article key={group.id} className={!group.active ? "paused" : ""}>
              <div className="modifier-group-head">
                <div>
                  <b>{group.name}</b>
                  <small>
                    {group.description || "Sem descrição"} •{" "}
                    {group.required ? "Obrigatório" : "Opcional"}
                  </small>
                </div>
                <PriorityArrows
                  value={group.sortOrder}
                  onUp={() => reorderGroup(group, -1)}
                  onDown={() => reorderGroup(group, 1)}
                />
                <button
                  className={
                    group.active ? "area-toggle active" : "area-toggle"
                  }
                  onClick={() => updateGroup(group, { active: !group.active })}
                >
                  {group.active ? "Ativo" : "Pausado"}
                </button>
                <button
                  className="subtle-danger"
                  onClick={() => removeGroup(group)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <div className="modifier-option-admin-list">
                {(group.options || []).map((option) => (
                  <div
                    key={option.id}
                    className={`modifier-option-admin-row ${!option.active ? "paused" : ""}`}
                  >
                    <label
                      className="modifier-option-photo"
                      title="Clique para trocar a imagem"
                    >
                      {option.image ? (
                        <img src={mediaUrl(option.image)} alt={option.name} />
                      ) : (
                        <span className="modifier-placeholder">
                          <ImagePlus size={18} />
                        </span>
                      )}
                      <i>
                        <Upload size={12} />
                      </i>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={imageUploading}
                        onChange={(e) =>
                          replaceOptionImage(option, e.target.files?.[0])
                        }
                      />
                    </label>
                    <span className="modifier-option-copy">
                      <b>{option.name}</b>
                      <small>{option.description || "Sem descrição"}</small>
                    </span>
                    <label className="modifier-option-price-edit">
                      <span>Preço</span>
                      <div className="money-input">
                        <small>R$</small>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          defaultValue={option.price}
                          onBlur={(e) =>
                            Number(e.target.value) !== Number(option.price) &&
                            updateOption(option, {
                              price: Number(e.target.value),
                            })
                          }
                        />
                      </div>
                    </label>
                    <PriorityArrows
                      value={option.sortOrder}
                      onUp={() => reorderOption(group, option, -1)}
                      onDown={() => reorderOption(group, option, 1)}
                    />
                    <button
                      className={
                        option.active ? "area-toggle active" : "area-toggle"
                      }
                      onClick={() =>
                        updateOption(option, { active: !option.active })
                      }
                    >
                      {option.active ? "Ativo" : "Pausado"}
                    </button>
                    <button
                      className="subtle-danger"
                      onClick={() => removeOption(option)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <form
                className="inline-option-form modifier-option-create-compact"
                onSubmit={(e) => createOption(e, group)}
              >
                <label
                  className="inline-option-image-upload"
                  title="Imagem do adicional"
                >
                  {optionForm(group).image ? (
                    <img src={mediaUrl(optionForm(group).image)} alt="Prévia" />
                  ) : (
                    <ImagePlus size={20} />
                  )}
                  <span>
                    <Upload size={12} /> Foto
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={imageUploading}
                    onChange={(e) =>
                      uploadOptionImage(group, e.target.files?.[0])
                    }
                  />
                </label>
                <input
                  required
                  placeholder="Nome da opção"
                  value={optionForm(group).name}
                  onChange={(e) =>
                    setOptionForm(group, { name: e.target.value })
                  }
                />
                <input
                  placeholder="Descrição opcional"
                  value={optionForm(group).description}
                  onChange={(e) =>
                    setOptionForm(group, { description: e.target.value })
                  }
                />
                <input
                  required
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Acréscimo R$"
                  value={optionForm(group).price}
                  onChange={(e) =>
                    setOptionForm(group, { price: e.target.value })
                  }
                />
                <button className="ghost-dark-btn">
                  <Plus size={15} /> Adicionar opção
                </button>
              </form>
            </article>
          ))}
        </div>
      </section>
      <form className="admin-panel compact-form" onSubmit={createGroup}>
        <div className="panel-title">
          <div>
            <span>Novo grupo</span>
            <h2>Criar adicional</h2>
          </div>
          <Layers3 />
        </div>
        <label>
          Nome
          <input
            required
            value={modifierGroupForm.name}
            onChange={(e) =>
              setModifierGroupForm({
                ...modifierGroupForm,
                name: e.target.value,
              })
            }
            placeholder="Ex.: Escolha sua borda"
          />
        </label>
        <label>
          Descrição
          <input
            value={modifierGroupForm.description}
            onChange={(e) =>
              setModifierGroupForm({
                ...modifierGroupForm,
                description: e.target.value,
              })
            }
            placeholder="Ex.: Escolha 1 opção"
          />
        </label>
        <label className="switch-label">
          <input
            type="checkbox"
            checked={modifierGroupForm.required}
            onChange={(e) =>
              setModifierGroupForm({
                ...modifierGroupForm,
                required: e.target.checked,
                minSelect: e.target.checked
                  ? Math.max(1, Number(modifierGroupForm.minSelect || 0))
                  : modifierGroupForm.minSelect,
              })
            }
          />{" "}
          Obrigatório
        </label>
        <div className="two-cols">
          <label>
            Mínimo
            <input
              type="number"
              min="0"
              value={modifierGroupForm.minSelect}
              onChange={(e) =>
                setModifierGroupForm({
                  ...modifierGroupForm,
                  minSelect: e.target.value,
                })
              }
            />
          </label>
          <label>
            Máximo
            <input
              type="number"
              min="1"
              max="10"
              value={modifierGroupForm.maxSelect}
              onChange={(e) =>
                setModifierGroupForm({
                  ...modifierGroupForm,
                  maxSelect: e.target.value,
                })
              }
            />
          </label>
        </div>
        <button className="primary-btn full">
          <Plus size={16} /> Criar grupo
        </button>
      </form>
    </div>
  );
}

function ProductEditorModal({
  productForm,
  setProductForm,
  categories,
  subcategories,
  sizes,
  modifierGroups,
  onClose,
  onSave,
  onUpload,
  imageUploading,
  isNew,
  onArchive,
}) {
  const subs = subcategories.filter(
    (s) => s.categoryId === productForm.categoryId,
  );
  function toggleGroup(id) {
    setProductForm({
      ...productForm,
      modifierGroupIds: productForm.modifierGroupIds.includes(id)
        ? productForm.modifierGroupIds.filter((x) => x !== id)
        : [...productForm.modifierGroupIds, id],
    });
  }
  function sizeRow(id) {
    return productForm.sizePrices.find((row) => row.sizeId === id);
  }
  function toggleSize(size) {
    const existing = sizeRow(size.id);
    setProductForm({
      ...productForm,
      sizePrices: existing
        ? productForm.sizePrices.filter((row) => row.sizeId !== size.id)
        : [
            ...productForm.sizePrices,
            {
              sizeId: size.id,
              price: Number(productForm.price || 0),
              sortOrder: size.sortOrder || 0,
            },
          ],
    });
  }
  function setSizePrice(size, value) {
    setProductForm({
      ...productForm,
      sizePrices: productForm.sizePrices.map((row) =>
        row.sizeId === size.id ? { ...row, price: value } : row,
      ),
    });
  }
  return (
    <div className="modal-backdrop admin-editor-backdrop">
      <form className="product-editor-modal" onSubmit={onSave}>
        <div className="modal-head">
          <div>
            <span className="eyebrow dark">
              {isNew ? "Novo produto" : "Editar produto"}
            </span>
            <h2>{isNew ? "Adicionar ao cardápio" : productForm.name}</h2>
            <p>
              Configure foto, preços por tamanho, uso como sabor e adicionais.
            </p>
          </div>
          <button type="button" className="icon-close" onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="product-editor-grid">
          <aside className="image-upload-card product-image-panel">
            <div className="image-preview storefront-preview">
              {productForm.image ? (
                <img src={mediaUrl(productForm.image)} alt="Prévia" />
              ) : (
                <ImagePlus size={42} />
              )}
              <span>Prévia do card</span>
            </div>
            <div className="product-image-actions">
              <label
                className="upload-icon-button media-upload-standard product-upload-button"
                title="Anexar imagem"
              >
                <Upload size={18} />
                <span>{imageUploading ? "Enviando..." : "Anexar imagem"}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={imageUploading}
                  onChange={(e) => onUpload(e.target.files?.[0])}
                />
              </label>
              <label className="product-image-url">
                <span>Ou URL da imagem</span>
                <input
                  value={productForm.image}
                  onChange={(e) =>
                    setProductForm({ ...productForm, image: e.target.value })
                  }
                  placeholder="https://..."
                />
              </label>
            </div>
            <small>
              A imagem é ajustada automaticamente para caber no card.
            </small>
          </aside>
          <div className="product-fields">
            <label>
              Nome
              <input
                required
                value={productForm.name}
                onChange={(e) =>
                  setProductForm({
                    ...productForm,
                    name: e.target.value,
                    slug: isNew ? slugify(e.target.value) : productForm.slug,
                  })
                }
              />
            </label>
            <label>
              Slug
              <input
                required
                value={productForm.slug}
                onChange={(e) =>
                  setProductForm({ ...productForm, slug: e.target.value })
                }
              />
            </label>
            <label>
              Descrição
              <textarea
                required
                value={productForm.description}
                onChange={(e) =>
                  setProductForm({
                    ...productForm,
                    description: e.target.value,
                  })
                }
              />
            </label>
            <div className="two-cols">
              <label>
                Preço base
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={productForm.price}
                  onChange={(e) =>
                    setProductForm({ ...productForm, price: e.target.value })
                  }
                />
              </label>
              <label>
                Categoria
                <select
                  required
                  value={productForm.categoryId}
                  onChange={(e) =>
                    setProductForm({
                      ...productForm,
                      categoryId: e.target.value,
                      subcategoryId: "",
                    })
                  }
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {subs.length > 0 && (
              <label>
                Subcategoria opcional
                <select
                  value={productForm.subcategoryId}
                  onChange={(e) =>
                    setProductForm({
                      ...productForm,
                      subcategoryId: e.target.value,
                    })
                  }
                >
                  <option value="">Sem subcategoria</option>
                  {subs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Selo opcional
              <input
                value={productForm.badge}
                onChange={(e) =>
                  setProductForm({ ...productForm, badge: e.target.value })
                }
              />
            </label>
            <div className="editor-switches">
              <label className="switch-label">
                <input
                  type="checkbox"
                  checked={productForm.available}
                  onChange={(e) =>
                    setProductForm({
                      ...productForm,
                      available: e.target.checked,
                    })
                  }
                />{" "}
                Disponível
              </label>
              <label className="switch-label">
                <input
                  type="checkbox"
                  checked={productForm.featured}
                  onChange={(e) =>
                    setProductForm({
                      ...productForm,
                      featured: e.target.checked,
                    })
                  }
                />{" "}
                Destaque
              </label>
              <label className="switch-label">
                <input
                  type="checkbox"
                  checked={productForm.isFlavorOption}
                  onChange={(e) =>
                    setProductForm({
                      ...productForm,
                      isFlavorOption: e.target.checked,
                    })
                  }
                />{" "}
                Pode ser sabor de outras pizzas
              </label>
              <label className="switch-label">
                <input
                  type="checkbox"
                  checked={productForm.allowFlavorSplit}
                  onChange={(e) =>
                    setProductForm({
                      ...productForm,
                      allowFlavorSplit: e.target.checked,
                      maxFlavors: e.target.checked
                        ? Math.min(
                            4,
                            Math.max(1, Number(productForm.maxFlavors || 1)),
                          )
                        : 1,
                    })
                  }
                />{" "}
                Permitir divisão em sabores
              </label>
            </div>
            {productForm.allowFlavorSplit && (
              <div className="flavor-product-config">
                <div className="two-cols">
                  <label>
                    Máximo de sabores
                    <select
                      value={productForm.maxFlavors}
                      onChange={(e) =>
                        setProductForm({
                          ...productForm,
                          maxFlavors: Number(e.target.value),
                        })
                      }
                    >
                      {[1, 2, 3, 4].map((n) => (
                        <option key={n} value={n}>
                          {n} {n === 1 ? "sabor" : "sabores"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Como calcular vários sabores
                    <select
                      value={productForm.flavorPricingMode || "MAX"}
                      onChange={(e) =>
                        setProductForm({
                          ...productForm,
                          flavorPricingMode: e.target.value,
                        })
                      }
                    >
                      <option value="MAX">Cobrar o sabor mais caro</option>
                      <option value="SUM">
                        Dividir e somar proporcionalmente
                      </option>
                    </select>
                  </label>
                </div>
                <small className="field-note">
                  O sabor deste produto fica selecionado e travado. Em “Dividir
                  e somar”, cada sabor contribui com seu preço ÷ quantidade de
                  sabores; as partes são somadas para formar o valor da pizza.
                </small>
              </div>
            )}
            {sizes.filter((size) => size.active).length > 0 && (
              <div className="product-size-config">
                <div>
                  <b>Tamanhos e preços</b>
                  <small>
                    Marque os tamanhos vendidos neste produto e informe o valor
                    de cada um.
                  </small>
                </div>
                <div className="size-admin-product-grid">
                  {sizes
                    .filter((size) => size.active)
                    .map((size) => {
                      const row = sizeRow(size.id);
                      return (
                        <label key={size.id} className={row ? "selected" : ""}>
                          <input
                            type="checkbox"
                            checked={Boolean(row)}
                            onChange={() => toggleSize(size)}
                          />
                          <span>
                            <b>{size.name}</b>
                            <small>
                              {size.diameterCm
                                ? `${size.diameterCm} cm`
                                : "Tamanho cadastrado"}
                            </small>
                          </span>
                          {row && (
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.price}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) =>
                                setSizePrice(size, e.target.value)
                              }
                            />
                          )}
                        </label>
                      );
                    })}
                </div>
              </div>
            )}
            <div className="simple-stock-editor">
              <label className="switch-label">
                <input
                  type="checkbox"
                  checked={Boolean(productForm.stockTracked)}
                  onChange={(e) =>
                    setProductForm({
                      ...productForm,
                      stockTracked: e.target.checked,
                    })
                  }
                />{" "}
                Controlar estoque simples
              </label>
              {productForm.stockTracked && (
                <div className="two-cols">
                  <label>
                    Quantidade em estoque
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={productForm.stockQuantity}
                      onChange={(e) =>
                        setProductForm({
                          ...productForm,
                          stockQuantity: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Alerta de estoque baixo
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={productForm.stockLowThreshold}
                      onChange={(e) =>
                        setProductForm({
                          ...productForm,
                          stockLowThreshold: e.target.value,
                        })
                      }
                    />
                  </label>
                </div>
              )}
            </div>
            <div className="product-advanced-availability">
              <b>Disponibilidade e margem</b>
              <div className="two-cols">
                <label>
                  Custo estimado
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={productForm.costPrice || 0}
                    onChange={(e) =>
                      setProductForm({
                        ...productForm,
                        costPrice: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Pausar até
                  <input
                    type="datetime-local"
                    value={productForm.pausedUntil || ""}
                    onChange={(e) =>
                      setProductForm({
                        ...productForm,
                        pausedUntil: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Disponível a partir de
                  <input
                    type="time"
                    value={productForm.availableStartTime || ""}
                    onChange={(e) =>
                      setProductForm({
                        ...productForm,
                        availableStartTime: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Disponível até
                  <input
                    type="time"
                    value={productForm.availableEndTime || ""}
                    onChange={(e) =>
                      setProductForm({
                        ...productForm,
                        availableEndTime: e.target.value,
                      })
                    }
                  />
                </label>
              </div>
              <label>
                Ingredientes removíveis
                <input
                  value={productForm.removableIngredients || ""}
                  onChange={(e) =>
                    setProductForm({
                      ...productForm,
                      removableIngredients: e.target.value,
                    })
                  }
                  placeholder="Ex.: cebola, orégano, azeitona"
                />
              </label>
            </div>
            {modifierGroups.filter((group) => group.active).length > 0 && (
              <div className="product-modifier-config">
                <div>
                  <b>Adicionais do produto</b>
                  <small>Escolha quais grupos aparecerão neste produto.</small>
                </div>
                <div className="modifier-group-checkboxes">
                  {modifierGroups
                    .filter((group) => group.active)
                    .map((group) => (
                      <label
                        key={group.id}
                        className={
                          productForm.modifierGroupIds.includes(group.id)
                            ? "selected"
                            : ""
                        }
                      >
                        <input
                          type="checkbox"
                          checked={productForm.modifierGroupIds.includes(
                            group.id,
                          )}
                          onChange={() => toggleGroup(group.id)}
                        />
                        <span>
                          <b>{group.name}</b>
                          <small>
                            {group.required ? "Obrigatório" : "Opcional"} •{" "}
                            {group.options?.filter((o) => o.active).length || 0}{" "}
                            opções
                          </small>
                        </span>
                      </label>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="modal-actions product-modal-actions">
          {!isNew && (
            <div className="danger-zone">
              <small>Área de risco</small>
              <button
                type="button"
                className="subtle-danger archive-button"
                onClick={onArchive}
              >
                <Trash2 size={15} /> Excluir do catálogo
              </button>
            </div>
          )}
          <span />
          <button type="button" className="ghost-dark-btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-btn">
            <Save size={16} />{" "}
            {isNew ? "Adicionar produto" : "Salvar alterações"}
          </button>
        </div>
      </form>
    </div>
  );
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
function formatPhoneSimple(phone = "") {
  const d = String(phone || "").replace(/\D/g, "");
  return d.length === 11
    ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
    : phone || "—";
}
