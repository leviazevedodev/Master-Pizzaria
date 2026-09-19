import React, {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Header from "./components/Header";
import Toast from "./components/Toast";
import FloatingBagBar from "./components/FloatingBagBar";
import FloatingOrdersButton from "./components/FloatingOrdersButton";
import {
  DEMO_CATEGORIES,
  DEMO_PRODUCTS,
  DEMO_PROMOTIONS,
  DEMO_SETTINGS,
  DEMO_STORE_HOURS,
  DEMO_SUBCATEGORIES,
} from "./data/demo";
import { api, authHeaders, mediaUrl } from "./lib/api";
import {
  applyBrandingToDocument,
  buildBranding,
  buildDynamicManifest,
} from "./lib/branding";
import {
  readExpiringStoredJson,
  readStoredJson,
  writeExpiringStoredJson,
  writeStoredJson,
} from "./lib/storage";
const PizzaBuilderModal = lazy(() => import("./components/PizzaBuilderModal"));
const AccountPage = lazy(() => import("./pages/AccountPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
const CartPage = lazy(() => import("./pages/CartPage"));
const CheckoutPage = lazy(() => import("./pages/CheckoutPage"));
const DigitalTableCheckoutPage = lazy(
  () => import("./pages/DigitalTableCheckoutPage"),
);
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const GuestOrdersPage = lazy(() => import("./pages/GuestOrdersPage"));
const HomePage = lazy(() => import("./pages/HomePage"));
const MenuPage = lazy(() => import("./pages/MenuPage"));
const PaymentReturnPage = lazy(() => import("./pages/PaymentReturnPage"));
const TrackOrderPage = lazy(() => import("./pages/TrackOrderPage"));

const PUBLIC_CACHE_KEY = "master-pizza-public-cache-v26";
const PUBLIC_REFRESH_SIGNAL = "master-pizza-public-refresh";

function readPublicCache() {
  return readStoredJson(localStorage, PUBLIC_CACHE_KEY, null, (cached) =>
    Boolean(
      cached?.settings &&
        Array.isArray(cached.products) &&
        Array.isArray(cached.categories) &&
        Array.isArray(cached.subcategories) &&
        Array.isArray(cached.promotions) &&
        Array.isArray(cached.storeHours),
    ),
  );
}
function writePublicCache(snapshot) {
  writeStoredJson(localStorage, PUBLIC_CACHE_KEY, snapshot);
}

export default function App() {
  const location = useLocation();
  const digitalTableMode = location.pathname.startsWith(
    "/cardapio-digital",
  );
  const hidePublicHeader = location.pathname === "/gestao";
  const [initialPublic] = useState(readPublicCache);
  const [cart, setCart] = useState(() =>
    readExpiringStoredJson(
      localStorage,
      "master-pizza-cart",
      [],
      14 * 24 * 60 * 60 * 1000,
      (value) =>
        Array.isArray(value) &&
        value.length <= 100 &&
        value.every(
          (item) =>
            item &&
            typeof item === "object" &&
            typeof (item.productId || item.id) === "string" &&
            Number.isFinite(Number(item.quantity)) &&
            Number(item.quantity) > 0,
        ),
    ),
  );
  const [products, setProducts] = useState(
    initialPublic?.products || DEMO_PRODUCTS,
  );
  const [categories, setCategories] = useState(
    initialPublic?.categories || DEMO_CATEGORIES,
  );
  const [subcategories, setSubcategories] = useState(
    initialPublic?.subcategories || DEMO_SUBCATEGORIES,
  );
  const [promotions, setPromotions] = useState(
    initialPublic?.promotions || DEMO_PROMOTIONS,
  );
  const [storeHours, setStoreHours] = useState(
    initialPublic?.storeHours || DEMO_STORE_HOURS,
  );
  const [settings, setSettings] = useState(
    initialPublic?.settings || DEMO_SETTINGS,
  );
  const [highlights, setHighlights] = useState(
    initialPublic?.highlights || {
      campaigns: [],
      reviews: [],
      reviewSummary: { average: 0, count: 0 },
      bestSellers: [],
      newProductIds: [],
    },
  );
  const [publicReady, setPublicReady] = useState(Boolean(initialPublic));
  const [publicError, setPublicError] = useState("");
  const [session, setSessionState] = useState(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [toast, setToast] = useState("");
  const [builderProduct, setBuilderProduct] = useState(null);
  const toastTimer = useRef(null);
  const publicLoadInProgress = useRef(false);

  useEffect(() => {
    const branding = buildBranding(settings, {
      origin: window.location.origin,
      pathname: location.pathname,
      logoUrl: mediaUrl(settings.logoImage),
      faviconUrl: mediaUrl(settings.faviconImage || settings.logoImage),
      shareImageUrl: mediaUrl(settings.shareImage || settings.logoImage),
    });
    applyBrandingToDocument(document, branding);

    const manifestLink = document.head.querySelector('link[rel="manifest"]');
    let manifestUrl = "";
    if (manifestLink && window.URL?.createObjectURL) {
      manifestUrl = window.URL.createObjectURL(
        new Blob([JSON.stringify(buildDynamicManifest(branding))], {
          type: "application/manifest+json",
        }),
      );
      manifestLink.setAttribute("href", manifestUrl);
    }
    return () => {
      if (manifestUrl) window.URL.revokeObjectURL(manifestUrl);
    };
  }, [location.pathname, settings]);
  useEffect(() => {
    if (!publicReady || !("serviceWorker" in navigator)) return undefined;

    let cancelled = false;
    const syncPwa = async () => {
      if (settings.pwaEnabled !== false) {
        await navigator.serviceWorker.register("/sw.js");
        return;
      }

      const registrations = await navigator.serviceWorker.getRegistrations();
      if (cancelled) return;
      await Promise.all(
        registrations
          .filter(
            (registration) =>
              new URL(registration.scope).origin === window.location.origin,
          )
          .map((registration) => registration.unregister()),
      );
      if ("caches" in window) {
        const keys = await window.caches.keys();
        await Promise.all(
          keys
            .filter((key) => key.startsWith("master-pizza-"))
            .map((key) => window.caches.delete(key)),
        );
      }
    };

    syncPwa().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [publicReady, settings.pwaEnabled]);
  useEffect(
    () => () => {
      window.clearTimeout(toastTimer.current);
    },
    [],
  );
  useEffect(() => {
    writeExpiringStoredJson(localStorage, "master-pizza-cart", cart);
  }, [cart]);
  useEffect(() => {
    if (location.pathname === "/" && !location.hash)
      window.scrollTo({ top: 0, behavior: "smooth" });
    if (/^#[A-Za-z][\w-]*$/.test(location.hash))
      window.setTimeout(
        () =>
          document
            .querySelector(location.hash)
            ?.scrollIntoView({ behavior: "smooth", block: "start" }),
        120,
      );
  }, [location.pathname, location.hash]);

  const loadPublicData = useCallback(async () => {
    if (publicLoadInProgress.current) return false;
    publicLoadInProgress.current = true;
    try {
      // O pool gratuito do Neon é pequeno. Carregar em etapas evita que uma
      // única tela ocupe todas as conexões e derrube a autenticação do painel.
      const [settingsRes, hoursRes] = await Promise.all([
        api.get("/settings"),
        api.get("/store-hours"),
      ]);
      const [categoriesRes, subsRes] = await Promise.all([
        api.get("/categories"),
        api.get("/subcategories"),
      ]);
      const productsRes = await api.get("/products");
      const [promotionsRes, highlightsRes] = await Promise.all([
        api.get("/promotions"),
        api.get("/highlights", authHeaders(session?.token)),
      ]);
      const snapshot = {
        products: productsRes.data || [],
        categories: categoriesRes.data || [],
        subcategories: subsRes.data || [],
        promotions: promotionsRes.data || [],
        settings: settingsRes.data || DEMO_SETTINGS,
        storeHours: hoursRes.data || [],
        highlights: highlightsRes.data || {},
        savedAt: Date.now(),
      };
      setProducts(snapshot.products);
      setCategories(snapshot.categories);
      setSubcategories(snapshot.subcategories);
      setPromotions(snapshot.promotions);
      setSettings(snapshot.settings);
      setStoreHours(snapshot.storeHours);
      setHighlights(snapshot.highlights);
      writePublicCache(snapshot);
      setPublicError("");
      setPublicReady(true);
      return true;
    } catch {
      if (!initialPublic)
        setPublicError("Ainda estamos conectando ao sistema da loja.");
      return false;
    } finally {
      publicLoadInProgress.current = false;
    }
  }, [initialPublic, session?.token]);

  useEffect(() => {
    if (!hidePublicHeader) loadPublicData();
  }, [hidePublicHeader, loadPublicData]);
  useEffect(() => {
    if (publicReady || hidePublicHeader) return undefined;
    const retry = window.setInterval(loadPublicData, 5000);
    return () => window.clearInterval(retry);
  }, [publicReady, hidePublicHeader, loadPublicData]);
  useEffect(() => {
    if (hidePublicHeader) return undefined;
    const timer = window.setInterval(() => loadPublicData(), 60000);
    return () => window.clearInterval(timer);
  }, [hidePublicHeader, loadPublicData]);
  useEffect(() => {
    if (hidePublicHeader) return undefined;
    const refresh = () => loadPublicData();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const onStorage = (event) => {
      if (event.key === PUBLIC_REFRESH_SIGNAL) refresh();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [hidePublicHeader, loadPublicData]);
  useEffect(() => {
    // O refresh token permanece somente no cookie HttpOnly. O token curto
    // vive em memória e é reconstruído com segurança ao abrir o site.
    api
      .post(
        "/auth/refresh",
        {},
        {
          headers: { "X-Session-Refresh": "1" },
          _skipAuthRefresh: true,
        },
      )
      .then(({ data }) => setSessionState({ token: data.token, user: data.user }))
      .catch(() => setSessionState(null))
      .finally(() => setSessionReady(true));
  }, []);
  useEffect(() => {
    const expire = () => setSessionState(null);
    const refreshed = (event) => {
      const data = event.detail;
      if (data?.token && data?.user)
        setSessionState({ token: data.token, user: data.user });
    };
    window.addEventListener("master-pizza-session-expired", expire);
    window.addEventListener("master-pizza-session-refreshed", refreshed);
    return () => {
      window.removeEventListener("master-pizza-session-expired", expire);
      window.removeEventListener("master-pizza-session-refreshed", refreshed);
    }
  }, []);

  function setSession(next) {
    setSessionState(next);
  }
  async function logout(showToast = true) {
    try {
      await api.post(
        "/auth/logout",
        {},
        { headers: { "X-Session-Refresh": "1" }, _skipAuthRefresh: true },
      );
    } catch {}
    setSessionState(null);
    if (showToast) notify("Você saiu da sua conta.");
  }
  async function logoutAll() {
    if (!session?.token) return logout();
    try {
      await api.post("/auth/logout-all", {}, authHeaders(session.token));
    } catch {}
    setSessionState(null);
    notify("Todas as sessões da conta foram encerradas.");
  }
  function notify(message) {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2800);
  }

  function normalizeCartItem(input) {
    if (input.cartKey) return input;
    return {
      cartKey: input.id,
      productId: input.id,
      name: input.name,
      price: Number(input.price),
      image: input.image,
      quantity: 1,
      sizeId: null,
      sizeName: null,
      flavorIds: [],
      flavors: [],
      optionIds: [],
      options: [],
      notes: "",
    };
  }
  function addToCart(input) {
    const item = normalizeCartItem(input);
    setCart((current) => {
      const found = current.find(
        (entry) => (entry.cartKey || entry.productId) === item.cartKey,
      );
      if (found)
        return current.map((entry) =>
          (entry.cartKey || entry.productId) === item.cartKey
            ? { ...entry, quantity: entry.quantity + 1 }
            : entry,
        );
      return [...current, item];
    });
    notify(`${item.name} foi adicionado à sacola.`);
  }
  function handleAddProduct(product) {
    setBuilderProduct(product);
  }
  function replaceCart(items) {
    setCart(
      items.map((item) => ({
        ...item,
        cartKey: item.cartKey || item.productId,
      })),
    );
    notify("Os itens do pedido foram colocados na sacola.");
  }
  function changeQty(key, delta) {
    setCart((current) =>
      current
        .map((item) =>
          (item.cartKey || item.productId) === key
            ? { ...item, quantity: item.quantity + delta }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }
  const cartCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart],
  );
  const cartTotal = useMemo(
    () =>
      cart.reduce(
        (sum, item) =>
          sum + Number(item.price || 0) * Number(item.quantity || 0),
        0,
      ),
    [cart],
  );
  const handleCatalogChanged = useCallback(async () => {
    await loadPublicData();
    try {
      localStorage.setItem(PUBLIC_REFRESH_SIGNAL, String(Date.now()));
    } catch {}
  }, [loadPublicData]);

  const sharedCatalogProps = {
    products,
    categories,
    subcategories,
    promotions,
    settings,
    storeHours,
    highlights,
    session,
    onAdd: handleAddProduct,
  };

  if (!sessionReady || (!hidePublicHeader && !publicReady))
    return (
      <div className="public-boot">
        <div className="public-boot-card">
          <img
            src={mediaUrl(settings.logoImage) || "/images/store-placeholder.svg"}
            alt={settings.storeName || "Pizzaria"}
          />
          <span className="public-boot-spinner" />
          <h1>Carregando {settings.storeName || "a pizzaria"}</h1>
          <p>
            {publicError ||
              "Buscando cardápio, horários e informações atualizadas da loja..."}
          </p>
          {publicError && (
            <button className="primary-btn" onClick={loadPublicData}>
              Tentar novamente
            </button>
          )}
        </div>
      </div>
    );

  return (
    <div className="app-shell">
      {!hidePublicHeader && (
        <Header
          cartCount={cartCount}
          settings={settings}
          storeHours={storeHours}
          session={session}
          cartPath={
            digitalTableMode
              ? "/cardapio-digital/finalizar"
              : "/carrinho"
          }
          menuPath={digitalTableMode ? "/cardapio-digital" : "/cardapio"}
        />
      )}
      <Suspense
        fallback={
          <div className="public-boot">
            <div className="public-boot-card">
              <span className="public-boot-spinner" />
              <p>Carregando...</p>
            </div>
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<HomePage {...sharedCatalogProps} />} />
          <Route
            path="/cardapio"
            element={<MenuPage {...sharedCatalogProps} cartCount={cartCount} />}
          />
          <Route
            path="/cardapio-digital"
            element={
              settings.digitalMenuEnabled !== false ? (
                <MenuPage
                  {...sharedCatalogProps}
                  digitalMode
                  cartCount={cartCount}
                />
              ) : (
                <Navigate to="/cardapio" replace />
              )
            }
          />
          <Route
            path="/cardapio-digital/finalizar"
            element={
              settings.digitalMenuEnabled !== false ? (
                <DigitalTableCheckoutPage
                  cart={cart}
                  setCart={setCart}
                  changeQty={changeQty}
                  settings={settings}
                />
              ) : (
                <Navigate to="/cardapio" replace />
              )
            }
          />
          <Route path="/entregas" element={<Navigate to="/" replace />} />
          <Route
            path="/carrinho"
            element={
              <CartPage
                cart={cart}
                changeQty={changeQty}
                clearCart={() => setCart([])}
                settings={settings}
                onAdd={handleAddProduct}
              />
            }
          />
          <Route
            path="/checkout"
            element={
              <CheckoutPage
                cart={cart}
                setCart={setCart}
                settings={settings}
                storeHours={storeHours}
                session={session}
              />
            }
          />
          <Route
            path="/acompanhar"
            element={<Navigate to="/seus-pedidos" replace />}
          />
          <Route
            path="/pedido/:code"
            element={<TrackOrderPage session={session} settings={settings} />}
          />
          <Route path="/pagamento" element={<PaymentReturnPage />} />
          <Route
            path="/entrar"
            element={
              <AuthPage
                session={session}
                onSession={setSession}
                settings={settings}
              />
            }
          />
          <Route
            path="/cadastro"
            element={
              <AuthPage
                session={session}
                onSession={setSession}
                initialMode="register"
                settings={settings}
              />
            }
          />
          <Route
            path="/esqueci-a-senha"
            element={<ForgotPasswordPage settings={settings} />}
          />
          <Route
            path="/redefinir-senha"
            element={<ForgotPasswordPage settings={settings} />}
          />
          <Route
            path="/minha-conta"
            element={
              session?.user && !session.user.isAdmin ? (
                <AccountPage
                  session={session}
                  onLogout={logout}
                  onLogoutAll={logoutAll}
                  onReorder={replaceCart}
                  settings={settings}
                />
              ) : (
                <Navigate to="/entrar" replace />
              )
            }
          />
          <Route
            path="/seus-pedidos"
            element={
              session?.user && !session.user.isAdmin ? (
                <AccountPage
                  session={session}
                  onLogout={logout}
                  onLogoutAll={logoutAll}
                  onReorder={replaceCart}
                  ordersOnly
                  settings={settings}
                />
              ) : (
                <GuestOrdersPage />
              )
            }
          />
          <Route
            path="/gestao"
            element={
              session?.user?.isAdmin ? (
                <AdminPage
                  session={session}
                  onLogout={logout}
                  onLogoutAll={logoutAll}
                  onCatalogChanged={handleCatalogChanged}
                />
              ) : (
                <Navigate to="/entrar" replace />
              )
            }
          />
          <Route path="/admin" element={<Navigate to="/entrar" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      {builderProduct && (
        <Suspense fallback={null}>
          <PizzaBuilderModal
            baseProduct={builderProduct}
            onClose={() => setBuilderProduct(null)}
            onAdd={addToCart}
          />
        </Suspense>
      )}
      {!hidePublicHeader &&
        !["/carrinho", "/checkout"].includes(location.pathname) && (
          <FloatingBagBar
            count={cartCount}
            total={cartTotal}
            to={
              digitalTableMode
                ? "/cardapio-digital/finalizar"
                : "/carrinho"
            }
            label={digitalTableMode ? "Finalizar na mesa" : "Ver sacola"}
          />
        )}
      {!hidePublicHeader && !digitalTableMode && <FloatingOrdersButton />}
      <Toast message={toast} onClose={() => setToast("")} />
    </div>
  );
}
