import React, { lazy, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Layers3,
  LogOut,
  PackagePlus,
  Pencil,
  Plus,
  RefreshCw,
  Settings,
  ShoppingBag,
  Tags,
  Trash2,
  UserRound,
  Users,
  X,
  Megaphone,
  Power,
  ShieldCheck,
  Activity,
  Headset,
  Pizza,
  UtensilsCrossed,
  ChefHat,
  Boxes,
  ClipboardList,
  Gauge,
  Sun,
  Moon,
  Armchair,
  Printer,
  Download,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api, authHeaders, mediaUrl } from "../lib/api";
import { settleWithConcurrency } from "../lib/async";
import MotoIcon from "../components/MotoIcon";
import { fitImageFile } from "../lib/imageFit";
import { money } from "../lib/format";
import { buildOrderBuckets } from "../lib/orderBuckets";
import {
  CancelOrderModal,
  OrderDetailModal,
} from "../components/admin/OrderWorkspace";
import { printOrderReceipt } from "../lib/orderReceipt";
import {
  CustomersAdmin,
  OrdersAdmin,
  OverviewAdmin,
} from "../components/admin/AdminDashboardSections";
import { toIsoDateTime } from "../lib/dateInput";
import "../styles/admin-v228.css";
import "../styles/operations-v228.css";

const lazyNamed = (loader, name) =>
  lazy(() => loader().then((module) => ({ default: module[name] })));
const loadAdvancedSections = () => import("../components/AdvancedAdminSections");
const InventoryAdmin = lazyNamed(loadAdvancedSections, "InventoryAdmin");
const KitchenAdmin = lazyNamed(loadAdvancedSections, "KitchenAdmin");
const ReportsAdmin = lazyNamed(loadAdvancedSections, "ReportsAdmin");
const CustomerDetailModal = lazyNamed(loadAdvancedSections, "CustomerDetailModal");
const DeliveryTimeRules = lazyNamed(loadAdvancedSections, "DeliveryTimeRules");
const ManagementHub = lazyNamed(loadAdvancedSections, "ManagementHub");
const TablesAdmin = lazy(() => import("../components/TablesAdmin"));
const MenuPrintStudio = lazy(() => import("../components/MenuPrintStudio"));
const CombosAdmin = lazy(() => import("../components/CombosAdmin"));
const TableOrderPaymentModal = lazy(
  () => import("../components/TableOrderPaymentModal"),
);
const ProductEditorModal = lazy(
  () => import("../components/admin/ProductEditorModal"),
);
const CategoriesAdmin = lazy(
  () => import("../components/admin/CategoriesAdmin"),
);
const FlavorsAdmin = lazy(() => import("../components/admin/FlavorsAdmin"));
const SizesAdmin = lazy(() => import("../components/admin/SizesAdmin"));
const AlterationsAdmin = lazy(
  () => import("../components/admin/AlterationsAdmin"),
);
const PromotionsAdmin = lazy(
  () => import("../components/admin/PromotionsAdmin"),
);
const OperationsAdmin = lazy(
  () => import("../components/admin/OperationsAdmin"),
);
const StaffAdmin = lazy(() => import("../components/admin/StaffAdmin"));
const TeamAnalytics = lazy(() => import("../components/admin/TeamAnalytics"));
const DeliveryAdmin = lazy(() => import("../components/admin/DeliveryAdmin"));
const StoreSettings = lazy(() => import("../components/admin/StoreSettings"));
const MarketingAdmin = lazy(() => import("../components/admin/MarketingAdmin"));
const SetupWizard = lazy(() => import("../components/admin/SetupWizard"));
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
  ["marketing", Megaphone, "Marketing", "promotions"],
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
  isNew: false,
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
    const catalogKeys = [
      "products",
      "promotions",
      "alterations",
      "categories",
    ];
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
    [combos, setCombos] = useState([]),
    [flavors, setFlavors] = useState([]),
    [flavorGroups, setFlavorGroups] = useState([]),
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
      isWaiter ? "READY_FOR_TABLE" : isDeliveryStaff ? "READY_FOR_DELIVERY" : "OPEN",
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
    [paymentTarget, setPaymentTarget] = useState(null),
    [installPrompt, setInstallPrompt] = useState(null),
    [installHelp, setInstallHelp] = useState(""),
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
      maxFlavors: 4,
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
    if (can("products") || can("alterations")) allowed.push("flavors");
    if (can("products")) allowed.push("sizes", "print", "combos");
    if (tab === "catalog" && !allowed.includes(catalogSection))
      setCatalogSection(allowed[0] || "products");
  }, [tab, permissions, catalogSection]);

  useEffect(() => {
    const captureInstall = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const installed = () => {
      setInstallPrompt(null);
      setInstallHelp(`Aplicativo instalado. Abra ${settings?.storeName || "a loja"} pela tela inicial.`);
    };
    window.addEventListener("beforeinstallprompt", captureInstall);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", captureInstall);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  async function installApp() {
    if (window.matchMedia("(display-mode: standalone)").matches || navigator.standalone) {
      setInstallHelp(`Você já está usando ${settings?.storeName || "a loja"} como aplicativo.`);
      return;
    }
    if (installPrompt) {
      try {
        await installPrompt.prompt();
        await installPrompt.userChoice;
      } catch {
        setInstallHelp("Abra o menu do navegador e escolha Instalar aplicativo ou Adicionar à tela inicial.");
      } finally {
        setInstallPrompt(null);
      }
      return;
    }
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setInstallHelp(isIOS
      ? "No Safari, toque em Compartilhar e depois em Adicionar à Tela de Início. Abra este site no Safari se estiver usando outro navegador."
      : "Abra o menu do Chrome ou Edge e escolha Instalar aplicativo ou Adicionar à tela inicial. Se a opção não aparecer, confira em Gestão 360° se Aplicativo instalável está ativado.");
  }

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
      if (can("products") || can("promotions"))
        jobs.combos = () => api.get("/admin/combos", headers);
      if (can("products") || can("alterations"))
        jobs.sizes = () => api.get("/admin/sizes", headers);
      if (can("products") || can("alterations")) {
        jobs.flavors = () => api.get("/admin/flavors", headers);
        jobs.flavorGroups = () => api.get("/admin/flavor-groups", headers);
      }
      if (can("categories") || can("products") || can("alterations")) {
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
      if (data.combos) setCombos(data.combos);
      if (data.flavors) setFlavors(data.flavors);
      if (data.flavorGroups) setFlavorGroups(data.flavorGroups);
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
        if (liveRefreshInProgress.current || loadAllInProgress.current || document.hidden) return;
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
      5000,
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
      buildOrderBuckets(isWaiter ? orders.filter((order) =>
        order.fulfillmentType === "DINE_IN" && order.status === "READY_FOR_TABLE") : orders, {
        includeDineIn: !isDeliveryStaff,
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
    if (isWaiter && orderView !== "READY_FOR_TABLE") setOrderView("READY_FOR_TABLE");
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
  }, [isDeliveryStaff, isWaiter, orderView, overviewView]);
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
      const hiddenFromWaiter = isWaiter && data.status !== "READY_FOR_TABLE";
      setOrders((list) => hiddenFromWaiter
        ? list.filter((item) => item.id !== id)
        : list.map((item) => item.id === id ? data : item));
      if (selectedOrder?.id === id) setSelectedOrder(hiddenFromWaiter ? null : data);
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
      isNew: Boolean(p.isNew),
      available: Boolean(p.available),
      sortOrder: p.sortOrder || 0,
      allowFlavorSplit: Boolean(p.allowFlavorSplit),
      isFlavorOption: Boolean(p.isFlavorOption),
      maxFlavors: Number(p.maxFlavors || 1),
      flavorPricingMode: p.flavorPricingMode || "MAX",
      flavorIds: p.flavorIds || [],
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
        maxFlavors: 4,
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
      throw new Error("A imagem deve ter no máximo 1,8 MB.");
    const form = new FormData();
    form.append("image", file);
    setImageUploading(true);
    try {
      const { data } = await api.post("/admin/media", form, {
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      });
      await onDone(data.url);
    } catch (err) {
      throw new Error(
        err.response?.data?.message || "Não foi possível enviar a imagem.",
      );
    } finally {
      setImageUploading(false);
    }
  }
  async function requestCrop(file, onDone, label = "Imagem", fitOptions = 1) {
    if (!file) return;
    setError("");
    try {
      setImageUploading(true);
      const options =
        typeof fitOptions === "number" ? { aspect: fitOptions } : fitOptions;
      const fitted = await fitImageFile(file, options);
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
  async function saveUploadedSetting(key, value) {
    const allowed = new Set([
      "logoImage",
      "faviconImage",
      "shareImage",
      "heroImage",
      "aboutImage",
    ]);
    if (!allowed.has(key)) throw new Error("Imagem de configuração inválida.");
    const { data } = await api.patch(
      "/admin/settings",
      { [key]: value },
      headers,
    );
    setSettings((current) => ({ ...current, ...data }));
    await onCatalogChanged?.();
    return data[key] || value;
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
      <div className="admin-loading">Carregando painel da loja...</div>
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
              mediaUrl(settings?.logoImage) || "/images/store-placeholder.svg"
            }
            alt={settings?.storeName || "Pizzaria"}
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
                  setOrderView(isWaiter ? "READY_FOR_TABLE" : "OPEN");
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
            <div className="admin-quick-controls">
              <button
                type="button"
                className="admin-theme-toggle"
                onClick={() => setAdminDark((value) => !value)}
                title={adminDark ? "Usar modo claro" : "Usar modo escuro"}
                aria-label={adminDark ? "Usar modo claro" : "Usar modo escuro"}
              >
                {adminDark ? <Moon size={18} /> : <Sun size={18} />}
              </button>
              <button type="button" className="admin-theme-toggle" onClick={installApp}
                title="Instalar na tela inicial" aria-label="Instalar na tela inicial">
                <Download size={18} />
              </button>
            </div>
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
          {installHelp && (
            <div className="admin-install-help" role="status">
              <span>{installHelp}</span>
              <button type="button" onClick={() => setInstallHelp("")} aria-label="Fechar orientação"><X size={16} /></button>
            </div>
          )}
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
          <OverviewAdmin
            dashboard={dashboard}
            scheduledCount={scheduledCount}
            overviewView={overviewView}
            setOverviewView={setOverviewView}
            overviewBuckets={overviewBuckets}
            overviewOrders={overviewOrders}
            isDeliveryStaff={isDeliveryStaff}
            isWaiter={isWaiter}
            canOpenOrders={can("orders")}
            onShowAll={() => setTab("orders")}
            orderListProps={{
              onStatus: changeStatus,
              onCancel: setCancelTarget,
              onPayment: setPaymentTarget,
              onPrint: (order) => printOrderReceipt(order, settings),
              onOpen: openOrder,
              lateWarningMinutes: settings?.lateWarningMinutes || 30,
              deliveryOnly: isDeliveryStaff,
              savingId: statusSavingId,
            }}
          />
        )}

        {tab === "analytics" && can("analytics") && (
          <TeamAnalytics data={analytics} />
        )}

        {tab === "orders" && can("orders") && (
          <OrdersAdmin
            orderView={orderView}
            setOrderView={setOrderView}
            orderBuckets={orderBuckets}
            filteredOrders={filteredOrders}
            orderSearch={orderSearch}
            setOrderSearch={setOrderSearch}
            isDeliveryStaff={isDeliveryStaff}
            isWaiter={isWaiter}
            orderListProps={{
              onStatus: changeStatus,
              onCancel: isWaiter ? undefined : setCancelTarget,
              onPayment: isWaiter ? undefined : setPaymentTarget,
              onPrint: (order) => printOrderReceipt(order, settings),
              onOpen: openOrder,
              lateWarningMinutes: settings?.lateWarningMinutes || 30,
              deliveryOnly: isDeliveryStaff,
              savingId: statusSavingId,
            }}
          />
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
              {(can("alterations") || can("products")) && (
                <button
                  type="button"
                  className={catalogSection === "flavors" ? "active" : ""}
                  onClick={() => setCatalogSection("flavors")}
                >
                  <Layers3 size={16} /> Sabores
                </button>
              )}
              {can("products") && (
                <button
                  type="button"
                  className={catalogSection === "combos" ? "active" : ""}
                  onClick={() => setCatalogSection("combos")}
                >
                  <PackagePlus size={16} /> Combos
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
            {catalogSection === "flavors" &&
              (can("alterations") || can("products")) && (
                <FlavorsAdmin
                  session={session}
                  flavors={flavors}
                  groups={flavorGroups}
                  sizes={sizes}
                  categories={categories}
                  reload={async () => {
                    await loadAll();
                    await onCatalogChanged?.();
                  }}
                  notify={notify}
                  fail={fail}
                  requestCrop={requestCrop}
                  imageUploading={imageUploading}
                />
              )}
            {catalogSection === "combos" && can("products") && (
              <CombosAdmin
                session={session}
                combos={combos}
                products={products}
                onChanged={async () => { await loadAll(); await onCatalogChanged?.(); }}
                notify={notify}
                fail={fail}
                requestCrop={requestCrop}
                imageUploading={imageUploading}
              />
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
                products={[...products, ...combos]}
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
                combos={combos.filter((p) => !p.deletedAt)}
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
          <CustomersAdmin
            customers={customers}
            filteredCustomers={filteredCustomers}
            customerSearch={customerSearch}
            setCustomerSearch={setCustomerSearch}
            onOpen={setSelectedCustomerId}
            onDelete={deleteCustomer}
          />
        )}
        {tab === "marketing" && can("promotions") && (
          <MarketingAdmin
            session={session}
            settings={settings}
            setSettings={setSettings}
            notify={notify}
            fail={fail}
            onChanged={onCatalogChanged}
            uploadMedia={(file, onDone) =>
              requestCrop(file, onDone, "Banner da campanha", 16 / 7)
            }
            imageUploading={imageUploading}
          />
        )}
        {tab === "reports" && can("reports") && (
          <ReportsAdmin session={session} fail={fail} />
        )}
        {tab === "settings" && can("settings") && settings && (
          <StoreSettings
            settings={settings}
            setSettings={setSettings}
            saveSettings={saveStoreSettings}
            saveUploadedSetting={saveUploadedSetting}
            lookupStoreCep={lookupStoreCep}
            goProducts={() => {
              setTab("catalog");
              setCatalogSection("products");
            }}
            uploadMedia={(file, onDone, label, aspect) =>
              requestCrop(file, onDone, label, aspect)
            }
            imageUploading={imageUploading}
            uploadError={error}
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
            permissionOptions={STAFF_PERMISSION_OPTIONS}
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
          onCancel={isWaiter ? undefined : setCancelTarget}
          onPayment={isWaiter ? undefined : setPaymentTarget}
          onPrint={(order) => printOrderReceipt(order, settings)}
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
      {paymentTarget && (
        <TableOrderPaymentModal
          order={paymentTarget}
          settings={settings}
          session={session}
          onClose={() => setPaymentTarget(null)}
          fail={fail}
          onPaid={async () => {
            setPaymentTarget(null);
            setSelectedOrder(null);
            notify("Pagamento registrado. Pedidos concluídos e mesa liberada.");
            await loadAll();
          }}
        />
      )}

      {productEditor && (
        <ProductEditorModal
          productForm={productForm}
          setProductForm={setProductForm}
          categories={categories}
          subcategories={subcategories}
          sizes={sizes}
          flavors={flavors}
          modifierGroups={modifierGroups}
          onClose={() => setProductEditor(null)}
          onSave={saveProduct}
          onUpload={uploadImage}
          imageUploading={imageUploading}
          isNew={productEditor === "new"}
          onArchive={archiveProduct}
        />
      )}
      {isOwner && settings && settings.initialSetupCompleted === false && (
        <SetupWizard
          session={session}
          settings={settings}
          setSettings={setSettings}
          onComplete={async () => {
            notify("Configuração inicial concluída.");
            await onCatalogChanged?.();
          }}
        />
      )}
    </div>
  );
}


const STAFF_PERMISSION_OPTIONS = TABS.filter(
  ([, , , permission]) => permission !== "__OWNER__",
).map(([id, Icon, label, permission]) => ({ id, Icon, label, permission }));
