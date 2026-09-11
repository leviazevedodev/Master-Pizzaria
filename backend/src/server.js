import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import multer from "multer";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  detectImageMime,
  escapeHtml,
  verifyMercadoPagoSignature,
} from "./security.js";
import {
  isProductAvailableAt,
  parseClock,
  startOfZonedDay,
  zonedDateKey,
} from "./catalog.js";
import { missingDeliveryAddressFields } from "./order-validation.js";
import { booleanValue, boundedInteger, validSlug } from "./input-validation.js";
import { isDatabaseAvailabilityError } from "./database-errors.js";
import { createAsyncTtlCache } from "./async-ttl-cache.js";
import {
  calculateTablePayment,
  summarizeTableOrders,
  tableLabel,
} from "./table-service.js";
import { retentionCutoffs } from "./data-retention.js";
import {
  CUSTOM_PAYMENT_PREFIX,
  normalizeCustomPaymentMethods,
  resolveCustomPaymentMethod,
} from "./payment-methods.js";

dotenv.config({ quiet: true });

const app = express();
const prisma = new PrismaClient({
  transactionOptions: {
    maxWait: 15_000,
    timeout: 30_000,
  },
});
const PORT = Number(process.env.PORT || 3333);
const isProduction = process.env.NODE_ENV === "production";
const JWT_SECRET = String(process.env.JWT_SECRET || "").trim();
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const secureSessionCookie = /^https:\/\//i.test(FRONTEND_URL);
const PUBLIC_BACKEND_URL = (
  process.env.PUBLIC_BACKEND_URL || `http://localhost:${PORT}`
).replace(/\/$/, "");
const MERCADOPAGO_ACCESS_TOKEN = (
  process.env.MERCADOPAGO_ACCESS_TOKEN || ""
).trim();
const MERCADOPAGO_PUBLIC_KEY = (
  process.env.MERCADOPAGO_PUBLIC_KEY || ""
).trim();
const MERCADOPAGO_WEBHOOK_SECRET = (
  process.env.MERCADOPAGO_WEBHOOK_SECRET || ""
).trim();
const RESEND_READY = Boolean(
  String(process.env.RESEND_API_KEY || "").trim() &&
    String(process.env.EMAIL_FROM || "").trim(),
);
const WHATSAPP_WEBHOOK_URL = (process.env.WHATSAPP_WEBHOOK_URL || "").trim();
const WHATSAPP_WEBHOOK_TOKEN = (
  process.env.WHATSAPP_WEBHOOK_TOKEN || ""
).trim();
const NOMINATIM_BASE_URL = (
  process.env.NOMINATIM_BASE_URL || "https://nominatim.openstreetmap.org"
).replace(/\/$/, "");
const OSRM_BASE_URL = (
  process.env.OSRM_BASE_URL || "https://router.project-osrm.org"
).replace(/\/$/, "");
const MERCADOPAGO_PUBLIC_READY = Boolean(
  MERCADOPAGO_ACCESS_TOKEN &&
    MERCADOPAGO_PUBLIC_KEY &&
    MERCADOPAGO_WEBHOOK_SECRET &&
    (!isProduction ||
      (/^https:\/\//i.test(PUBLIC_BACKEND_URL) &&
        /^https:\/\//i.test(FRONTEND_URL))),
);
const MERCADOPAGO_NOTIFICATION_URL = /^https:\/\//i.test(PUBLIC_BACKEND_URL)
  ? `${PUBLIC_BACKEND_URL}/api/payments/mercadopago/webhook`
  : "";
const PUBLIC_MENU_URL = (() => {
  try {
    const url = new URL("/gestao/cardapiodigital", FRONTEND_URL);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
})();

if (
  JWT_SECRET.length < 32 ||
  [
    "change_this_secret_in_production",
    "master-pizza-dev-secret-change-me",
    "gere-ao-menos-32-caracteres-aleatorios",
  ].includes(JWT_SECRET)
) {
  console.error(
    "JWT_SECRET deve ter pelo menos 32 caracteres aleatórios e não pode usar o valor de exemplo.",
  );
  process.exit(1);
}
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error("PORT deve ser um número inteiro entre 1 e 65535.");
  process.exit(1);
}

function normalizeAllowedOrigin(value) {
  try {
    const parsed = new URL(value);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error();
    }
    return parsed.origin;
  } catch {
    console.error(
      `Origem CORS inválida: ${value}. Informe apenas a origem HTTP(S), sem caminho, credenciais, consulta ou fragmento.`,
    );
    process.exit(1);
  }
}

const allowedOrigins = (process.env.CORS_ORIGIN || FRONTEND_URL)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean)
  .map(normalizeAllowedOrigin);
app.disable("x-powered-by");
if (process.env.TRUST_PROXY) {
  if (!/^\d+$/.test(process.env.TRUST_PROXY)) {
    console.error(
      "TRUST_PROXY deve informar a quantidade de proxies confiáveis, por exemplo 1.",
    );
    process.exit(1);
  }
  app.set("trust proxy", Number(process.env.TRUST_PROXY));
}
app.use((req, res, next) => {
  req.requestId = crypto.randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(self)",
  );
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  );
  if (isProduction)
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  next();
});
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin))
        return callback(null, true);
      return callback(new Error("Origem não permitida pelo CORS."));
    },
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Session-Refresh"],
    credentials: true,
  }),
);
app.use(express.json({ limit: "512kb" }));
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  next();
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1_800_000, files: 1 },
  fileFilter(req, file, cb) {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.mimetype))
      return cb(
        new Error("Formato de imagem não permitido. Use JPG, PNG ou WebP."),
      );
    cb(null, true);
  },
});

const rateLimitBuckets = new Map();
function createRateLimit({
  name,
  windowMs,
  max,
  key = (req) => req.ip || "unknown",
}) {
  return (req, res, next) => {
    const now = Date.now();
    const bucketKey = `${name}:${key(req)}`;
    let bucket = rateLimitBuckets.get(bucketKey);
    if (!bucket || bucket.resetAt <= now) {
      if (!bucket && rateLimitBuckets.size >= 50_000) {
        for (const [storedKey, storedBucket] of rateLimitBuckets) {
          if (storedBucket.resetAt <= now) rateLimitBuckets.delete(storedKey);
          if (rateLimitBuckets.size < 49_000) break;
        }
        while (rateLimitBuckets.size >= 49_000) {
          const oldestKey = rateLimitBuckets.keys().next().value;
          if (oldestKey === undefined) break;
          rateLimitBuckets.delete(oldestKey);
        }
      }
      bucket = { count: 0, resetAt: now + windowMs };
      rateLimitBuckets.set(bucketKey, bucket);
    }
    bucket.count += 1;
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader(
      "RateLimit-Remaining",
      String(Math.max(0, max - bucket.count)),
    );
    res.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count > max) {
      res.setHeader(
        "Retry-After",
        String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))),
      );
      return res.status(429).json({
        code: "RATE_LIMIT",
        message:
          "Muitas solicitações. Aguarde alguns minutos e tente novamente.",
      });
    }
    next();
  };
}
const authIpRateLimit = createRateLimit({
  name: "auth-ip",
  windowMs: 15 * 60_000,
  max: 40,
});
const authIdentifierRateLimit = createRateLimit({
  name: "auth-identifier",
  windowMs: 15 * 60_000,
  max: 12,
  key: (req) =>
    crypto
      .createHash("sha256")
      .update(
        String(req.body?.identifier || req.body?.email || req.body?.phone || "")
          .trim()
          .toLowerCase(),
      )
      .digest("hex"),
});
function authRateLimit(req, res, next) {
  authIpRateLimit(req, res, () => authIdentifierRateLimit(req, res, next));
}
const orderRateLimit = createRateLimit({
  name: "orders",
  windowMs: 60 * 60_000,
  max: 20,
});
const geoRateLimit = createRateLimit({
  name: "geo",
  windowMs: 60_000,
  max: 40,
});
const trackingRateLimit = createRateLimit({
  name: "tracking",
  windowMs: 60_000,
  max: 120,
});
const paymentRateLimit = createRateLimit({
  name: "payments",
  windowMs: 10 * 60_000,
  max: 40,
});
const couponRateLimit = createRateLimit({
  name: "coupons",
  windowMs: 10 * 60_000,
  max: 60,
});
const reviewRateLimit = createRateLimit({
  name: "reviews",
  windowMs: 60 * 60_000,
  max: 20,
});
const adminRateLimit = createRateLimit({
  name: "admin",
  windowMs: 15 * 60_000,
  max: 1200,
  key: (req) => req.user?.id || req.ip || "unknown",
});
function orderSubmissionRateLimit(req, res, next) {
  return req.user?.isAdmin
    ? adminRateLimit(req, res, next)
    : orderRateLimit(req, res, next);
}
const rateLimitCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateLimitBuckets)
    if (bucket.resetAt <= now) rateLimitBuckets.delete(key);
}, 5 * 60_000);
rateLimitCleanupTimer.unref?.();

const cleanText = (value, max = 120) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const safeExternalUrl = (value, max = 600) => {
  const cleaned = cleanText(value, max);
  if (!cleaned) return "";
  try {
    const url = new URL(cleaned);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
};
const safeMediaUrl = (value) => {
  const cleaned = cleanText(value, 600);
  if (!cleaned) return "";
  if (/^\/api\/media\/[A-Za-z0-9_-]{5,100}$/.test(cleaned)) return cleaned;
  if (
    /^\/images\/(?:products|modifiers)\/[A-Za-z0-9_-]+\.(?:webp|png|jpe?g)$/i.test(
      cleaned,
    )
  )
    return cleaned;
  return safeExternalUrl(cleaned, 600);
};
const normalizePhone = (value) => {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) digits = digits.slice(2);
  return digits;
};
const validPhone = (phone) => /^\d{10,11}$/.test(phone);
const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
const validCustomerPassword = (password) =>
  typeof password === "string" &&
  password.length >= 8 &&
  password.length <= 128 &&
  /[A-Za-z]/.test(password) &&
  /\d/.test(password);
const validStaffPassword = (password) =>
  typeof password === "string" &&
  password.length >= 12 &&
  password.length <= 128 &&
  /[A-Za-z]/.test(password) &&
  /\d/.test(password);
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("not-a-real-account-password", 12);
const normalizeAdminPermissions = (value) =>
  Array.isArray(value)
    ? [...new Set(value.map((item) => String(item)).filter(Boolean))]
    : null;
const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  isAdmin: user.isAdmin,
  adminPermissions: normalizeAdminPermissions(user.adminPermissions),
  staffRole: user.staffRole || (user.isAdmin ? "STAFF" : null),
  staffActive: user.staffActive !== false,
  customerBlocked: Boolean(user.customerBlocked),
  postalCode: user.postalCode || "",
  street: user.street || "",
  addressNumber: user.addressNumber || "",
  complement: user.complement || "",
  neighborhood: user.neighborhood || "",
  city: user.city || "",
  state: user.state || "",
  referencePoint: user.referencePoint || "",
  createdAt: user.createdAt,
});
const roundMoney = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const numberOrNull = (value) => (value == null ? null : Number(value));
const optionalDate = (value) => {
  if (value === "" || value == null) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};
const normalizePlace = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const normalizeCity = (value) =>
  normalizePlace(value)
    .replace(
      /\s+(ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to)$/i,
      "",
    )
    .trim();

const serializeSettings = (settings) => ({
  ...settings,
  customPaymentMethods: normalizeCustomPaymentMethods(
    settings.customPaymentMethods,
  ),
  instagramUrl: safeExternalUrl(settings.instagramUrl, 600),
  logoImage: safeMediaUrl(settings.logoImage),
  heroImage: safeMediaUrl(settings.heroImage),
  aboutImage: safeMediaUrl(settings.aboutImage),
  deliveryFee: Number(settings.deliveryFee),
  freeDeliveryThreshold: Number(settings.freeDeliveryThreshold),
  deliveryPricePerKm: Number(settings.deliveryPricePerKm),
  deliveryMinimumKm: Number(settings.deliveryMinimumKm),
  deliveryMinimumFee: Number(settings.deliveryMinimumFee),
  deliveryMaxDistanceKm: Number(settings.deliveryMaxDistanceKm),
  defaultMinimumOrder: Number(settings.defaultMinimumOrder || 0),
  vipMinSpend: Number(settings.vipMinSpend || 0),
  storeLatitude: numberOrNull(settings.storeLatitude),
  storeLongitude: numberOrNull(settings.storeLongitude),
  onlinePaymentConfigured: MERCADOPAGO_PUBLIC_READY,
  mercadoPagoPublicKey: MERCADOPAGO_PUBLIC_READY
    ? MERCADOPAGO_PUBLIC_KEY
    : "",
  passwordEmailConfigured: RESEND_READY,
  publicMenuUrl: PUBLIC_MENU_URL,
  whatsappWebhookConfigured: Boolean(WHATSAPP_WEBHOOK_URL),
});
const serializePublicSettings = (settings) => {
  const row = serializeSettings(settings);
  const fields = [
    "id",
    "storeName",
    "timezone",
    "phone",
    "whatsappPrimary",
    "whatsappSecondaryVisible",
    "instagram",
    "instagramUrl",
    "address",
    "openingHours",
    "deliveryFee",
    "freeDeliveryThreshold",
    "defaultMinimumOrder",
    "deliveryPricingMode",
    "deliveryHybridEnabled",
    "deliveryPricePerKm",
    "deliveryMinimumKm",
    "deliveryMinimumFee",
    "deliveryMaxDistanceKm",
    "estimatedDeliveryMin",
    "estimatedDeliveryMax",
    "heroTitle",
    "heroSubtitle",
    "heroStampTitle",
    "heroStampText",
    "menuTitle",
    "menuSubtitle",
    "homeProductLimit",
    "deliveryEnabled",
    "pickupEnabled",
    "schedulingEnabled",
    "isOpen",
    "cashPaymentEnabled",
    "onlinePaymentEnabled",
    "onlinePaymentConfigured",
    "mercadoPagoPublicKey",
    "passwordEmailConfigured",
    "publicMenuUrl",
    "logoImage",
    "heroEyebrow",
    "heroImage",
    "aboutEyebrow",
    "aboutTitle",
    "aboutText",
    "aboutImage",
    "promotionsTitle",
    "promotionsSubtitle",
    "footerText",
    "cartRecommendationsEnabled",
    "pwaEnabled",
  ];
  const publicRow = Object.fromEntries(
    fields.map((field) => [field, row[field]]),
  );
  publicRow.whatsappSecondary = row.whatsappSecondaryVisible
    ? row.whatsappSecondary
    : "";
  return publicRow;
};
let settingsCache = null;
let settingsCacheUntil = 0;
let settingsRequest = null;
const rememberSettings = (settings) => {
  settingsCache = settings;
  settingsCacheUntil = Date.now() + 5_000;
  return settings;
};
const getSettings = async () => {
  if (settingsCache && settingsCacheUntil > Date.now()) return settingsCache;
  if (settingsRequest) return settingsRequest;
  const request = prisma.businessSettings
    .upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default" },
    })
    .then(rememberSettings);
  settingsRequest = request;
  try {
    return await request;
  } finally {
    if (settingsRequest === request) settingsRequest = null;
  }
};
const simplePromotionIsActive = (row, now = new Date()) =>
  Boolean(
    row?.promoActive &&
      row?.promoPrice != null &&
      Number(row.promoPrice) >= 0 &&
      Number(row.promoPrice) < Number(row.price) &&
      (!row.promoStartAt || new Date(row.promoStartAt) <= now) &&
      (!row.promoEndAt || new Date(row.promoEndAt) >= now),
  );
const hasSimplePromotion = (row) => simplePromotionIsActive(row);
const effectiveSimplePrice = (row) =>
  hasSimplePromotion(row) ? Number(row.promoPrice) : Number(row.price);
const serializeFlavor = (flavor) => {
  const basePrice = Number(flavor.price),
    promo = hasSimplePromotion(flavor);
  return {
    ...flavor,
    basePrice,
    price: promo ? Number(flavor.promoPrice) : basePrice,
    promoPrice: numberOrNull(flavor.promoPrice),
    promoActive: Boolean(flavor.promoActive),
    promoActiveNow: promo,
    compareAtPrice: promo ? basePrice : null,
  };
};
const serializeModifierOption = (option) => {
  const basePrice = Number(option.price),
    promo = hasSimplePromotion(option);
  return {
    ...option,
    basePrice,
    price: promo ? Number(option.promoPrice) : basePrice,
    promoPrice: numberOrNull(option.promoPrice),
    promoActive: Boolean(option.promoActive),
    promoActiveNow: promo,
    compareAtPrice: promo ? basePrice : null,
  };
};
const serializeModifierGroup = (group) => ({
  ...group,
  minSelect: Number(group.minSelect || 0),
  maxSelect: Number(group.maxSelect || 1),
  options: (group.options || [])
    .map(serializeModifierOption)
    .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder)),
});
const serializeDeliveryArea = (area) => ({
  ...area,
  fee: Number(area.fee),
  distanceKm: numberOrNull(area.distanceKm),
  minimumOrder: Number(area.minimumOrder || 0),
  freeDeliveryThreshold: numberOrNull(area.freeDeliveryThreshold),
  neighborhood: area.neighborhood === "*" ? "Toda a cidade" : area.neighborhood,
  rawNeighborhood: area.neighborhood,
});
const promotionIsActive = (promotion, now = new Date()) =>
  Boolean(
    promotion?.active &&
      (!promotion.startAt || promotion.startAt <= now) &&
      (!promotion.endAt || promotion.endAt >= now),
  );
const normalizedPromotionSizePrices = (value) => {
  if (!value || Array.isArray(value) || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([sizeId, price]) => [cleanText(sizeId, 80), Number(price)])
      .filter(
        ([sizeId, price]) =>
          sizeId && Number.isFinite(price) && price >= 0,
      ),
  );
};
const validatePromotionSizePrices = (value, productSizes = []) => {
  if (value == null) return { ok: true, value: {} };
  if (Array.isArray(value) || typeof value !== "object")
    return { ok: false, value: {} };
  const basePrices = new Map(
    productSizes.map((entry) => [entry.sizeId, Number(entry.price)]),
  );
  const normalized = {};
  for (const [rawSizeId, rawPrice] of Object.entries(value)) {
    const sizeId = cleanText(rawSizeId, 80);
    if (rawPrice === "" || rawPrice == null) continue;
    const price = Number(rawPrice);
    const basePrice = basePrices.get(sizeId);
    if (
      !sizeId ||
      !Number.isFinite(basePrice) ||
      !Number.isFinite(price) ||
      price < 0 ||
      price >= basePrice
    )
      return { ok: false, value: {} };
    normalized[sizeId] = roundMoney(price);
  }
  return { ok: true, value: normalized };
};
const effectiveProductSizePrice = (product, productSize) => {
  const base = Number(productSize?.price ?? product?.price ?? 0);
  const promotion = promotionIsActive(product?.promotion)
    ? product.promotion
    : null;
  if (!promotion) return base;
  const configured = normalizedPromotionSizePrices(promotion.sizePrices)[
    productSize?.sizeId
  ];
  if (Number.isFinite(configured) && configured < base) return configured;
  const discount = Math.max(
    0,
    Number(promotion.originalPrice) - Number(promotion.promoPrice),
  );
  return Math.max(0, base - discount);
};
const serializePromotion = (promotion) =>
  promotion
    ? {
        ...promotion,
        originalPrice: Number(promotion.originalPrice),
        promoPrice: Number(promotion.promoPrice),
        sizePrices: normalizedPromotionSizePrices(promotion.sizePrices),
        activeNow: promotionIsActive(promotion),
      }
    : null;
const serializeProductSize = (entry) => ({
  id: entry.size.id,
  sizeId: entry.sizeId,
  name: entry.size.name,
  slug: entry.size.slug,
  diameterCm: entry.size.diameterCm,
  price: Number(entry.price),
  sortOrder: Number(entry.sortOrder ?? entry.size.sortOrder ?? 0),
  active: entry.size.active !== false,
});
const serializeProduct = (product) => ({
  ...product,
  price: Number(product.price),
  isFlavorOption: Boolean(product.isFlavorOption),
  availableSizes: (product.productSizes || [])
    .map(serializeProductSize)
    .filter((size) => size.active)
    .sort((a, b) => a.sortOrder - b.sortOrder),
  sizePrices: Object.fromEntries(
    (product.productSizes || []).map((entry) => [
      entry.sizeId,
      Number(entry.price),
    ]),
  ),
  stockTracked: Boolean(product.stockTracked),
  stockQuantity: Number(product.stockQuantity || 0),
  stockLowThreshold: Number(product.stockLowThreshold || 0),
  stockAvailable:
    !product.stockTracked || Number(product.stockQuantity || 0) > 0,
  promotion: serializePromotion(product.promotion),
  availableFlavors: (product.productFlavors || [])
    .map((entry) => serializeFlavor(entry.flavor))
    .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder)),
  flavorIds: (product.productFlavors || []).map((entry) => entry.flavorId),
  availableModifierGroups: (product.modifierGroups || [])
    .map((entry) => serializeModifierGroup(entry.group))
    .filter((group) => group.active !== false)
    .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder)),
  modifierGroupIds: (product.modifierGroups || []).map(
    (entry) => entry.groupId,
  ),
});
const effectiveProductPrice = (product) =>
  promotionIsActive(product?.promotion)
    ? Number(product.promotion.promoPrice)
    : Number(product.price);
const serializePublicFlavor = (flavor) => {
  const serialized = serializeFlavor(flavor);
  return {
    id: serialized.id,
    name: serialized.name,
    image: safeMediaUrl(serialized.image),
    price: serialized.price,
    basePrice: serialized.basePrice,
    compareAtPrice: serialized.compareAtPrice,
    promoActiveNow: serialized.promoActiveNow,
    sortOrder: serialized.sortOrder,
    active: serialized.active,
    stockAvailable:
      !flavor.stockTracked || Number(flavor.stockQuantity || 0) > 0,
  };
};
const serializePublicModifierOption = (option) => {
  const serialized = serializeModifierOption(option);
  return {
    id: serialized.id,
    groupId: serialized.groupId,
    name: serialized.name,
    description: serialized.description,
    image: safeMediaUrl(serialized.image),
    price: serialized.price,
    basePrice: serialized.basePrice,
    compareAtPrice: serialized.compareAtPrice,
    promoActiveNow: serialized.promoActiveNow,
    sortOrder: serialized.sortOrder,
    active: serialized.active,
    stockAvailable:
      !option.stockTracked || Number(option.stockQuantity || 0) > 0,
  };
};
const serializePublicModifierGroup = (group) => ({
  id: group.id,
  name: group.name,
  description: group.description,
  active: group.active !== false,
  required: group.required,
  minSelect: Number(group.minSelect || 0),
  maxSelect: Number(group.maxSelect || 1),
  sortOrder: group.sortOrder,
  options: (group.options || [])
    .filter((option) => option.active !== false)
    .map(serializePublicModifierOption)
    .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder)),
});
const serializePublicPromotion = (promotion) => {
  const serialized = serializePromotion(promotion);
  return serialized
    ? {
        id: serialized.id,
        title: serialized.title,
        subtitle: serialized.subtitle,
        image: safeMediaUrl(serialized.image),
        originalPrice: serialized.originalPrice,
        promoPrice: serialized.promoPrice,
        sizePrices: serialized.sizePrices,
        activeNow: serialized.activeNow,
        sortOrder: serialized.sortOrder,
        startAt: serialized.startAt,
        endAt: serialized.endAt,
        productId: serialized.productId,
      }
    : null;
};
const serializePublicProduct = (product) => {
  const promo = promotionIsActive(product?.promotion)
    ? product.promotion
    : null;
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    image: safeMediaUrl(product.image),
    badge: product.badge,
    categoryId: product.categoryId,
    subcategoryId: product.subcategoryId,
    category: product.category
      ? {
          id: product.category.id,
          name: product.category.name,
          slug: product.category.slug,
        }
      : undefined,
    subcategory: product.subcategory
      ? {
          id: product.subcategory.id,
          name: product.subcategory.name,
          slug: product.subcategory.slug,
        }
      : undefined,
    featured: Boolean(product.featured),
    available: Boolean(product.available),
    sortOrder: Number(product.sortOrder || 0),
    allowFlavorSplit: Boolean(product.allowFlavorSplit),
    isFlavorOption: Boolean(product.isFlavorOption),
    maxFlavors: Math.min(4, Number(product.maxFlavors || 1)),
    flavorPricingMode: product.flavorPricingMode,
    pausedUntil: product.pausedUntil,
    availableDays: product.availableDays,
    availableStartTime: product.availableStartTime,
    availableEndTime: product.availableEndTime,
    removableIngredients: Array.isArray(product.removableIngredients)
      ? product.removableIngredients
      : [],
    basePrice: Number(product.price),
    price: promo ? Number(promo.promoPrice) : Number(product.price),
    compareAtPrice: promo ? Number(promo.originalPrice) : null,
    stockAvailable:
      !product.stockTracked || Number(product.stockQuantity || 0) > 0,
    promotion: promo ? serializePublicPromotion(promo) : null,
    availableSizes: (product.productSizes || [])
      .map((entry) => ({
        ...serializeProductSize(entry),
        promoPrice: promotionIsActive(product?.promotion)
          ? effectiveProductSizePrice(product, entry)
          : null,
      }))
      .filter((size) => size.active)
      .sort((a, b) => a.sortOrder - b.sortOrder),
    availableFlavors: (product.productFlavors || [])
      .map((entry) => serializePublicFlavor(entry.flavor))
      .filter((flavor) => flavor.active && flavor.stockAvailable)
      .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder)),
    flavorIds: (product.productFlavors || []).map((entry) => entry.flavorId),
    availableModifierGroups: (product.modifierGroups || [])
      .filter((entry) => entry.group?.active !== false)
      .map((entry) => serializePublicModifierGroup(entry.group))
      .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder)),
    modifierGroupIds: (product.modifierGroups || [])
      .filter((entry) => entry.group?.active !== false)
      .map((entry) => entry.groupId),
  };
};
const serializeFlavorProduct = (product) => {
  const serialized = serializePublicProduct(product);
  return {
    id: serialized.id,
    categoryId: serialized.categoryId,
    name: serialized.name,
    image: serialized.image,
    price: serialized.price,
    basePrice: serialized.basePrice,
    compareAtPrice: serialized.compareAtPrice,
    sortOrder: serialized.sortOrder,
    active: serialized.available,
    stockAvailable: serialized.stockAvailable,
    availableSizes: serialized.availableSizes || [],
  };
};
const attachProductFlavorOptions = (serialized, flavorProducts) => {
  if (!serialized.allowFlavorSplit) return serialized;
  const baseFlavor = {
    id: serialized.id,
    name: serialized.name,
    image: serialized.image,
    price: serialized.price,
    basePrice: serialized.basePrice,
    compareAtPrice: serialized.compareAtPrice,
    sortOrder: -1,
    active: serialized.available !== false,
    stockAvailable: serialized.stockAvailable !== false,
    availableSizes: serialized.availableSizes || [],
  };
  const others = flavorProducts
    .filter(
      (product) =>
        product.id !== serialized.id &&
        product.categoryId === serialized.categoryId,
    )
    .map(serializeFlavorProduct);
  return { ...serialized, availableFlavors: [baseFlavor, ...others] };
};
const serializeTableSession = (session) => {
  if (!session) return null;
  const orders = (session.orders || []).map(serializeOrder);
  return {
    ...session,
    subtotal: Number(session.subtotal || 0),
    total: Number(session.total || 0),
    amountPaid: numberOrNull(session.amountPaid),
    changeAmount: numberOrNull(session.changeAmount),
    orders,
    summary: summarizeTableOrders(orders),
  };
};
const serializeOrder = (order) => {
  const etaMinMinutes = Number(order.estimatedDeliveryMin ?? 30);
  const etaMaxMinutes = Number(order.estimatedDeliveryMax ?? 45);
  const accepted = order.acceptedAt ? new Date(order.acceptedAt) : null;
  const acceptedValid = accepted && !Number.isNaN(accepted.getTime());
  const estimatedFrom = acceptedValid
    ? new Date(accepted.getTime() + etaMinMinutes * 60_000)
    : null;
  const estimatedTo = acceptedValid
    ? new Date(accepted.getTime() + etaMaxMinutes * 60_000)
    : null;
  return {
    ...order,
    estimatedDeliveryMin: etaMinMinutes,
    estimatedDeliveryMax: etaMaxMinutes,
    estimatedFrom: estimatedFrom?.toISOString() || null,
    estimatedTo: estimatedTo?.toISOString() || null,
    shortCode: order.id.slice(-8).toUpperCase(),
    subtotal: Number(order.subtotal),
    deliveryFee: Number(order.deliveryFee),
    total: Number(order.total),
    changeFor: numberOrNull(order.changeFor),
    distanceKm: numberOrNull(order.distanceKm),
    latitude: numberOrNull(order.latitude),
    longitude: numberOrNull(order.longitude),
    deliveryArea: order.deliveryArea
      ? serializeDeliveryArea(order.deliveryArea)
      : undefined,
    table: order.table || undefined,
    tableSession: order.tableSession
      ? {
          ...order.tableSession,
          subtotal: Number(order.tableSession.subtotal || 0),
          total: Number(order.tableSession.total || 0),
          amountPaid: numberOrNull(order.tableSession.amountPaid),
          changeAmount: numberOrNull(order.tableSession.changeAmount),
        }
      : undefined,
    items: order.items?.map((item) => ({
      ...item,
      unitPrice: Number(item.unitPrice),
      product: item.product ? serializeProduct(item.product) : undefined,
      flavors:
        item.flavors?.map((f) => ({
          ...f,
          unitPrice: Number(f.unitPrice),
          flavor: f.flavor ? serializeFlavor(f.flavor) : undefined,
        })) || [],
      options:
        item.options?.map((o) => ({
          ...o,
          unitPrice: Number(o.unitPrice),
          option: o.option ? serializeModifierOption(o.option) : undefined,
        })) || [],
    })),
    history: (() => {
      const seen = new Set();
      return (order.history || []).filter((entry) => {
        const actor =
          entry.changedByUserId ||
          entry.changedByName ||
          entry.changedByRole ||
          "";
        const key = `${entry.status}:${actor}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    })(),
  };
};

const serializeCustomerOrder = (order) => {
  const serialized = serializeOrder(order);
  return {
    id: serialized.id,
    shortCode: serialized.shortCode,
    trackingCode: serialized.trackingCode,
    customerName: serialized.customerName,
    customerPhone: serialized.customerPhone,
    fulfillmentType: serialized.fulfillmentType,
    table: serialized.table
      ? {
          number: serialized.table.number,
          name: serialized.table.name || `Mesa ${serialized.table.number}`,
        }
      : null,
    postalCode: serialized.postalCode,
    street: serialized.street,
    addressNumber: serialized.addressNumber,
    complement: serialized.complement,
    neighborhood: serialized.neighborhood,
    city: serialized.city,
    state: serialized.state,
    referencePoint: serialized.referencePoint,
    notes: serialized.notes,
    subtotal: serialized.subtotal,
    deliveryFee: serialized.deliveryFee,
    discountAmount: Number(serialized.discountAmount || 0),
    total: serialized.total,
    couponCode: serialized.couponCode,
    paymentMethod: serialized.paymentMethod,
    paymentMethodLabel: serialized.paymentMethodLabel || null,
    paymentStatus: serialized.paymentStatus,
    paymentUrl: serialized.paymentUrl,
    scheduledAt: serialized.scheduledAt,
    acceptedAt: serialized.acceptedAt,
    status: serialized.status,
    cancelReason: serialized.cancelReason,
    estimatedDeliveryMin: serialized.estimatedDeliveryMin,
    estimatedDeliveryMax: serialized.estimatedDeliveryMax,
    estimatedFrom: serialized.estimatedFrom,
    estimatedTo: serialized.estimatedTo,
    assignedCourier: serialized.assignedCourier
      ? {
          id: serialized.assignedCourier.id,
          name: serialized.assignedCourier.name,
        }
      : null,
    createdAt: serialized.createdAt,
    updatedAt: serialized.updatedAt,
    items: (serialized.items || []).map((item) => ({
      id: item.id,
      productId: item.productId,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      notes: item.notes,
      sizeName: item.sizeName || null,
      sizePrice: numberOrNull(item.sizePrice),
      flavors: (item.flavors || []).map((flavor) => ({
        id: flavor.id,
        flavorId: flavor.flavorId,
        name: flavor.name,
        unitPrice: flavor.unitPrice,
      })),
      options: (item.options || []).map((option) => ({
        id: option.id,
        optionId: option.optionId,
        groupName: option.groupName,
        optionName: option.optionName,
        unitPrice: option.unitPrice,
      })),
    })),
    history: (serialized.history || []).map((entry) => ({
      id: entry.id,
      status: entry.status,
      createdAt: entry.createdAt,
    })),
  };
};

const REFRESH_COOKIE = secureSessionCookie
  ? "__Secure-master_pizzaria_refresh"
  : "master_pizzaria_refresh";
const ACCESS_TOKEN_SECONDS = 60 * 60;
const refreshTokenSeconds = (user) =>
  user?.isAdmin ? 12 * 60 * 60 : 30 * 24 * 60 * 60;

function parseCookies(req) {
  return String(req.headers.cookie || "")
    .split(";")
    .reduce((cookies, part) => {
      const separator = part.indexOf("=");
      if (separator < 1) return cookies;
      const key = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      try {
        cookies[key] = decodeURIComponent(value);
      } catch {
        cookies[key] = value;
      }
      return cookies;
    }, {});
}

function refreshCookieOptions(maxAgeSeconds = 0) {
  return [
    `${REFRESH_COOKIE}=`,
    "Path=/api/auth",
    "HttpOnly",
    secureSessionCookie ? "Secure" : "",
    `SameSite=${secureSessionCookie ? "None" : "Lax"}`,
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
  ]
    .filter(Boolean)
    .join("; ");
}

function issueAccessToken(user) {
  return jwt.sign(
    { id: user.id, sv: Number(user.sessionVersion || 0), type: "access" },
    JWT_SECRET,
    {
      algorithm: "HS256",
      expiresIn: ACCESS_TOKEN_SECONDS,
      issuer: "master-pizza-api",
      audience: "master-pizza-web",
      jwtid: crypto.randomUUID(),
    },
  );
}

function issueRefreshToken(user) {
  return jwt.sign(
    { id: user.id, sv: Number(user.sessionVersion || 0), type: "refresh" },
    JWT_SECRET,
    {
      algorithm: "HS256",
      expiresIn: refreshTokenSeconds(user),
      issuer: "master-pizza-api",
      audience: "master-pizza-refresh",
      jwtid: crypto.randomUUID(),
    },
  );
}

function startSession(res, user) {
  const refreshSeconds = refreshTokenSeconds(user);
  const cookie = refreshCookieOptions(refreshSeconds).replace(
    `${REFRESH_COOKIE}=`,
    `${REFRESH_COOKIE}=${encodeURIComponent(issueRefreshToken(user))}`,
  );
  res.setHeader("Set-Cookie", cookie);
  return {
    token: issueAccessToken(user),
    user: publicUser(user),
    accessTokenExpiresIn: ACCESS_TOKEN_SECONDS,
    sessionExpiresIn: refreshSeconds,
  };
}

function endSession(res) {
  res.setHeader("Set-Cookie", refreshCookieOptions(0));
}
// Consultas administrativas chegam em rajadas. A deduplicação mantém a
// validação no banco, mas evita várias buscas idênticas pelo mesmo usuário.
const authenticatedUserCache = createAsyncTtlCache({
  ttlMs: 1_000,
  maxEntries: 500,
});
async function authenticateBearer(req) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const payload = jwt.verify(header.slice(7), JWT_SECRET, {
    algorithms: ["HS256"],
    issuer: "master-pizza-api",
    audience: "master-pizza-web",
  });
  if (payload.type !== "access") throw new Error("INVALID_SESSION");
  const cacheKey = `${payload.id}:${Number(payload.sv || 0)}`;
  const user = await authenticatedUserCache.get(cacheKey, () =>
    prisma.user.findUnique({ where: { id: payload.id } }),
  );
  if (!user || Number(payload.sv) !== Number(user.sessionVersion || 0))
    throw new Error("INVALID_SESSION");
  if (user.isAdmin && user.staffActive === false)
    throw new Error("ADMIN_DISABLED");
  if (!user.isAdmin && user.customerBlocked)
    throw new Error("CUSTOMER_BLOCKED");
  return user;
}
async function auth(req, res, next) {
  if (req.user) return next();
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer "))
    return res
      .status(401)
      .json({ code: "AUTH_REQUIRED", message: "Faça login para continuar." });
  try {
    const user = await authenticateBearer(req);
    req.authUser = user;
    req.user = {
      id: user.id,
      name: user.name,
      isAdmin: user.isAdmin,
      adminPermissions: normalizeAdminPermissions(user.adminPermissions),
      staffRole: user.staffRole || null,
    };
    next();
  } catch (error) {
    if (error?.message === "ADMIN_DISABLED")
      return res.status(403).json({
        code: "ADMIN_DISABLED",
        message: "Este acesso administrativo está desativado.",
      });
    if (error?.message === "CUSTOMER_BLOCKED")
      return res.status(403).json({
        code: "CUSTOMER_BLOCKED",
        message: "Esta conta foi bloqueada pela loja.",
      });
    // Falha do Neon não invalida o JWT. Encaminha como 503 para o navegador
    // manter a sessão e permitir nova tentativa quando o banco se recuperar.
    if (isDatabaseAvailabilityError(error)) return next(error);
    return res.status(401).json({
      code: "INVALID_SESSION",
      message: "Sua sessão expirou. Entre novamente.",
    });
  }
}
async function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return next();
  if (!header.startsWith("Bearer "))
    return res
      .status(401)
      .json({ code: "INVALID_SESSION", message: "Sessão inválida." });
  return auth(req, res, next);
}
async function admin(req, res, next) {
  if (req.adminUser) return next();
  if (!req.user?.isAdmin)
    return res
      .status(403)
      .json({ code: "ADMIN_ONLY", message: "Acesso restrito." });
  const user =
    req.authUser ||
    (await prisma.user.findUnique({ where: { id: req.user.id } }));
  if (!user?.isAdmin || user.staffActive === false)
    return res.status(403).json({
      code: "ADMIN_DISABLED",
      message: "Este acesso administrativo está desativado.",
    });
  req.adminUser = user;
  req.adminPermissions = normalizeAdminPermissions(user.adminPermissions);
  next();
}

const ADMIN_PERMISSION_KEYS = [
  "overview",
  "orders",
  "analytics",
  "kitchen",
  "catalog",
  "products",
  "inventory",
  "promotions",
  "alterations",
  "categories",
  "delivery",
  "customers",
  "reports",
  "settings",
  "operations",
  "tables",
];
function normalizeStaffRole(value) {
  const role = cleanText(value, 20).toUpperCase();
  return ["STAFF", "DELIVERY", "WAITER"].includes(role) ? role : "STAFF";
}
function permissionsForStaffRole(role, requested = []) {
  if (role === "DELIVERY") return ["orders"];
  if (role === "WAITER") return ["tables"];
  return requested;
}
function hasAdminPermission(req, key) {
  if (!req.adminUser?.isAdmin) return false;
  if (req.adminPermissions == null) return true;
  const catalogKeys = new Set([
    "products",
    "promotions",
    "alterations",
    "categories",
  ]);
  if (key === "catalog")
    return (
      req.adminPermissions.includes("catalog") ||
      [...catalogKeys].some((item) => req.adminPermissions.includes(item))
    );
  if (catalogKeys.has(key) && req.adminPermissions.includes("catalog"))
    return true;
  return req.adminPermissions.includes(key);
}
function hasTableAccess(req) {
  return (
    req.adminUser?.isAdmin &&
    req.adminUser.staffActive !== false &&
    req.adminUser.staffRole !== "DELIVERY" &&
    hasAdminPermission(req, "tables")
  );
}
function hasAuthenticatedTableAccess(req) {
  const user = req.authUser;
  const permissions = normalizeAdminPermissions(user?.adminPermissions);
  return (
    user?.isAdmin &&
    user.staffActive !== false &&
    user.staffRole !== "DELIVERY" &&
    (permissions == null || permissions.includes("tables"))
  );
}
function ownerOnly(req, res, next) {
  if (req.adminPermissions == null) return next();
  return res.status(403).json({
    code: "OWNER_ONLY",
    message: "Somente o administrador principal pode gerenciar funcionários.",
  });
}

async function findUserByIdentifier(identifier) {
  const raw = cleanText(identifier, 180);
  if (!raw) return null;
  if (raw.includes("@")) {
    const email = raw.toLowerCase();
    if (!validEmail(email)) return null;
    return prisma.user.findUnique({ where: { email } });
  }
  const phone = normalizePhone(raw);
  if (!validPhone(phone)) return null;
  return prisma.user.findUnique({ where: { phone } });
}

async function sendResetEmail(user, token) {
  if (!RESEND_READY || !validEmail(user?.email)) return false;
  const resetUrl = `${FRONTEND_URL.replace(/\/$/, "")}/redefinir-senha#token=${encodeURIComponent(token)}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `password-reset-${crypto
        .createHash("sha256")
        .update(token)
        .digest("hex")}`,
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [user.email],
      subject: "Redefinição de senha • Master Pizzaria",
      text: `Olá, ${user.name}. Use este link para criar uma nova senha: ${resetUrl}\n\nO link expira em 30 minutos. Se você não pediu a alteração, ignore este e-mail.`,
      html: `<div style="background:#111214;padding:32px 16px;font-family:Arial,sans-serif;color:#f7f5f1"><div style="max-width:560px;margin:auto;background:#1d2025;border:1px solid #343941;border-radius:18px;padding:28px"><div style="height:5px;background:#e31b23;border-radius:5px;margin-bottom:24px"></div><h2 style="margin:0 0 14px">Redefinição de senha</h2><p>Olá, ${escapeHtml(user.name)}.</p><p style="color:#c8cbd0;line-height:1.6">Recebemos uma solicitação para redefinir a senha da sua conta Master Pizzaria.</p><p style="margin:24px 0"><a href="${escapeHtml(resetUrl)}" style="display:inline-block;background:#e31b23;color:#fff;text-decoration:none;padding:13px 19px;border-radius:10px;font-weight:700">Criar nova senha</a></p><p style="color:#9fa4ac;font-size:13px;line-height:1.5">Este link é de uso único e expira em 30 minutos. Se você não pediu a alteração, ignore este e-mail.</p></div></div>`,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(
      "Falha no envio de recuperação de senha:",
      response.status,
      detail.slice(0, 300),
    );
  }
  return response.ok;
}

const DEFAULT_STORE_HOURS = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];
let storeHoursCache = null;
let storeHoursCacheUntil = 0;
let storeHoursRequest = null;
const clearStoreHoursCache = () => {
  storeHoursCache = null;
  storeHoursCacheUntil = 0;
};
async function ensureStoreHours() {
  if (storeHoursCache && storeHoursCacheUntil > Date.now())
    return storeHoursCache;
  if (storeHoursRequest) return storeHoursRequest;
  const request = (async () => {
    const count = await prisma.storeHour.count();
    if (!count) {
      await prisma.storeHour.createMany({
        data: DEFAULT_STORE_HOURS.map((label, dayOfWeek) => ({
          dayOfWeek,
          label,
          openTime: "18:00",
          closeTime: "23:00",
          closed: false,
          sortOrder: dayOfWeek === 0 ? 7 : dayOfWeek,
        })),
        skipDuplicates: true,
      });
    }
    const rows = await prisma.storeHour.findMany({
      orderBy: [{ sortOrder: "asc" }, { dayOfWeek: "asc" }],
    });
    storeHoursCache = rows;
    storeHoursCacheUntil = Date.now() + 30_000;
    return rows;
  })();
  storeHoursRequest = request;
  try {
    return await request;
  } finally {
    if (storeHoursRequest === request) storeHoursRequest = null;
  }
}

function storeClockParts(timezone = "America/Maceio", date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    dayOfWeek: dayMap[get("weekday")],
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

function addLocalDays(dateKey, offset) {
  const [y, m, d] = String(dateKey).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + offset);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

async function nextManualCloseMarker(settings, hours = null) {
  const rows = hours || (await ensureStoreHours());
  const now = storeClockParts(settings.timezone || "America/Maceio");
  for (let offset = 0; offset <= 14; offset++) {
    const dateKey = addLocalDays(now.dateKey, offset);
    const [y, m, d] = dateKey.split("-").map(Number);
    const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const rule = rows.find((item) => Number(item.dayOfWeek) === dayOfWeek);
    if (!rule || rule.closed) continue;
    const close = parseClock(rule.closeTime);
    if (close == null) continue;
    if (offset === 0 && close <= now.minutes) continue;
    return { dateKey, minutes: close };
  }
  return null;
}

async function autoCloseStoreIfNeeded(currentSettings = null) {
  const settings = currentSettings || (await getSettings());
  if (!settings.isOpen) return settings;
  const now = storeClockParts(settings.timezone || "America/Maceio");

  if (
    settings.manualOpenUntilDate &&
    Number.isInteger(settings.manualOpenUntilMinutes)
  ) {
    const beforeDate = now.dateKey < settings.manualOpenUntilDate;
    const sameDateBeforeClose =
      now.dateKey === settings.manualOpenUntilDate &&
      now.minutes < settings.manualOpenUntilMinutes;
    if (beforeDate || sameDateBeforeClose) return settings;
    return rememberSettings(await prisma.businessSettings.update({
      where: { id: "default" },
      data: {
        isOpen: false,
        manualOpenUntilDate: null,
        manualOpenUntilMinutes: null,
      },
    }));
  }

  const hours = await ensureStoreHours();
  const rule = hours.find((item) => Number(item.dayOfWeek) === now.dayOfWeek);
  const open = rule ? parseClock(rule.openTime) : null;
  const close = rule ? parseClock(rule.closeTime) : null;
  const outsideConfiguredHours =
    !rule ||
    rule.closed ||
    open == null ||
    close == null ||
    now.minutes < open ||
    now.minutes >= close;
  if (outsideConfiguredHours) {
    return rememberSettings(await prisma.businessSettings.update({
      where: { id: "default" },
      data: { isOpen: false },
    }));
  }
  return settings;
}

async function activateDueScheduledOrders() {
  const now = Date.now();
  const candidates = await prisma.order.findMany({
    where: {
      status: "SCHEDULED",
      paymentStatus: { in: ["APPROVED", "CASH_PENDING"] },
      scheduledAt: { not: null },
    },
    select: { id: true, scheduledAt: true, estimatedDeliveryMax: true },
    take: 250,
    orderBy: { scheduledAt: "asc" },
  });
  for (const order of candidates) {
    const target = new Date(order.scheduledAt).getTime();
    const maxMinutes = Math.max(5, Number(order.estimatedDeliveryMax || 45));
    if (!Number.isFinite(target) || now < target - maxMinutes * 60_000)
      continue;
    await prisma
      .$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${order.id}))`;
        const changed = await tx.order.updateMany({
          where: { id: order.id, status: "SCHEDULED" },
          data: { status: "RECEIVED" },
        });
        if (changed.count)
          await tx.orderStatusHistory.create({
            data: {
              orderId: order.id,
              status: "RECEIVED",
              changedByName: "Sistema",
              changedByRole: "AUTOMAÇÃO",
            },
          });
      })
      .catch(() => {});
  }
}

async function fetchJson(url, timeoutMs = 6500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "MasterPizza/2.8 (address lookup)" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

const cepCache = new Map();
function cleanCep(value) {
  return String(value || "").replace(/\D/g, "");
}
async function resolveCep(rawCep) {
  const cep = cleanCep(rawCep);
  if (!/^\d{8}$/.test(cep))
    throw Object.assign(new Error("CEP inválido."), { code: "INVALID_CEP" });
  const cached = cepCache.get(cep);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let via = null;
  try {
    const data = await fetchJson(`https://viacep.com.br/ws/${cep}/json/`);
    if (!data?.erro)
      via = {
        street: data.logradouro || "",
        neighborhood: data.bairro || "",
        city: data.localidade || "",
        state: data.uf || "",
      };
  } catch {}

  let coords = null;
  try {
    const data = await fetchJson(`https://cep.awesomeapi.com.br/json/${cep}`);
    const latitude = Number(data?.lat),
      longitude = Number(data?.lng);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      coords = { latitude, longitude, source: "AwesomeAPI" };
      if (!via)
        via = {
          street: data.address || "",
          neighborhood: data.district || "",
          city: data.city || "",
          state: data.state || "",
        };
    }
  } catch {}

  if (!coords) {
    try {
      const data = await fetchJson(
        `https://brasilapi.com.br/api/cep/v2/${cep}`,
      );
      const longitude = Number(data?.location?.coordinates?.longitude);
      const latitude = Number(data?.location?.coordinates?.latitude);
      if (Number.isFinite(latitude) && Number.isFinite(longitude))
        coords = { latitude, longitude, source: "BrasilAPI" };
      if (!via)
        via = {
          street: data.street || "",
          neighborhood: data.neighborhood || "",
          city: data.city || "",
          state: data.state || "",
        };
    } catch {}
  }

  if (!via && !coords)
    throw Object.assign(new Error("CEP não encontrado."), {
      code: "CEP_NOT_FOUND",
    });
  const value = {
    postalCode: cep,
    street: via?.street || "",
    neighborhood: via?.neighborhood || "",
    city: via?.city || "",
    state: via?.state || "",
    latitude: coords?.latitude ?? null,
    longitude: coords?.longitude ?? null,
    source: coords?.source || "ViaCEP",
  };
  cepCache.set(cep, { value, expiresAt: Date.now() + 6 * 60 * 60 * 1000 });
  return value;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const earth = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const NOMINATIM_EMAIL = cleanText(process.env.NOMINATIM_EMAIL, 180);
let nominatimQueue = Promise.resolve();
let nominatimLastRequestAt = 0;

function normalizeState(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .slice(0, 2);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function nominatimSearch(query) {
  const task = nominatimQueue.then(async () => {
    const waitFor = Math.max(0, 1100 - (Date.now() - nominatimLastRequestAt));
    if (waitFor) await wait(waitFor);
    const params = new URLSearchParams({
      q: query,
      format: "jsonv2",
      limit: "1",
      countrycodes: "br",
      addressdetails: "1",
    });
    if (NOMINATIM_EMAIL) params.set("email", NOMINATIM_EMAIL);
    try {
      const response = await fetch(
        `${NOMINATIM_BASE_URL}/search?${params.toString()}`,
        {
          headers: {
            "User-Agent": "MasterPizza/2.11 neighborhood-delivery",
            "Accept-Language": "pt-BR,pt;q=0.9",
          },
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`);
      const rows = await response.json();
      const first = Array.isArray(rows) ? rows[0] : null;
      const latitude = Number(first?.lat),
        longitude = Number(first?.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude))
        return null;
      return {
        latitude,
        longitude,
        displayName: first?.display_name || query,
        source: "Nominatim",
      };
    } finally {
      nominatimLastRequestAt = Date.now();
    }
  });
  nominatimQueue = task.catch(() => null);
  return task;
}

async function drivingRouteDistanceKm(origin, destination) {
  try {
    const url = `${OSRM_BASE_URL}/route/v1/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?overview=false&alternatives=false&steps=false`;
    const data = await fetchJson(url, 8000);
    const meters = Number(data?.routes?.[0]?.distance);
    if (data?.code === "Ok" && Number.isFinite(meters) && meters >= 0)
      return { distanceKm: meters / 1000, source: "OSRM" };
  } catch {}
  const direct = haversineKm(
    origin.latitude,
    origin.longitude,
    destination.latitude,
    destination.longitude,
  );
  if (!Number.isFinite(direct)) return null;
  return { distanceKm: direct * 1.22, source: "Haversine+22%" };
}

async function resolveStoreCoordinates(settings) {
  const directLat = Number(settings.storeLatitude),
    directLon = Number(settings.storeLongitude);
  if (
    settings.storeGeoSource === "manual" &&
    Number.isFinite(directLat) &&
    Number.isFinite(directLon)
  ) {
    return { latitude: directLat, longitude: directLon, source: "manual" };
  }

  const addressKey = normalizePlace(settings.address);
  if (
    addressKey &&
    settings.storeGeoSource === "address" &&
    settings.storeGeoAddressKey === addressKey &&
    Number.isFinite(directLat) &&
    Number.isFinite(directLon)
  ) {
    return {
      latitude: directLat,
      longitude: directLon,
      source: "address-cache",
    };
  }

  if (cleanText(settings.address, 220)) {
    try {
      const located = await nominatimSearch(`${settings.address}, Brasil`);
      if (located) {
        await prisma.businessSettings
          .update({
            where: { id: "default" },
            data: {
              storeLatitude: located.latitude,
              storeLongitude: located.longitude,
              storeGeoSource: "address",
              storeGeoAddressKey: addressKey,
            },
          })
          .catch(() => {});
        return {
          latitude: located.latitude,
          longitude: located.longitude,
          source: "address",
        };
      }
    } catch {}
  }

  if (Number.isFinite(directLat) && Number.isFinite(directLon)) {
    return {
      latitude: directLat,
      longitude: directLon,
      source: settings.storeGeoSource || "configured",
    };
  }

  const cep = cleanCep(settings.storePostalCode);
  if (!cep) return null;
  try {
    const address = await resolveCep(cep);
    if (address.latitude == null || address.longitude == null) return null;
    const latitude = Number(address.latitude),
      longitude = Number(address.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    await prisma.businessSettings
      .update({
        where: { id: "default" },
        data: {
          storeLatitude: latitude,
          storeLongitude: longitude,
          storeCoordinatesCep: cep,
          storeGeoSource: "cep",
          storeGeoAddressKey: addressKey || null,
        },
      })
      .catch(() => {});
    return {
      latitude,
      longitude,
      source: `postalCode:${address.source || "provider"}`,
    };
  } catch {
    return null;
  }
}

async function resolveAutomaticNeighborhoodDistance(
  settings,
  { city, state, neighborhood },
) {
  const cityName = cleanText(city, 100),
    neighborhoodName = cleanText(neighborhood, 100),
    stateName = normalizeState(state);
  const cityKey = normalizeCity(cityName),
    neighborhoodKey = normalizePlace(neighborhoodName),
    stateKey = normalizePlace(stateName);
  if (!cityKey || !neighborhoodKey) return null;

  const cached = await prisma.deliveryGeoCache
    .findUnique({
      where: {
        cityKey_stateKey_neighborhoodKey: {
          cityKey,
          stateKey,
          neighborhoodKey,
        },
      },
    })
    .catch(() => null);
  const fresh =
    cached &&
    Date.now() - new Date(cached.updatedAt).getTime() <
      90 * 24 * 60 * 60 * 1000;
  if (fresh)
    return {
      distanceKm: Number(cached.distanceKm),
      latitude: Number(cached.latitude),
      longitude: Number(cached.longitude),
      source: cached.source || "cache",
      cached: true,
    };

  const store = await resolveStoreCoordinates(settings);
  if (!store) return { error: "STORE_LOCATION_REQUIRED" };

  const query = [neighborhoodName, cityName, stateName, "Brasil"]
    .filter(Boolean)
    .join(", ");
  const destination = await nominatimSearch(query).catch(() => null);
  if (!destination) return { error: "NEIGHBORHOOD_GEO_NOT_FOUND" };
  const route = await drivingRouteDistanceKm(store, destination);
  if (!route) return { error: "ROUTE_NOT_FOUND" };
  const distanceKm = roundMoney(route.distanceKm);

  await prisma.deliveryGeoCache
    .upsert({
      where: {
        cityKey_stateKey_neighborhoodKey: {
          cityKey,
          stateKey,
          neighborhoodKey,
        },
      },
      update: {
        city: cityName,
        state: stateName,
        neighborhood: neighborhoodName,
        latitude: destination.latitude,
        longitude: destination.longitude,
        distanceKm,
        source: `${destination.source}+${route.source}`,
      },
      create: {
        city: cityName,
        cityKey,
        state: stateName,
        stateKey,
        neighborhood: neighborhoodName,
        neighborhoodKey,
        latitude: destination.latitude,
        longitude: destination.longitude,
        distanceKm,
        source: `${destination.source}+${route.source}`,
      },
    })
    .catch(() => {});
  return {
    distanceKm,
    latitude: destination.latitude,
    longitude: destination.longitude,
    source: `${destination.source}+${route.source}`,
    cached: false,
  };
}

async function findFixedDeliveryArea({ city, neighborhood, deliveryAreaId }) {
  if (deliveryAreaId) {
    const byId = await prisma.deliveryArea.findFirst({
      where: { id: deliveryAreaId, active: true },
    });
    if (byId) return byId;
  }
  if (!city) return null;
  const active = await prisma.deliveryArea.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { neighborhood: "asc" }],
  });
  const cityKey = normalizeCity(city);
  const neighborhoodKey = normalizePlace(neighborhood);
  const exact = active.find(
    (item) =>
      normalizeCity(item.city) === cityKey &&
      item.neighborhood !== "*" &&
      normalizePlace(item.neighborhood) === neighborhoodKey,
  );
  if (exact) return exact;
  return (
    active.find(
      (item) =>
        normalizeCity(item.city) === cityKey && item.neighborhood === "*",
    ) || null
  );
}

function deliveryFeeFromConfiguredDistance(settings, distanceKm, free = false) {
  const distance = Math.max(0, Number(distanceKm || 0));
  const maxKm = Math.max(0, Number(settings.deliveryMaxDistanceKm || 0));
  if (maxKm > 0 && distance > maxKm)
    return {
      ok: false,
      code: "OUT_OF_RANGE",
      distanceKm: roundMoney(distance),
      message: `A distância estimada para este bairro é ${distance.toFixed(1)} km, acima do raio padrão de ${maxKm.toFixed(1)} km. Se a loja quiser atender essa região mesmo assim, pode cadastrar uma exceção fixa no painel.`,
    };
  const minimumKm = Math.max(0, Number(settings.deliveryMinimumKm || 0));
  const minimumFee = Math.max(0, Number(settings.deliveryMinimumFee || 0));
  const pricePerKm = Math.max(0, Number(settings.deliveryPricePerKm || 0));
  const fee = free
    ? 0
    : distance <= minimumKm
      ? minimumFee
      : minimumFee + Math.max(0, distance - minimumKm) * pricePerKm;
  return {
    ok: true,
    mode: "NEIGHBORHOOD_DISTANCE",
    fee: roundMoney(fee),
    distanceKm: roundMoney(distance),
    minimumKm,
  };
}

async function calculateDeliveryQuote({
  settings,
  postalCode,
  city,
  state,
  neighborhood,
  deliveryAreaId,
  subtotal = 0,
  resolvedCep = null,
}) {
  // A gratuidade é aplicada depois em applyDeliveryPolicies, pois uma região pode
  // sobrescrever o limite global. Aqui calculamos sempre a tarifa-base.
  const free = false;
  let address = resolvedCep;
  if (!address && postalCode) {
    try {
      address = await resolveCep(postalCode);
    } catch {
      address = null;
    }
  }
  const quoteCity = city || address?.city || "";
  const quoteState = state || address?.state || "";
  const quoteNeighborhood = neighborhood || address?.neighborhood || "";
  const configuredArea = await findFixedDeliveryArea({
    city: quoteCity,
    neighborhood: quoteNeighborhood,
    deliveryAreaId,
  });
  if (configuredArea) {
    if (
      configuredArea.distanceKm != null &&
      configuredArea.neighborhood !== "*"
    ) {
      const distanceQuote = deliveryFeeFromConfiguredDistance(
        settings,
        Number(configuredArea.distanceKm),
        free,
      );
      if (!distanceQuote.ok) return distanceQuote;
      return {
        ...distanceQuote,
        mode: "MANUAL_NEIGHBORHOOD_DISTANCE",
        area: configuredArea,
        address,
        neighborhoodBased: true,
        autoCalculated: false,
      };
    }
    return {
      ok: true,
      mode: "FIXED",
      fee: free ? 0 : Number(configuredArea.fee),
      distanceKm: numberOrNull(configuredArea.distanceKm),
      area: configuredArea,
      address,
      override: true,
      autoCalculated: false,
    };
  }

  const useDistance =
    settings.deliveryPricingMode === "DISTANCE" ||
    settings.deliveryHybridEnabled !== false;
  if (!useDistance)
    return {
      ok: false,
      code: "AREA_NOT_SERVED",
      message:
        "Ainda não atendemos este bairro pela tabela cadastrada. Confira o endereço ou fale com a loja.",
    };
  if (!quoteCity || !quoteNeighborhood)
    return {
      ok: false,
      code: "NEIGHBORHOOD_REQUIRED",
      message:
        "Não foi possível identificar cidade e bairro. Confira o endereço para calcular a entrega.",
    };

  const automatic = await resolveAutomaticNeighborhoodDistance(settings, {
    city: quoteCity,
    state: quoteState,
    neighborhood: quoteNeighborhood,
  });
  if (!automatic || automatic.error === "NEIGHBORHOOD_GEO_NOT_FOUND")
    return {
      ok: false,
      code: "NEIGHBORHOOD_GEO_NOT_FOUND",
      message: `Não conseguimos localizar automaticamente o bairro ${quoteNeighborhood}. Confira cidade, estado e bairro ou fale com a loja.`,
    };
  if (automatic.error === "STORE_LOCATION_REQUIRED")
    return {
      ok: false,
      code: "STORE_LOCATION_REQUIRED",
      message:
        "A localização da loja ainda não pôde ser determinada. Confira o endereço público da loja no painel.",
    };
  if (automatic.error)
    return {
      ok: false,
      code: automatic.error,
      message:
        "Não foi possível calcular a rota para este bairro agora. Tente novamente em alguns instantes.",
    };

  const distanceQuote = deliveryFeeFromConfiguredDistance(
    settings,
    automatic.distanceKm,
    free,
  );
  if (!distanceQuote.ok)
    return {
      ...distanceQuote,
      mode: "AUTO_NEIGHBORHOOD_DISTANCE",
      autoCalculated: true,
      source: automatic.source,
    };
  return {
    ...distanceQuote,
    mode: "AUTO_NEIGHBORHOOD_DISTANCE",
    address,
    area: null,
    autoCalculated: true,
    neighborhoodBased: true,
    neighborhood: quoteNeighborhood,
    city: quoteCity,
    state: quoteState,
    source: automatic.source,
  };
}

function clockNowForTimezone(timezone = "America/Maceio", at = new Date()) {
  const date =
    at instanceof Date && !Number.isNaN(at.getTime()) ? at : new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(date);
  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    dayOfWeek: dayMap[parts.find((p) => p.type === "weekday")?.value],
    minutes:
      Number(parts.find((p) => p.type === "hour")?.value) * 60 +
      Number(parts.find((p) => p.type === "minute")?.value),
  };
}

async function applyDeliveryPolicies(
  settings,
  quote,
  subtotal,
  targetDate = null,
) {
  if (!quote?.ok) return quote;
  const area = quote.area || null;
  const minimumOrder = Math.max(
    0,
    Number(area?.minimumOrder ?? settings.defaultMinimumOrder ?? 0),
  );
  if (Number(subtotal || 0) + 0.001 < minimumOrder)
    return {
      ok: false,
      code: "MINIMUM_ORDER",
      message: `O pedido mínimo para esta região é R$ ${minimumOrder.toFixed(2).replace(".", ",")}.`,
      minimumOrder,
    };
  const freeThresholdRaw =
    area?.freeDeliveryThreshold ?? settings.freeDeliveryThreshold;
  const freeThreshold =
    freeThresholdRaw == null ? 0 : Math.max(0, Number(freeThresholdRaw || 0));
  let fee = Number(quote.fee || 0),
    surcharge = 0;
  if (freeThreshold > 0 && Number(subtotal || 0) >= freeThreshold) fee = 0;
  else {
    const rules = await prisma.deliverySurchargeRule.findMany({
      where: { active: true },
    });
    const now = clockNowForTimezone(
      settings.timezone || "America/Maceio",
      targetDate || new Date(),
    );
    for (const rule of rules) {
      if (rule.dayOfWeek != null && Number(rule.dayOfWeek) !== now.dayOfWeek)
        continue;
      const start = parseClock(rule.startTime),
        end = parseClock(rule.endTime);
      if (start == null || end == null) continue;
      const inside =
        start <= end
          ? now.minutes >= start && now.minutes < end
          : now.minutes >= start || now.minutes < end;
      if (inside) surcharge += Number(rule.amount || 0);
    }
    fee = roundMoney(fee + surcharge);
  }
  return {
    ...quote,
    fee: roundMoney(fee),
    surcharge: roundMoney(surcharge),
    minimumOrder,
    freeDeliveryThreshold: freeThreshold,
  };
}

function renderWhatsAppTemplate(template, order, statusLabel = "") {
  return String(template || "")
    .replaceAll("{cliente}", order.customerName || "")
    .replaceAll(
      "{pedido}",
      order.shortCode || order.id?.slice(-8)?.toUpperCase() || "",
    )
    .replaceAll(
      "{total}",
      `R$ ${Number(order.total || 0)
        .toFixed(2)
        .replace(".", ",")}`,
    )
    .replaceAll("{status}", statusLabel || order.status || "");
}
async function queueWhatsApp(order, event, statusLabel = "") {
  const settings = await prisma.businessSettings
    .findUnique({ where: { id: "default" } })
    .catch(() => null);
  if (!settings?.whatsappAutoEnabled || !order?.customerPhone) return null;
  const template =
    event === "ORDER_CREATED"
      ? settings.whatsappOrderCreatedTemplate
      : settings.whatsappStatusTemplate;
  const message = renderWhatsAppTemplate(template, order, statusLabel);
  const outbox = await prisma.whatsAppOutbox.create({
    data: {
      orderId: order.id,
      customerPhone: normalizePhone(order.customerPhone),
      event,
      message,
      status: WHATSAPP_WEBHOOK_URL ? "PENDING" : "WAITING_PROVIDER",
    },
  });
  if (!WHATSAPP_WEBHOOK_URL) return outbox;
  try {
    const response = await fetch(WHATSAPP_WEBHOOK_URL, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: {
        "Content-Type": "application/json",
        ...(WHATSAPP_WEBHOOK_TOKEN
          ? { Authorization: `Bearer ${WHATSAPP_WEBHOOK_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({
        to: normalizePhone(order.customerPhone),
        message,
        event,
        orderId: order.id,
        trackingCode: order.trackingCode,
      }),
    });
    const text = await response.text().catch(() => "");
    return prisma.whatsAppOutbox.update({
      where: { id: outbox.id },
      data: {
        status: response.ok ? "SENT" : "FAILED",
        providerResponse: text.slice(0, 800) || String(response.status),
        sentAt: response.ok ? new Date() : null,
      },
    });
  } catch (err) {
    return prisma.whatsAppOutbox
      .update({
        where: { id: outbox.id },
        data: {
          status: "FAILED",
          providerResponse: String(err.message || err).slice(0, 800),
        },
      })
      .catch(() => outbox);
  }
}

async function applyOrderStock(tx, orderId) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { flavors: true, options: true } } },
  });
  if (!order || order.stockApplied) return;
  const productNeeds = new Map();
  const ingredientNeeds = new Map();
  const flavorNeeds = new Map();
  const optionNeeds = new Map();
  for (const item of order.items) {
    productNeeds.set(
      item.productId,
      (productNeeds.get(item.productId) || 0) + item.quantity,
    );
    for (const flavor of item.flavors || []) {
      if (flavor.productId && flavor.productId !== item.productId)
        productNeeds.set(
          flavor.productId,
          (productNeeds.get(flavor.productId) || 0) + item.quantity,
        );
      if (flavor.flavorId)
        flavorNeeds.set(
          flavor.flavorId,
          (flavorNeeds.get(flavor.flavorId) || 0) + item.quantity,
        );
    }
    for (const option of item.options || [])
      if (option.optionId)
        optionNeeds.set(
          option.optionId,
          (optionNeeds.get(option.optionId) || 0) + item.quantity,
        );
  }
  const productIds = [...productNeeds.keys()];
  const products = await tx.product.findMany({
    where: { id: { in: productIds } },
    include: { recipeItems: { include: { inventoryItem: true } } },
  });
  const map = new Map(products.map((p) => [p.id, p]));
  for (const item of order.items) {
    const product = map.get(item.productId);
    if (!product) continue;
    for (const recipe of product.recipeItems || []) {
      const need = Number(recipe.quantity || 0) * item.quantity;
      ingredientNeeds.set(
        recipe.inventoryItemId,
        (ingredientNeeds.get(recipe.inventoryItemId) || 0) + need,
      );
    }
  }
  const [ingredients, flavors, options] = await Promise.all([
    ingredientNeeds.size
      ? tx.inventoryItem.findMany({
          where: { id: { in: [...ingredientNeeds.keys()] } },
        })
      : [],
    flavorNeeds.size
      ? tx.flavor.findMany({ where: { id: { in: [...flavorNeeds.keys()] } } })
      : [],
    optionNeeds.size
      ? tx.modifierOption.findMany({
          where: { id: { in: [...optionNeeds.keys()] } },
        })
      : [],
  ]);
  const ingredientMap = new Map(ingredients.map((row) => [row.id, row]));
  const flavorMapById = new Map(flavors.map((row) => [row.id, row]));
  const optionMapById = new Map(options.map((row) => [row.id, row]));
  // Baixas atômicas evitam estoque negativo se dois pedidos forem aceitos ao mesmo tempo.
  for (const [productId, need] of productNeeds) {
    const product = map.get(productId);
    if (product?.stockTracked) {
      const changed = await tx.product.updateMany({
        where: { id: productId, stockQuantity: { gte: need } },
        data: { stockQuantity: { decrement: need } },
      });
      if (changed.count !== 1)
        throw Object.assign(
          new Error(`Estoque insuficiente de ${product.name}.`),
          { code: "OUT_OF_STOCK" },
        );
      await tx.inventoryMovement.create({
        data: {
          productId,
          orderId,
          type: "PRODUCT_SALE",
          quantity: -need,
          note: `Pedido ${order.id.slice(-8).toUpperCase()}`,
        },
      });
    }
  }
  for (const [flavorId, need] of flavorNeeds) {
    const flavor = flavorMapById.get(flavorId);
    if (flavor?.stockTracked) {
      const changed = await tx.flavor.updateMany({
        where: { id: flavorId, stockQuantity: { gte: need } },
        data: { stockQuantity: { decrement: need } },
      });
      if (changed.count !== 1)
        throw Object.assign(
          new Error(`Estoque insuficiente do sabor ${flavor.name}.`),
          { code: "OUT_OF_STOCK" },
        );
    }
  }
  for (const [optionId, need] of optionNeeds) {
    const option = optionMapById.get(optionId);
    if (option?.stockTracked) {
      const changed = await tx.modifierOption.updateMany({
        where: { id: optionId, stockQuantity: { gte: need } },
        data: { stockQuantity: { decrement: need } },
      });
      if (changed.count !== 1)
        throw Object.assign(
          new Error(`Estoque insuficiente do adicional ${option.name}.`),
          { code: "OUT_OF_STOCK" },
        );
    }
  }
  for (const [inventoryItemId, need] of ingredientNeeds) {
    const ingredient = ingredientMap.get(inventoryItemId);
    const changed = await tx.inventoryItem.updateMany({
      where: { id: inventoryItemId, quantity: { gte: need } },
      data: { quantity: { decrement: need } },
    });
    if (changed.count !== 1)
      throw Object.assign(
        new Error(
          `Estoque real insuficiente: ${ingredient?.name || "insumo"}.`,
        ),
        { code: "INGREDIENT_OUT_OF_STOCK" },
      );
    await tx.inventoryMovement.create({
      data: {
        inventoryItemId,
        orderId,
        type: "RECIPE_SALE",
        quantity: -need,
        note: `Consumo do pedido ${order.id.slice(-8).toUpperCase()}`,
      },
    });
  }
  await tx.order.update({
    where: { id: orderId },
    data: { stockApplied: true },
  });
}

async function restoreOrderStock(tx, orderId) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { flavors: true, options: true } } },
  });
  if (!order?.stockApplied) return;
  const productNeeds = new Map(),
    ingredientNeeds = new Map(),
    flavorNeeds = new Map(),
    optionNeeds = new Map();
  for (const item of order.items) {
    productNeeds.set(
      item.productId,
      (productNeeds.get(item.productId) || 0) + item.quantity,
    );
    for (const f of item.flavors || []) {
      if (f.productId && f.productId !== item.productId)
        productNeeds.set(
          f.productId,
          (productNeeds.get(f.productId) || 0) + item.quantity,
        );
      if (f.flavorId)
        flavorNeeds.set(
          f.flavorId,
          (flavorNeeds.get(f.flavorId) || 0) + item.quantity,
        );
    }
    for (const o of item.options || [])
      if (o.optionId)
        optionNeeds.set(
          o.optionId,
          (optionNeeds.get(o.optionId) || 0) + item.quantity,
        );
  }
  const products = await tx.product.findMany({
    where: { id: { in: [...productNeeds.keys()] } },
    include: { recipeItems: true },
  });
  const map = new Map(products.map((p) => [p.id, p]));
  for (const item of order.items) {
    const p = map.get(item.productId);
    for (const r of p?.recipeItems || [])
      ingredientNeeds.set(
        r.inventoryItemId,
        (ingredientNeeds.get(r.inventoryItemId) || 0) +
          Number(r.quantity || 0) * item.quantity,
      );
  }
  for (const [productId, qty] of productNeeds) {
    const product = map.get(productId);
    if (product?.stockTracked)
      await tx.product.update({
        where: { id: productId },
        data: { stockQuantity: { increment: qty } },
      });
  }
  for (const [flavorId, qty] of flavorNeeds) {
    const flavor = await tx.flavor.findUnique({
      where: { id: flavorId },
      select: { stockTracked: true },
    });
    if (flavor?.stockTracked)
      await tx.flavor.update({
        where: { id: flavorId },
        data: { stockQuantity: { increment: qty } },
      });
  }
  for (const [optionId, qty] of optionNeeds) {
    const option = await tx.modifierOption.findUnique({
      where: { id: optionId },
      select: { stockTracked: true },
    });
    if (option?.stockTracked)
      await tx.modifierOption.update({
        where: { id: optionId },
        data: { stockQuantity: { increment: qty } },
      });
  }
  for (const [inventoryItemId, qty] of ingredientNeeds)
    await tx.inventoryItem.update({
      where: { id: inventoryItemId },
      data: { quantity: { increment: qty } },
    });
  await tx.order.update({
    where: { id: orderId },
    data: { stockApplied: false },
  });
}

async function autoAssignCourier(tx, orderId) {
  const settings = await tx.businessSettings.findUnique({
    where: { id: "default" },
  });
  if (settings?.smartCourierQueueEnabled === false) return null;
  const couriers = await tx.user.findMany({
    where: { isAdmin: true, staffRole: "DELIVERY", staffActive: true },
    select: { id: true, name: true },
  });
  if (!couriers.length) return null;
  const maxActive = Math.max(1, Number(settings?.courierMaxActiveOrders || 3));
  const groupedCounts = await tx.order.groupBy({
    by: ["assignedCourierId"],
    where: {
      assignedCourierId: { in: couriers.map((courier) => courier.id) },
      status: "OUT_FOR_DELIVERY",
    },
    _count: { _all: true },
  });
  const countByCourier = new Map(
    groupedCounts.map((row) => [row.assignedCourierId, row._count._all]),
  );
  const counts = couriers.map((courier) => ({
    courier,
    count: countByCourier.get(courier.id) || 0,
  }));
  const available = counts
    .filter((row) => row.count < maxActive)
    .sort(
      (a, b) =>
        a.count - b.count ||
        a.courier.name.localeCompare(b.courier.name, "pt-BR"),
    );
  if (!available.length) return null;
  const chosen = available[0].courier;
  await tx.order.update({
    where: { id: orderId },
    data: { assignedCourierId: chosen.id },
  });
  return chosen;
}

async function validateScheduledAt(raw, settings) {
  if (!settings.schedulingEnabled)
    return {
      ok: false,
      message: "A loja não está aceitando agendamentos no momento.",
    };
  if (!raw)
    return {
      ok: false,
      message: "Escolha o horário em que deseja receber o pedido.",
    };
  const scheduledAt = new Date(raw);
  if (Number.isNaN(scheduledAt.getTime()))
    return { ok: false, message: "Data de agendamento inválida." };
  const now = new Date();
  const maxDelivery = Math.max(5, Number(settings.estimatedDeliveryMax || 45));
  if (scheduledAt.getTime() < now.getTime() + maxDelivery * 60_000)
    return {
      ok: false,
      message: `O primeiro horário disponível precisa considerar o prazo máximo de ${maxDelivery} minutos.`,
    };
  if (scheduledAt.getTime() > now.getTime() + 30 * 24 * 60 * 60 * 1000)
    return {
      ok: false,
      message: "O agendamento pode ser feito para até 30 dias.",
    };
  const hours = await ensureStoreHours();
  const timezone = settings.timezone || "America/Maceio";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(scheduledAt);
  const weekdayName = parts.find((p) => p.type === "weekday")?.value;
  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = dayMap[weekdayName];
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  const rule = hours.find((item) => Number(item.dayOfWeek) === dayOfWeek);
  if (!rule || rule.closed)
    return { ok: false, message: "A loja não atende no dia escolhido." };
  const minutes = hour * 60 + minute;
  const open = parseClock(rule.openTime);
  const close = parseClock(rule.closeTime);
  const firstDelivery = open == null ? null : open + maxDelivery;
  if (
    open == null ||
    close == null ||
    firstDelivery == null ||
    minutes < firstDelivery ||
    minutes > close
  )
    return {
      ok: false,
      message: `Para ${rule.label}, escolha uma entrega entre ${String(Math.floor(firstDelivery / 60)).padStart(2, "0")}:${String(firstDelivery % 60).padStart(2, "0")} e ${rule.closeTime}. O primeiro horário já inclui o prazo máximo de ${maxDelivery} min.`,
    };
  const slotMinutes = Math.max(
    5,
    Math.min(240, Number(settings.kitchenSlotMinutes || 30)),
  );
  const slotCapacity = Math.max(
    1,
    Math.min(500, Number(settings.kitchenCapacityPerSlot || 12)),
  );
  const slotMs = slotMinutes * 60_000;
  const slotStart = new Date(
    Math.floor(scheduledAt.getTime() / slotMs) * slotMs,
  );
  const slotEnd = new Date(slotStart.getTime() + slotMs);
  const reserved = await prisma.order.count({
    where: {
      scheduledAt: { gte: slotStart, lt: slotEnd },
      status: { not: "CANCELED" },
      paymentStatus: { not: "REJECTED" },
    },
  });
  if (reserved >= slotCapacity)
    return {
      ok: false,
      code: "SLOT_FULL",
      message: `Esse horário atingiu a capacidade de ${slotCapacity} pedido(s) a cada ${slotMinutes} minutos. Escolha outro horário.`,
    };
  return { ok: true, scheduledAt, slotStart, slotEnd, reserved, slotCapacity };
}

async function mercadoPagoRequest(path, options = {}) {
  if (!MERCADOPAGO_ACCESS_TOKEN)
    throw Object.assign(
      new Error("Pagamento online ainda não foi configurado pela loja."),
      { code: "PAYMENT_NOT_CONFIGURED" },
    );
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    ...options,
    signal: options.signal || AbortSignal.timeout(10_000),
    headers: {
      Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw Object.assign(
      new Error(
        data?.message || "Falha ao comunicar com o provedor de pagamento.",
      ),
      { code: "PAYMENT_PROVIDER_ERROR", details: data },
    );
  return data;
}

async function syncMercadoPagoPayment(paymentId, expectedTrackingCode = null) {
  if (!/^\d{1,32}$/.test(String(paymentId || ""))) return null;
  const payment = await mercadoPagoRequest(
    `/v1/payments/${encodeURIComponent(paymentId)}`,
  );
  const orderId = cleanText(payment.external_reference, 100);
  if (!orderId) return null;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: orderInclude,
  });
  if (!order) return null;
  if (expectedTrackingCode && order.trackingCode !== expectedTrackingCode)
    return null;
  if (order.paymentExternalId && order.paymentExternalId !== String(payment.id))
    return null;
  const amount = Number(payment.transaction_amount);
  if (
    payment.currency_id !== "BRL" ||
    !Number.isFinite(amount) ||
    Math.abs(amount - Number(order.total)) > 0.01
  )
    return null;
  const approved = payment.status === "approved";
  const rejected = [
    "rejected",
    "cancelled",
    "refunded",
    "charged_back",
  ].includes(payment.status);
  const previousStatus = order.paymentStatus;
  const updated = await prisma.$transaction(async (tx) => {
    if (rejected && previousStatus !== "REJECTED") {
      await restoreOrderStock(tx, order.id);
      if (order.couponCode)
        await tx.coupon.updateMany({
          where: { code: order.couponCode, uses: { gt: 0 } },
          data: { uses: { decrement: 1 } },
        });
    }
    return tx.order.update({
      where: { id: order.id },
      data: {
        paymentExternalId: String(payment.id),
        paymentStatus: approved
          ? "APPROVED"
          : rejected
            ? "REJECTED"
            : "PENDING",
        paidAt: approved ? new Date(payment.date_approved || Date.now()) : null,
      },
      include: orderInclude,
    });
  });
  if (approved && previousStatus !== "APPROVED")
    queueWhatsApp(serializeOrder(updated), "ORDER_CREATED", "Recebido").catch(
      () => {},
    );
  return updated;
}

const productInclude = {
  category: true,
  subcategory: true,
  promotion: true,
  recipeItems: { include: { inventoryItem: true } },
  productFlavors: { include: { flavor: true }, orderBy: { sortOrder: "asc" } },
  productSizes: { include: { size: true }, orderBy: { sortOrder: "asc" } },
  modifierGroups: {
    include: {
      group: {
        include: {
          options: {
            where: { active: true },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          },
        },
      },
    },
    orderBy: { sortOrder: "asc" },
  },
};
const orderInclude = {
  deliveryArea: true,
  table: true,
  tableSession: {
    select: {
      id: true,
      status: true,
      customerName: true,
      guestCount: true,
      openedAt: true,
      closedAt: true,
      paymentMethod: true,
      paymentMethodLabel: true,
      subtotal: true,
      total: true,
      amountPaid: true,
      changeAmount: true,
    },
  },
  assignedCourier: { select: { id: true, name: true, phone: true } },
  items: {
    include: {
      product: { include: productInclude },
      flavors: {
        include: {
          flavor: true,
          product: {
            include: {
              productSizes: { include: { size: true } },
              promotion: true,
            },
          },
        },
      },
      options: { include: { option: true } },
    },
  },
  history: { orderBy: { createdAt: "asc" } },
};

app.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, service: "master-pizza-api", database: "connected" });
  } catch {
    res.status(503).json({
      ok: false,
      service: "master-pizza-api",
      database: "unavailable",
    });
  }
});

app.get("/api/media/:id", async (req, res) => {
  const asset = await prisma.mediaAsset.findUnique({
    where: { id: req.params.id },
  });
  if (!asset) return res.status(404).end();
  res.setHeader("Content-Type", asset.mimeType);
  res.setHeader("Content-Length", String(asset.size));
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.send(Buffer.from(asset.data));
});

app.get("/api/settings", async (req, res) => {
  let settings = await getSettings();
  settings = await autoCloseStoreIfNeeded(settings);
  res.json(serializePublicSettings(settings));
});
app.get("/api/store-hours", async (req, res) => {
  res.json(await ensureStoreHours());
});
app.get("/api/delivery-areas", async (req, res) => {
  const areas = await prisma.deliveryArea.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { neighborhood: "asc" }],
  });
  res.json(areas.map(serializeDeliveryArea));
});
app.get("/api/categories", async (req, res) => {
  const categories = await prisma.category.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  res.json(categories);
});
app.get("/api/subcategories", async (req, res) => {
  const categoryId = cleanText(req.query.categoryId, 80);
  const rows = await prisma.subcategory.findMany({
    where: { active: true, ...(categoryId ? { categoryId } : {}) },
    include: { category: true },
    orderBy: [
      { category: { sortOrder: "asc" } },
      { sortOrder: "asc" },
      { name: "asc" },
    ],
  });
  res.json(rows);
});
app.get("/api/flavors", async (req, res) => {
  const rows = await prisma.flavor.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  res.json(rows.map(serializePublicFlavor));
});
app.get("/api/products", async (req, res) => {
  const category = cleanText(req.query.category, 60);
  const subcategory = cleanText(req.query.subcategory, 60);
  const search = cleanText(req.query.search, 80);
  const [products, flavorProducts, settings] = await Promise.all([
    prisma.product.findMany({
      where: {
        available: true,
        deletedAt: null,
        category: { active: true, ...(category ? { slug: category } : {}) },
        ...(subcategory
          ? { subcategory: { slug: subcategory, active: true } }
          : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { description: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: productInclude,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    }),
    prisma.product.findMany({
      where: {
        isFlavorOption: true,
        available: true,
        deletedAt: null,
        category: { active: true },
      },
      include: productInclude,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    getSettings(),
  ]);
  const now = new Date();
  const timezone = settings.timezone || "America/Maceio";
  const activeFlavorProducts = flavorProducts.filter((product) =>
    isProductAvailableAt(product, now, timezone),
  );
  res.json(
    products
      .filter((product) => isProductAvailableAt(product, now, timezone))
      .map((product) =>
        attachProductFlavorOptions(
          serializePublicProduct(product),
          activeFlavorProducts,
        ),
      ),
  );
});

app.get("/api/promotions", async (req, res) => {
  const now = new Date();
  const [rows, flavorProducts, settings] = await Promise.all([
    prisma.promotion.findMany({
      where: {
        active: true,
        AND: [
          { OR: [{ startAt: null }, { startAt: { lte: now } }] },
          { OR: [{ endAt: null }, { endAt: { gte: now } }] },
        ],
        product: {
          available: true,
          deletedAt: null,
          category: { active: true },
        },
      },
      include: { product: { include: productInclude } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      take: 12,
    }),
    prisma.product.findMany({
      where: {
        isFlavorOption: true,
        available: true,
        deletedAt: null,
        category: { active: true },
      },
      include: productInclude,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    getSettings(),
  ]);
  const timezone = settings.timezone || "America/Maceio";
  const activeFlavorProducts = flavorProducts.filter((product) =>
    isProductAvailableAt(product, now, timezone),
  );
  res.json(
    rows
      .filter((row) => isProductAvailableAt(row.product, now, timezone))
      .map((row) => ({
        ...serializePublicPromotion(row),
        product: attachProductFlavorOptions(
          serializePublicProduct(row.product),
          activeFlavorProducts,
        ),
      })),
  );
});

app.get("/api/address/cep/:cep", geoRateLimit, async (req, res) => {
  try {
    res.json(await resolveCep(req.params.cep));
  } catch (error) {
    res.status(404).json({
      code: error.code || "CEP_LOOKUP_FAILED",
      message:
        "Não foi possível localizar esse CEP. Você pode preencher o endereço manualmente.",
    });
  }
});
app.get("/api/address/reverse", geoRateLimit, async (req, res) => {
  const latitude = Number(req.query?.lat),
    longitude = Number(req.query?.lon);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -35 ||
    latitude > 6 ||
    longitude < -75 ||
    longitude > -30
  ) {
    return res.status(400).json({
      code: "INVALID_COORDS",
      message: "Não foi possível usar essa localização.",
    });
  }
  try {
    const params = new URLSearchParams({
      lat: String(latitude),
      lon: String(longitude),
      format: "jsonv2",
      addressdetails: "1",
      zoom: "18",
    });
    if (NOMINATIM_EMAIL) params.set("email", NOMINATIM_EMAIL);
    const response = await fetch(
      `${NOMINATIM_BASE_URL}/reverse?${params.toString()}`,
      {
        headers: {
          "User-Agent": "MasterPizza/2.12 checkout-location",
          "Accept-Language": "pt-BR,pt;q=0.9",
        },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`);
    const data = await response.json();
    const a = data?.address || {};
    const postalCode = cleanCep(a.postcode || "");
    let canonical = null;
    if (postalCode) {
      try {
        canonical = await resolveCep(postalCode);
      } catch {}
    }
    const stateCode = cleanText(
      canonical?.state ||
        a["ISO3166-2-lvl4"]?.split("-").pop() ||
        a.state_code ||
        a.state,
      40,
    );
    res.json({
      postalCode: postalCode || canonical?.postalCode || "",
      state: stateCode,
      city: cleanText(
        canonical?.city ||
          a.city ||
          a.town ||
          a.municipality ||
          a.village ||
          a.county,
        100,
      ),
      neighborhood: cleanText(
        canonical?.neighborhood ||
          a.suburb ||
          a.neighbourhood ||
          a.quarter ||
          a.city_district,
        100,
      ),
      street: cleanText(
        canonical?.street || a.road || a.pedestrian || a.residential,
        120,
      ),
      latitude,
      longitude,
    });
  } catch {
    res.status(404).json({
      code: "REVERSE_LOOKUP_FAILED",
      message:
        "Não foi possível identificar o endereço desta localização. Preencha manualmente.",
    });
  }
});
app.post("/api/delivery/quote", geoRateLimit, async (req, res) => {
  const settings = await getSettings();
  if (!settings.deliveryEnabled)
    return res.status(409).json({
      ok: false,
      message: "A entrega está temporariamente indisponível.",
    });
  const postalCode = cleanText(req.body?.postalCode, 12);
  let resolvedCep = null;
  if (postalCode) {
    try {
      resolvedCep = await resolveCep(postalCode);
    } catch {}
  }
  let quote = await calculateDeliveryQuote({
    settings,
    postalCode,
    city: cleanText(req.body?.city, 100),
    state: cleanText(req.body?.state, 40),
    neighborhood: cleanText(req.body?.neighborhood, 100),
    deliveryAreaId: cleanText(req.body?.deliveryAreaId, 80),
    subtotal: Number(req.body?.subtotal || 0),
    resolvedCep,
  });
  const quoteTarget = req.body?.scheduledAt
    ? new Date(req.body.scheduledAt)
    : null;
  quote = await applyDeliveryPolicies(
    settings,
    quote,
    Number(req.body?.subtotal || 0),
    quoteTarget && !Number.isNaN(quoteTarget.getTime()) ? quoteTarget : null,
  );
  res.status(quote.ok ? 200 : 422).json(quote);
});

app.post("/api/auth/register", authRateLimit, async (req, res) => {
  const name = cleanText(req.body?.name, 80);
  const email = cleanText(req.body?.email, 160).toLowerCase();
  const phone = normalizePhone(req.body?.phone);
  const password =
    typeof req.body?.password === "string" ? req.body.password : "";
  if (name.length < 2)
    return res.status(400).json({
      code: "INVALID_NAME",
      field: "name",
      message: "Informe seu nome completo.",
    });
  if (!validEmail(email))
    return res.status(400).json({
      code: "INVALID_EMAIL",
      field: "email",
      message: "Informe um e-mail válido, como nome@exemplo.com.",
    });
  if (!validPhone(phone))
    return res.status(400).json({
      code: "INVALID_PHONE",
      field: "phone",
      message: "Informe um número de telefone válido com DDD.",
    });
  if (!validCustomerPassword(password))
    return res.status(400).json({
      code: "WEAK_PASSWORD",
      field: "password",
      message:
        "A senha precisa ter pelo menos 8 caracteres, uma letra e um número.",
    });
  const [emailInUse, phoneInUse] = await Promise.all([
    prisma.user.findUnique({ where: { email } }),
    prisma.user.findUnique({ where: { phone } }),
  ]);
  if (emailInUse)
    return res.status(409).json({
      code: "EMAIL_IN_USE",
      field: "email",
      message: "Este e-mail já está cadastrado. Tente entrar na conta.",
    });
  if (phoneInUse)
    return res.status(409).json({
      code: "PHONE_IN_USE",
      field: "phone",
      message: "Este telefone já está cadastrado. Tente entrar na conta.",
    });
  const user = await prisma.user.create({
    data: {
      name,
      email,
      phone,
      passwordHash: await bcrypt.hash(password, 12),
      postalCode: cleanText(req.body?.postalCode, 12) || null,
      street: cleanText(req.body?.street, 120) || null,
      addressNumber: cleanText(req.body?.addressNumber, 16) || null,
      complement: cleanText(req.body?.complement, 100) || null,
      neighborhood: cleanText(req.body?.neighborhood, 100) || null,
      city: cleanText(req.body?.city, 100) || null,
      state: cleanText(req.body?.state, 40) || null,
      referencePoint: cleanText(req.body?.referencePoint, 180) || null,
    },
  });
  res.status(201).json(startSession(res, user));
});

app.post("/api/auth/login", authRateLimit, async (req, res) => {
  const identifier = cleanText(req.body?.identifier, 180);
  const password =
    typeof req.body?.password === "string" ? req.body.password : "";
  if (!identifier)
    return res.status(400).json({
      code: "INVALID_IDENTIFIER",
      field: "identifier",
      message: "Informe seu e-mail ou telefone.",
    });
  if (identifier.includes("@") && !validEmail(identifier.toLowerCase()))
    return res.status(400).json({
      code: "INVALID_IDENTIFIER",
      field: "identifier",
      message: "O e-mail informado não é válido.",
    });
  if (!identifier.includes("@") && !validPhone(normalizePhone(identifier)))
    return res.status(400).json({
      code: "INVALID_IDENTIFIER",
      field: "identifier",
      message: "O número informado não é válido. Inclua o DDD.",
    });
  const user = await findUserByIdentifier(identifier);
  const passwordMatches = await bcrypt.compare(
    password,
    user?.passwordHash || DUMMY_PASSWORD_HASH,
  );
  if (!user || !passwordMatches)
    return res.status(401).json({
      code: "INVALID_CREDENTIALS",
      message: "E-mail/telefone ou senha incorretos.",
    });
  if (user.isAdmin && user.staffActive === false)
    return res.status(403).json({
      code: "ADMIN_DISABLED",
      message: "Este acesso ao painel foi desativado pelo administrador.",
    });
  if (!user.isAdmin && user.customerBlocked)
    return res.status(403).json({
      code: "CUSTOMER_BLOCKED",
      message:
        "Esta conta foi bloqueada pela loja. Entre em contato com o atendimento.",
    });
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  res.json(startSession(res, user));
});

app.post("/api/auth/forgot-password", authRateLimit, async (req, res) => {
  const startedAt = Date.now();
  const identifier = cleanText(req.body?.identifier, 180);
  const user = await findUserByIdentifier(identifier);
  if (user) {
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    await prisma.$transaction([
      prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
      prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      }),
    ]);
    // Keep the public response time independent from the external mail provider.
    void sendResetEmail(user, token).catch(() => false);
  }
  const remainingDelay = 350 - (Date.now() - startedAt);
  if (remainingDelay > 0) await wait(remainingDelay);
  res.json({
    ok: true,
    emailConfigured: RESEND_READY,
    message:
      "Se a conta existir, enviaremos as instruções para o e-mail cadastrado.",
  });
});

app.post("/api/auth/reset-password", authRateLimit, async (req, res) => {
  const token = cleanText(req.body?.token, 200);
  const password =
    typeof req.body?.password === "string" ? req.body.password : "";
  if (!token)
    return res.status(400).json({ message: "Token de redefinição ausente." });
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const resetOwner = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: { select: { isAdmin: true } } },
  });
  const passwordValid = resetOwner?.user?.isAdmin
    ? validStaffPassword(password)
    : validCustomerPassword(password);
  if (!passwordValid)
    return res.status(400).json({
      code: "WEAK_PASSWORD",
      message:
        resetOwner?.user?.isAdmin
          ? "A nova senha administrativa precisa ter pelo menos 12 caracteres, uma letra e um número."
          : "A nova senha precisa ter pelo menos 8 caracteres, uma letra e um número.",
    });
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    await prisma.$transaction(async (tx) => {
      const now = new Date();
      const record = await tx.passwordResetToken.findUnique({
        where: { tokenHash },
      });
      if (!record || record.usedAt || record.expiresAt < now)
        throw Object.assign(new Error("RESET_TOKEN_INVALID"), {
          code: "RESET_TOKEN_INVALID",
        });
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1)
        throw Object.assign(new Error("RESET_TOKEN_INVALID"), {
          code: "RESET_TOKEN_INVALID",
        });
      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash, sessionVersion: { increment: 1 } },
      });
      await tx.passwordResetToken.deleteMany({
        where: { userId: record.userId, id: { not: record.id } },
      });
    });
  } catch (error) {
    if (error?.code === "RESET_TOKEN_INVALID")
      return res.status(400).json({
        code: "RESET_TOKEN_INVALID",
        message:
          "Esse link expirou ou já foi utilizado. Solicite uma nova redefinição.",
      });
    throw error;
  }
  res.json({
    ok: true,
    message: "Senha alterada. Você já pode entrar com a nova senha.",
  });
});

app.get("/api/auth/me", auth, async (req, res) => {
  res.json({ user: publicUser(req.authUser) });
});

app.post("/api/auth/refresh", authIpRateLimit, async (req, res) => {
  if (req.headers["x-session-refresh"] !== "1")
    return res.status(400).json({
      code: "REFRESH_HEADER_REQUIRED",
      message: "Solicitação de renovação inválida.",
    });
  try {
    const token = parseCookies(req)[REFRESH_COOKIE];
    if (!token) throw new Error("REFRESH_REQUIRED");
    const payload = jwt.verify(token, JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: "master-pizza-api",
      audience: "master-pizza-refresh",
    });
    if (payload.type !== "refresh") throw new Error("INVALID_REFRESH");
    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user || Number(payload.sv) !== Number(user.sessionVersion || 0))
      throw new Error("INVALID_REFRESH");
    if (user.isAdmin && user.staffActive === false)
      throw new Error("INVALID_REFRESH");
    if (!user.isAdmin && user.customerBlocked)
      throw new Error("INVALID_REFRESH");
    res.json({
      token: issueAccessToken(user),
      user: publicUser(user),
      accessTokenExpiresIn: ACCESS_TOKEN_SECONDS,
    });
  } catch (error) {
    if (isDatabaseAvailabilityError(error)) throw error;
    endSession(res);
    res.status(401).json({
      code: "REFRESH_EXPIRED",
      message: "Sua sessão terminou. Entre novamente.",
    });
  }
});

app.post("/api/auth/logout", (req, res) => {
  endSession(res);
  res.json({ ok: true });
});

app.post("/api/auth/logout-all", auth, async (req, res) => {
  await prisma.user.update({
    where: { id: req.user.id },
    data: { sessionVersion: { increment: 1 } },
  });
  authenticatedUserCache.clear();
  endSession(res);
  res.json({ ok: true });
});

app.patch("/api/me/address", auth, async (req, res) => {
  const data = {
    postalCode: cleanText(req.body?.postalCode, 12) || null,
    street: cleanText(req.body?.street, 120) || null,
    addressNumber: cleanText(req.body?.addressNumber, 16) || null,
    complement: cleanText(req.body?.complement, 100) || null,
    neighborhood: cleanText(req.body?.neighborhood, 100) || null,
    city: cleanText(req.body?.city, 100) || null,
    state: cleanText(req.body?.state, 40) || null,
    referencePoint: cleanText(req.body?.referencePoint, 180) || null,
  };
  const user = await prisma.user.update({ where: { id: req.user.id }, data });
  res.json({ user: publicUser(user) });
});

app.get("/api/me/orders", auth, async (req, res) => {
  await activateDueScheduledOrders();
  const orders = await prisma.order.findMany({
    where: { userId: req.user.id },
    include: orderInclude,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json(orders.map(serializeCustomerOrder));
});

app.get("/api/me/orders/:id/reorder", auth, async (req, res) => {
  const order = await prisma.order.findFirst({
    where: { id: req.params.id, userId: req.user.id },
    include: orderInclude,
  });
  if (!order)
    return res.status(404).json({ message: "Pedido não encontrado." });
  const items = [];
  const unavailable = [];
  for (const item of order.items) {
    if (!item.product?.available || item.product.deletedAt) {
      unavailable.push(item.name);
      continue;
    }
    const availableFlavors = item.flavors
      .map((entry) => entry.product || entry.flavor)
      .filter((f) => f?.available !== false && f?.active !== false);
    if (
      item.flavors.length &&
      availableFlavors.length !== item.flavors.length
    ) {
      unavailable.push(item.name);
      continue;
    }
    const savedSize = (item.product.productSizes || []).find(
      (entry) => entry.size?.name === item.sizeName,
    );
    const currentBasePrice = savedSize
      ? Number(savedSize.price)
      : effectiveProductPrice(item.product);
    const reorderFlavorPrices = availableFlavors.map((f) => {
      const same = savedSize
        ? (f.productSizes || []).find(
            (entry) => entry.size?.slug === savedSize.size.slug,
          )
        : null;
      return same ? Number(same.price) : effectiveProductPrice(f);
    });
    const currentPrice = availableFlavors.length
      ? item.product.flavorPricingMode === "SUM"
        ? roundMoney(
            reorderFlavorPrices.reduce((sum, value) => sum + value, 0) /
              Math.max(1, reorderFlavorPrices.length),
          )
        : Math.max(currentBasePrice, ...reorderFlavorPrices)
      : currentBasePrice;
    const currentOptions = (item.options || [])
      .filter((entry) => entry.option?.active)
      .map((entry) => ({
        id: entry.option.id,
        groupName: entry.groupName,
        name: entry.option.name,
        price: Number(entry.option.price),
        image: entry.option.image,
      }));
    const optionsTotal = currentOptions.reduce(
      (sum, option) => sum + Number(option.price || 0),
      0,
    );
    items.push({
      cartKey: `reorder-${Date.now()}-${item.id}`,
      productId: item.product.id,
      name: availableFlavors.length
        ? `${item.product.name} • ${availableFlavors.map((f) => f.name).join(" / ")}`
        : item.product.name,
      price: currentPrice + optionsTotal,
      image: item.product.image,
      quantity: item.quantity,
      notes: item.notes || "",
      sizeId: savedSize?.sizeId || null,
      sizeName: savedSize?.size?.name || null,
      flavorIds: availableFlavors.map((f) => f.id),
      flavors: availableFlavors.map((f) => ({
        id: f.id,
        name: f.name,
        price: Number(f.price),
        image: f.image,
      })),
      optionIds: currentOptions.map((o) => o.id),
      options: currentOptions,
    });
  }
  if (!items.length)
    return res.status(409).json({
      message: "Os itens desse pedido não estão disponíveis no momento.",
      unavailable,
    });
  res.json({ items, unavailable });
});

app.get("/api/digital-tables", trackingRateLimit, async (req, res) => {
  const tables = await prisma.restaurantTable.findMany({
    where: { active: true },
    select: { number: true, name: true, seats: true },
    orderBy: [{ sortOrder: "asc" }, { number: "asc" }],
  });
  res.json(
    tables.map((table) => ({
      number: table.number,
      name: table.name || `Mesa ${table.number}`,
      seats: table.seats,
    })),
  );
});

app.post(
  "/api/orders",
  optionalAuth,
  orderSubmissionRateLimit,
  async (req, res) => {
  let customerName = cleanText(req.body?.customerName, 80);
  let customerPhone = normalizePhone(req.body?.customerPhone);
  let customerEmail = cleanText(req.body?.customerEmail, 180).toLowerCase();
  const fulfillmentType =
    cleanText(req.body?.fulfillmentType, 20) || "DELIVERY";
  const isDineIn = fulfillmentType === "DINE_IN";
  const isDigitalTableOrder =
    isDineIn && booleanValue(req.body?.digitalTableOrder);
  const postalCode = cleanText(req.body?.postalCode, 12) || null;
  const street = cleanText(req.body?.street, 120) || null;
  const addressNumber = cleanText(req.body?.addressNumber, 16) || null;
  const complement = cleanText(req.body?.complement, 100) || null;
  const neighborhood = cleanText(req.body?.neighborhood, 100) || null;
  const city = cleanText(req.body?.city, 100) || null;
  const state = cleanText(req.body?.state, 40) || null;
  const notes = cleanText(req.body?.notes, 300) || null;
  const referencePoint = cleanText(req.body?.referencePoint, 180) || null;
  const deliveryAreaId = cleanText(req.body?.deliveryAreaId, 80) || null;
  const requestedPaymentMethod = cleanText(req.body?.paymentMethod, 80);
  let paymentMethod = requestedPaymentMethod.startsWith(CUSTOM_PAYMENT_PREFIX)
    ? requestedPaymentMethod
    : requestedPaymentMethod.toUpperCase();
  let paymentMethodLabel = null;
  const items = req.body?.items;
  let tableSession = null;
  let digitalTable = null;
  if (isDineIn) {
    if (!hasAuthenticatedTableAccess(req) && !isDigitalTableOrder)
      return res.status(403).json({
        code: "TABLE_ACCESS_REQUIRED",
        message: "Somente a equipe autorizada pode lançar pedidos em mesas.",
      });
    if (isDigitalTableOrder) {
      const tableNumber = boundedInteger(req.body?.tableNumber, 1, 10_000);
      digitalTable = tableNumber
        ? await prisma.restaurantTable.findFirst({
            where: { number: tableNumber, active: true },
          })
        : null;
      if (!digitalTable)
        return res.status(400).json({
          code: "DIGITAL_TABLE_INVALID",
          message: "Escolha uma mesa válida do salão.",
        });
    } else {
      const tableSessionId = cleanText(req.body?.tableSessionId, 80);
      tableSession = tableSessionId
        ? await prisma.tableSession.findFirst({
            where: { id: tableSessionId, status: "OPEN", openKey: { not: null } },
            include: { table: true },
          })
        : null;
      if (!tableSession?.table?.active)
        return res.status(409).json({
          code: "TABLE_SESSION_CLOSED",
          message: "A comanda desta mesa não está aberta. Atualize as mesas.",
        });
      customerName =
        customerName ||
        cleanText(tableSession.customerName, 80) ||
        tableLabel(tableSession.table);
    }
    customerPhone = "";
    customerEmail = "";
    paymentMethod = "CASH";
  }
  if (!isDineIn && req.user?.email)
    customerEmail = String(req.user.email).trim().toLowerCase();
  if (customerName.length < 2)
    return res.status(400).json({ message: "Informe o nome do cliente." });
  if (!isDineIn && !validPhone(customerPhone))
    return res
      .status(400)
      .json({ message: "Informe um telefone válido com DDD." });
  if (!["DELIVERY", "PICKUP", "DINE_IN"].includes(fulfillmentType))
    return res.status(400).json({ message: "Tipo de operação inválido." });
  if (
    !isDineIn &&
    !["CASH", "CARD", "PIX"].includes(paymentMethod)
  )
    return res.status(400).json({ message: "Forma de pagamento inválida." });
  if (!Array.isArray(items) || !items.length || items.length > 30)
    return res.status(400).json({ message: "Carrinho inválido." });
  if (
    !isDineIn &&
    ["CARD", "PIX"].includes(paymentMethod) &&
    !validEmail(customerEmail)
  )
    return res.status(400).json({
      message: "Informe um e-mail válido para receber a confirmação do pagamento.",
    });
  if (!isDineIn && req.user?.id) {
    const account = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { customerBlocked: true, isAdmin: true },
    });
    if (account?.customerBlocked && !account.isAdmin)
      return res.status(403).json({
        code: "CUSTOMER_BLOCKED",
        message:
          "Sua conta está bloqueada para novos pedidos. Fale com a loja.",
      });
  }
  const blockedByPhone = isDineIn
    ? null
    : await prisma.user.findFirst({
        where: { isAdmin: false, phone: customerPhone, customerBlocked: true },
        select: { id: true },
      });
  if (blockedByPhone)
    return res.status(403).json({
      code: "CUSTOMER_BLOCKED",
      message:
        "Este cliente está bloqueado para novos pedidos. Fale com a loja.",
    });

  let settings = await getSettings();
  settings = await autoCloseStoreIfNeeded(settings);
  if (isDigitalTableOrder && !settings.isOpen)
    return res.status(409).json({
      code: "STORE_CLOSED",
      message: "O atendimento digital do salão está fechado no momento.",
    });
  const dailyLimit = Math.max(
    1,
    Math.min(100, Number(settings.customerDailyOrderLimit || 5)),
  );
  const timezone = settings.timezone || "America/Maceio";
  const todayKey = zonedDateKey(new Date(), timezone);
  const identityFilters = [];
  if (!isDineIn && req.user?.id) identityFilters.push({ userId: req.user.id });
  if (!isDineIn && customerPhone) identityFilters.push({ customerPhone });
  const recentOrders = identityFilters.length
    ? await prisma.order.findMany({
        where: {
          createdAt: { gte: new Date(Date.now() - 36 * 60 * 60 * 1000) },
          status: { not: "CANCELED" },
          paymentStatus: { not: "REJECTED" },
          OR: identityFilters,
        },
        select: { id: true, createdAt: true },
      })
    : [];
  const customerOrdersToday = recentOrders.filter(
    (order) => zonedDateKey(order.createdAt, timezone) === todayKey,
  ).length;
  if (!isDineIn && customerOrdersToday >= dailyLimit)
    return res.status(429).json({
      code: "DAILY_ORDER_LIMIT",
      message: `Este cliente atingiu o limite de ${dailyLimit} pedido(s) por dia. Tente novamente amanhã.`,
    });
  if (!isDineIn && paymentMethod === "CASH" && !settings.cashPaymentEnabled)
    return res.status(409).json({
      message: "Pagamento em dinheiro não está disponível no momento.",
    });
  if (
    ["CARD", "PIX"].includes(paymentMethod) &&
    (!settings.onlinePaymentEnabled || !MERCADOPAGO_PUBLIC_READY)
  )
    return res.status(409).json({
      message:
        "Pagamento online ainda não está pronto. Configure Public Key, Access Token, assinatura do webhook e as URLs HTTPS públicas.",
    });
  let scheduledAt = null;
  let scheduleReservation = null;
  let initialStatus = "RECEIVED";
  if (!isDineIn && !settings.isOpen) {
    if (!settings.schedulingEnabled)
      return res.status(409).json({
        code: "STORE_CLOSED",
        message:
          "A loja está fechada e os agendamentos estão desativados no momento.",
      });
    const validation = await validateScheduledAt(
      req.body?.scheduledAt,
      settings,
    );
    if (!validation.ok)
      return res
        .status(409)
        .json({ code: "SCHEDULE_REQUIRED", message: validation.message });
    scheduledAt = validation.scheduledAt;
    scheduleReservation = validation;
    initialStatus = "SCHEDULED";
  } else if (!isDineIn && req.body?.scheduledAt) {
    if (!settings.schedulingEnabled)
      return res.status(409).json({
        code: "SCHEDULING_DISABLED",
        message: "A loja não está aceitando agendamentos no momento.",
      });
    const validation = await validateScheduledAt(
      req.body.scheduledAt,
      settings,
    );
    if (!validation.ok)
      return res.status(400).json({ message: validation.message });
    scheduledAt = validation.scheduledAt;
    scheduleReservation = validation;
    initialStatus = "SCHEDULED";
  }
  if (fulfillmentType === "DELIVERY" && !settings.deliveryEnabled)
    return res
      .status(409)
      .json({ message: "A entrega está temporariamente indisponível." });
  if (fulfillmentType === "PICKUP" && !settings.pickupEnabled)
    return res
      .status(409)
      .json({ message: "A retirada está temporariamente indisponível." });
  const missingAddressFields =
    fulfillmentType === "DELIVERY"
      ? missingDeliveryAddressFields({
          postalCode,
          state,
          city,
          neighborhood,
          street,
          addressNumber,
        })
      : [];
  if (missingAddressFields.length)
    return res.status(400).json({
      message: `Para entrega, informe: ${missingAddressFields.join(", ")}.`,
    });

  const productIds = items
    .map((item) => cleanText(item?.productId, 80))
    .filter(Boolean);
  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
      available: true,
      deletedAt: null,
      category: { active: true },
    },
    include: productInclude,
  });
  const productMap = new Map(products.map((p) => [p.id, p]));
  const allFlavorIds = [
    ...new Set(
      items
        .flatMap((item) =>
          Array.isArray(item?.flavorIds) ? item.flavorIds : [],
        )
        .map((id) => cleanText(id, 80))
        .filter(Boolean),
    ),
  ];
  const flavorProducts = await prisma.product.findMany({
    where: {
      id: { in: allFlavorIds },
      available: true,
      deletedAt: null,
      category: { active: true },
    },
    include: { productSizes: { include: { size: true } }, promotion: true },
  });
  const flavorMap = new Map(flavorProducts.map((f) => [f.id, f]));
  const allOptionIds = [
    ...new Set(
      items
        .flatMap((item) =>
          Array.isArray(item?.optionIds) ? item.optionIds : [],
        )
        .map((id) => cleanText(id, 80))
        .filter(Boolean),
    ),
  ];
  const modifierOptions = await prisma.modifierOption.findMany({
    where: { id: { in: allOptionIds }, active: true },
    include: { group: true },
  });
  const optionMap = new Map(
    modifierOptions.map((option) => [option.id, option]),
  );
  const normalizedItems = [];

  for (const item of items) {
    const base = productMap.get(cleanText(item?.productId, 80));
    const quantity = Number(item?.quantity);
    if (!base || !Number.isInteger(quantity) || quantity < 1 || quantity > 20)
      return res
        .status(400)
        .json({ message: "Há um produto ou quantidade inválida no carrinho." });
    const availabilityTarget = scheduledAt || new Date();
    if (!isProductAvailableAt(base, availabilityTarget, timezone))
      return res.status(409).json({
        code: "PRODUCT_UNAVAILABLE",
        message: `${base.name} não está disponível no horário escolhido.`,
      });
    if (base.stockTracked && Number(base.stockQuantity || 0) < quantity)
      return res.status(409).json({
        code: "OUT_OF_STOCK",
        message: `${base.name} não possui estoque suficiente. Restam ${Number(base.stockQuantity || 0)} unidade(s).`,
      });
    const requestedSizeId = cleanText(item?.sizeId, 80);
    const availableSizes = (base.productSizes || []).filter(
      (entry) => entry.size?.active !== false,
    );
    let chosenSize = null;
    if (availableSizes.length) {
      chosenSize = availableSizes.find(
        (entry) => entry.sizeId === requestedSizeId,
      );
      if (!chosenSize)
        return res
          .status(400)
          .json({ message: `Escolha um tamanho válido para ${base.name}.` });
    }
    const basePrice = chosenSize
      ? effectiveProductSizePrice(base, chosenSize)
      : effectiveProductPrice(base);
    const flavorIds = [
      ...new Set(
        Array.isArray(item?.flavorIds)
          ? item.flavorIds.map((id) => cleanText(id, 80)).filter(Boolean)
          : [],
      ),
    ];
    let flavorPrice = basePrice;
    let chosenFlavors = [];
    if (base.allowFlavorSplit) {
      if (!flavorIds.length)
        return res
          .status(400)
          .json({ message: `Escolha pelo menos um sabor para ${base.name}.` });
      if (!flavorIds.includes(base.id))
        return res.status(400).json({
          message: `O sabor base ${base.name} deve permanecer selecionado.`,
        });
      if (
        flavorIds.length >
        Math.min(4, Math.max(1, Number(base.maxFlavors || 1)))
      )
        return res.status(400).json({
          message: `${base.name} permite no máximo ${base.maxFlavors} sabores.`,
        });
      if (flavorIds.some((id) => !flavorMap.has(id)))
        return res.status(400).json({
          message: `Um dos sabores escolhidos não está disponível para ${base.name}.`,
        });
      chosenFlavors = flavorIds.map((id) => flavorMap.get(id));
      if (
        chosenFlavors.some(
          (flavor) => flavor.id !== base.id && !flavor.isFlavorOption,
        )
      )
        return res.status(400).json({
          message: `Um dos produtos escolhidos não está habilitado como sabor.`,
        });
      if (chosenFlavors.some((flavor) => flavor.categoryId !== base.categoryId))
        return res.status(400).json({
          message: `Um dos sabores escolhidos não pertence à categoria de ${base.name}.`,
        });
      const unavailableAtTarget = chosenFlavors.find(
        (flavor) => !isProductAvailableAt(flavor, availabilityTarget, timezone),
      );
      if (unavailableAtTarget)
        return res.status(409).json({
          code: "PRODUCT_UNAVAILABLE",
          message: `O sabor ${unavailableAtTarget.name} não está disponível no horário escolhido.`,
        });
      const unavailableFlavor = chosenFlavors.find(
        (flavor) =>
          flavor.stockTracked && Number(flavor.stockQuantity || 0) < quantity,
      );
      if (unavailableFlavor)
        return res.status(409).json({
          code: "OUT_OF_STOCK",
          message: `O sabor ${unavailableFlavor.name} não possui estoque suficiente.`,
        });
      const chosenPrices = chosenFlavors.map((flavor) => {
        if (flavor.id === base.id) return basePrice;
        if (chosenSize) {
          const sameSize = (flavor.productSizes || []).find(
            (entry) =>
              entry.size?.slug === chosenSize.size.slug &&
              entry.size?.active !== false,
          );
          if (sameSize) {
            return effectiveProductSizePrice(flavor, sameSize);
          }
        }
        return effectiveProductPrice(flavor);
      });
      flavorPrice =
        base.flavorPricingMode === "SUM"
          ? roundMoney(
              chosenPrices.reduce((sum, value) => sum + value, 0) /
                Math.max(1, chosenPrices.length),
            )
          : Math.max(basePrice, ...chosenPrices);
    }
    const optionIds = [
      ...new Set(
        Array.isArray(item?.optionIds)
          ? item.optionIds.map((id) => cleanText(id, 80)).filter(Boolean)
          : [],
      ),
    ];
    const allowedGroups = new Map(
      (base.modifierGroups || [])
        .filter((entry) => entry.group?.active)
        .map((entry) => [entry.groupId, entry.group]),
    );
    const selectedByGroup = new Map();
    for (const optionId of optionIds) {
      const option = optionMap.get(optionId);
      if (!option || !allowedGroups.has(option.groupId))
        return res.status(400).json({
          message: `Uma alteração escolhida não está disponível para ${base.name}.`,
        });
      const list = selectedByGroup.get(option.groupId) || [];
      list.push(option);
      selectedByGroup.set(option.groupId, list);
    }
    for (const [groupId, group] of allowedGroups) {
      const selected = selectedByGroup.get(groupId) || [];
      const min = group.required
        ? Math.max(1, Number(group.minSelect || 0))
        : Number(group.minSelect || 0);
      const max = Math.max(min, Number(group.maxSelect || 1));
      if (selected.length < min)
        return res.status(400).json({
          message: `Escolha ${min === 1 ? "uma opção" : `pelo menos ${min} opções`} em ${group.name}.`,
        });
      if (selected.length > max)
        return res
          .status(400)
          .json({ message: `${group.name} permite no máximo ${max} opções.` });
    }
    const chosenOptions = optionIds.map((id) => optionMap.get(id));
    const unavailableOption = chosenOptions.find(
      (option) =>
        option.stockTracked && Number(option.stockQuantity || 0) < quantity,
    );
    if (unavailableOption)
      return res.status(409).json({
        code: "OUT_OF_STOCK",
        message: `O adicional ${unavailableOption.name} não possui estoque suficiente.`,
      });
    const optionsTotal = chosenOptions.reduce(
      (sum, option) => sum + effectiveSimplePrice(option),
      0,
    );
    const itemNote = cleanText(item?.notes, 140) || null;
    const displayName = [
      base.name,
      chosenSize?.size?.name,
      chosenFlavors.length
        ? chosenFlavors.map((f) => f.name).join(" / ")
        : null,
    ]
      .filter(Boolean)
      .join(" • ");
    normalizedItems.push({
      productId: base.id,
      name: displayName,
      quantity,
      unitPrice: roundMoney(flavorPrice + optionsTotal),
      notes: itemNote,
      sizeName: chosenSize?.size?.name || null,
      sizePrice: chosenSize ? Number(chosenSize.price) : null,
      flavors: chosenFlavors.map((f) => ({
        productId: f.id,
        name: f.name,
        unitPrice: chosenSize
          ? (() => {
              const matchingSize = (f.productSizes || []).find(
                (entry) => entry.size?.slug === chosenSize.size.slug,
              );
              return matchingSize
                ? effectiveProductSizePrice(f, matchingSize)
                : effectiveProductPrice(f);
            })()
          : effectiveProductPrice(f),
      })),
      options: chosenOptions.map((o) => ({
        optionId: o.id,
        groupName: o.group.name,
        optionName: o.name,
        unitPrice: effectiveSimplePrice(o),
      })),
    });
  }

  const subtotal = roundMoney(
    normalizedItems.reduce(
      (sum, item) => sum + Number(item.unitPrice) * item.quantity,
      0,
    ),
  );
  let quote = { ok: true, fee: 0, distanceKm: null, area: null, address: null };
  if (fulfillmentType === "DELIVERY") {
    let resolvedCep = null;
    try {
      resolvedCep = await resolveCep(postalCode);
    } catch {}
    quote = await calculateDeliveryQuote({
      settings,
      postalCode,
      city,
      state,
      neighborhood,
      deliveryAreaId,
      subtotal,
      resolvedCep,
    });
    quote = await applyDeliveryPolicies(settings, quote, subtotal, scheduledAt);
    if (!quote.ok) return res.status(422).json(quote);
  }
  const deliveryFee = Number(quote.fee || 0);
  let discountAmount = 0,
    couponCode = null,
    couponRecord = null;
  const requestedCoupon = cleanText(req.body?.couponCode, 40).toUpperCase();
  if (isDineIn && requestedCoupon)
    return res.status(400).json({
      message: "Cupons do site não são aplicados a comandas presenciais.",
    });
  if (requestedCoupon) {
    const c = await prisma.coupon.findUnique({
        where: { code: requestedCoupon },
      }),
      now = new Date();
    if (
      !c ||
      !c.active ||
      (c.startAt && c.startAt > now) ||
      (c.endAt && c.endAt < now) ||
      (c.maxUses != null && c.uses >= c.maxUses)
    )
      return res.status(400).json({ message: "Cupom inválido ou expirado." });
    if (!req.user?.id && !c.allowGuest)
      return res.status(403).json({
        code: "COUPON_ACCOUNT_REQUIRED",
        message:
          "Este cupom é exclusivo para clientes com conta. Entre ou cadastre-se para usar.",
      });
    if (subtotal < Number(c.minimumOrder))
      return res
        .status(400)
        .json({ message: "O pedido não atingiu o valor mínimo deste cupom." });
    const customerUses = await prisma.order.count({
      where: {
        couponCode: c.code,
        status: { not: "CANCELED" },
        paymentStatus: { not: "REJECTED" },
        OR: [
          ...(req.user?.id ? [{ userId: req.user.id }] : []),
          { customerPhone },
        ],
      },
    });
    if (customerUses >= Math.max(1, Number(c.perCustomerLimit || 1)))
      return res.status(409).json({
        message: "Este cupom já atingiu o limite de uso para este cliente.",
      });
    discountAmount =
      c.type === "FIXED" ? Number(c.value) : (subtotal * Number(c.value)) / 100;
    if (c.maxDiscount != null)
      discountAmount = Math.min(discountAmount, Number(c.maxDiscount));
    discountAmount = roundMoney(Math.min(discountAmount, subtotal));
    couponCode = c.code;
    couponRecord = c;
  }
  const total = roundMoney(
    Math.max(0, subtotal + deliveryFee - discountAmount),
  );
  let changeFor = null;
  if (paymentMethod === "CASH" && req.body?.changeFor) {
    const parsed = Number(
      String(req.body.changeFor)
        .replace(/[^0-9,.-]/g, "")
        .replace(",", "."),
    );
    if (Number.isFinite(parsed) && parsed > 0) changeFor = parsed;
    if (changeFor !== null && changeFor < total)
      return res.status(400).json({
        message:
          "O valor para troco precisa ser maior ou igual ao total do pedido.",
      });
  }
  const resolved = quote.address || null;
  let order = await prisma.$transaction(async (tx) => {
    let sessionForOrder = tableSession;
    if (isDineIn) {
      if (isDigitalTableOrder) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('master-pizza-table'), hashtext(${digitalTable.id}))`;
        const activeTable = await tx.restaurantTable.findFirst({
          where: { id: digitalTable.id, active: true },
        });
        if (!activeTable)
          throw Object.assign(new Error("Esta mesa não está disponível."), {
            code: "DIGITAL_TABLE_INVALID",
          });
        sessionForOrder = await tx.tableSession.findFirst({
          where: {
            tableId: activeTable.id,
            status: "OPEN",
            openKey: activeTable.id,
          },
        });
        if (!sessionForOrder)
          sessionForOrder = await tx.tableSession.create({
            data: {
              tableId: activeTable.id,
              openKey: activeTable.id,
              status: "OPEN",
              customerName,
              guestCount: 1,
              openedByName: "Cardápio digital",
            },
          });
      } else {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('master-pizza-table-session'), hashtext(${tableSession.id}))`;
        const stillOpen = await tx.tableSession.findFirst({
          where: {
            id: tableSession.id,
            tableId: tableSession.tableId,
            status: "OPEN",
            openKey: tableSession.tableId,
          },
          select: { id: true },
        });
        if (!stillOpen)
          throw Object.assign(
            new Error("A comanda foi fechada. Atualize as mesas antes de lançar novos itens."),
            { code: "TABLE_SESSION_CLOSED" },
          );
      }
    }
    if (scheduleReservation) {
      const slotKey = scheduleReservation.slotStart.toISOString();
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('master-pizza-schedule-slot'), hashtext(${slotKey}))`;
      const reserved = await tx.order.count({
        where: {
          scheduledAt: {
            gte: scheduleReservation.slotStart,
            lt: scheduleReservation.slotEnd,
          },
          status: { not: "CANCELED" },
          paymentStatus: { not: "REJECTED" },
        },
      });
      if (reserved >= scheduleReservation.slotCapacity)
        throw Object.assign(
          new Error(
            `Esse horário atingiu a capacidade de ${scheduleReservation.slotCapacity} pedido(s). Escolha outro horário.`,
          ),
          { code: "SLOT_FULL" },
        );
    }
    if (!isDineIn) {
      const dailyIdentity = req.user?.id || customerPhone;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('master-pizza-daily-order'), hashtext(${dailyIdentity}))`;
      const finalRecentOrders = await tx.order.findMany({
        where: {
          createdAt: { gte: new Date(Date.now() - 36 * 60 * 60 * 1000) },
          status: { not: "CANCELED" },
          paymentStatus: { not: "REJECTED" },
          OR: identityFilters,
        },
        select: { createdAt: true },
      });
      const finalOrdersToday = finalRecentOrders.filter(
        (row) => zonedDateKey(row.createdAt, timezone) === todayKey,
      ).length;
      if (finalOrdersToday >= dailyLimit)
        throw Object.assign(
          new Error(
            `Este cliente atingiu o limite de ${dailyLimit} pedido(s) por dia. Tente novamente amanhã.`,
          ),
          { code: "DAILY_ORDER_LIMIT" },
        );
    }
    if (couponRecord) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${couponRecord.id}), hashtext(${customerPhone}))`;
      const finalCustomerUses = await tx.order.count({
        where: {
          couponCode: couponRecord.code,
          status: { not: "CANCELED" },
          paymentStatus: { not: "REJECTED" },
          OR: [
            ...(req.user?.id ? [{ userId: req.user.id }] : []),
            { customerPhone },
          ],
        },
      });
      if (
        finalCustomerUses >=
        Math.max(1, Number(couponRecord.perCustomerLimit || 1))
      )
        throw Object.assign(
          new Error("Este cupom já atingiu o limite de uso para este cliente."),
          { code: "COUPON_UNAVAILABLE" },
        );
      const reserved = await tx.coupon.updateMany({
        where: {
          id: couponRecord.id,
          active: true,
          ...(couponRecord.maxUses != null
            ? { uses: { lt: couponRecord.maxUses } }
            : {}),
        },
        data: { uses: { increment: 1 } },
      });
      if (reserved.count !== 1)
        throw Object.assign(new Error("Cupom inválido ou esgotado."), {
          code: "COUPON_UNAVAILABLE",
        });
    }
    return tx.order.create({
      data: {
        customerName,
        customerPhone,
        fulfillmentType,
        postalCode: fulfillmentType === "DELIVERY" ? postalCode : null,
        street: fulfillmentType === "DELIVERY" ? street : null,
        addressNumber: fulfillmentType === "DELIVERY" ? addressNumber : null,
        complement: fulfillmentType === "DELIVERY" ? complement : null,
        neighborhood:
          fulfillmentType === "DELIVERY"
            ? quote.area?.neighborhood === "*"
              ? neighborhood
              : quote.area?.neighborhood || neighborhood
            : null,
        city: fulfillmentType === "DELIVERY" ? city : null,
        state: fulfillmentType === "DELIVERY" ? state : null,
        latitude: resolved?.latitude ?? null,
        longitude: resolved?.longitude ?? null,
        distanceKm: quote.distanceKm ?? null,
        deliveryAreaId:
          fulfillmentType === "DELIVERY"
            ? quote.area?.id || deliveryAreaId || null
            : null,
        notes,
        referencePoint,
        paymentMethod,
        paymentMethodLabel,
        paymentStatus: ["CARD", "PIX"].includes(paymentMethod)
          ? "PENDING"
          : "CASH_PENDING",
        paymentProvider: ["CARD", "PIX"].includes(paymentMethod)
          ? "MERCADO_PAGO"
          : null,
        changeFor,
        subtotal,
        deliveryFee,
        total,
        discountAmount,
        couponCode,
        orderOrigin: isDigitalTableOrder ? "DIGITAL_TABLE" : isDineIn ? "TABLE" : "SITE",
        tableId: isDineIn ? sessionForOrder.tableId : null,
        tableSessionId: isDineIn ? sessionForOrder.id : null,
        createdByStaffId:
          isDineIn && !isDigitalTableOrder ? req.authUser.id : null,
        createdByStaffName:
          isDineIn && !isDigitalTableOrder ? req.authUser.name : null,
        scheduledAt,
        estimatedDeliveryMin: Number(settings.estimatedDeliveryMin || 30),
        estimatedDeliveryMax: Number(settings.estimatedDeliveryMax || 45),
        status: initialStatus,
        userId: isDineIn ? null : req.user?.id || null,
        items: {
          create: normalizedItems.map((item) => ({
            productId: item.productId,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            notes: item.notes,
            sizeName: item.sizeName,
            sizePrice: item.sizePrice,
            flavors: item.flavors.length ? { create: item.flavors } : undefined,
            options: item.options.length ? { create: item.options } : undefined,
          })),
        },
        history: {
          create: {
            status: initialStatus,
            changedByUserId:
              isDineIn && !isDigitalTableOrder ? req.authUser.id : null,
            changedByName:
              isDineIn && !isDigitalTableOrder ? req.authUser.name : customerName,
            changedByRole: isDigitalTableOrder
              ? "CLIENTE_MESA"
              : isDineIn
                ? "GARÇOM"
                : "CLIENTE",
          },
        },
      },
      include: orderInclude,
    });
  });
  if (req.user?.id && fulfillmentType === "DELIVERY") {
    await prisma.user
      .update({
        where: { id: req.user.id },
        data: {
          postalCode,
          street,
          addressNumber,
          complement,
          neighborhood,
          city,
          state,
          referencePoint,
        },
      })
      .catch(() => {});
    if (booleanValue(req.body?.saveFavoriteAddress)) {
      const label = cleanText(req.body?.favoriteAddressLabel, 50) || "Favorito";
      const makeDefault = booleanValue(req.body?.makeDefaultAddress);
      await prisma
        .$transaction(async (tx) => {
          if (makeDefault)
            await tx.customerAddress.updateMany({
              where: { userId: req.user.id },
              data: { isDefault: false },
            });
          await tx.customerAddress.create({
            data: {
              userId: req.user.id,
              label,
              postalCode,
              street,
              addressNumber,
              complement,
              neighborhood,
              city,
              state,
              referencePoint,
              isDefault: makeDefault,
            },
          });
        })
        .catch(() => {});
    }
  }

  let embeddedPayment =
    paymentMethod === "CARD"
      ? {
          type: "CARD",
          amount: Number(order.total),
          publicKey: MERCADOPAGO_PUBLIC_KEY,
        }
      : null;
  if (paymentMethod === "PIX") {
    try {
      const pixPayment = await mercadoPagoRequest("/v1/payments", {
        method: "POST",
        body: JSON.stringify({
          transaction_amount: Number(order.total),
          description: `Pedido ${settings.storeName} #${order.id.slice(-8).toUpperCase()}`,
          payment_method_id: "pix",
          payer: {
            email: customerEmail,
            first_name: customerName,
          },
          external_reference: order.id,
          ...(MERCADOPAGO_NOTIFICATION_URL
            ? { notification_url: MERCADOPAGO_NOTIFICATION_URL }
            : {}),
          date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        }),
        headers: { "X-Idempotency-Key": `pix-${order.id}` },
      });
      const transaction = pixPayment?.point_of_interaction?.transaction_data || {};
      if (pixPayment.status !== "approved" && !transaction.qr_code)
        throw Object.assign(new Error("O provedor não retornou o Pix."), {
          code: "PIX_NOT_CREATED",
        });
      order =
        (await syncMercadoPagoPayment(
          String(pixPayment.id),
          order.trackingCode,
        )) || order;
      embeddedPayment = {
        type: "PIX",
        paymentId: String(pixPayment.id),
        status: pixPayment.status,
        qrCode: transaction.qr_code || "",
        qrCodeBase64: transaction.qr_code_base64 || "",
        expiresAt: pixPayment.date_of_expiration || null,
      };
    } catch (error) {
      await prisma
        .$transaction(async (tx) => {
          await tx.order.delete({ where: { id: order.id } });
          if (couponRecord)
            await tx.coupon.updateMany({
              where: { id: couponRecord.id, uses: { gt: 0 } },
              data: { uses: { decrement: 1 } },
            });
        })
        .catch(() => {});
      console.error("Falha ao criar pagamento Pix:", error.message);
      return res.status(502).json({
        message: "Não foi possível gerar o Pix agora. Tente novamente.",
      });
    }
  }
  const serialized = isDineIn && !isDigitalTableOrder
    ? serializeOrder(order)
    : serializeCustomerOrder(order);
  if (!isDineIn && !["CARD", "PIX"].includes(paymentMethod))
    queueWhatsApp(serialized, "ORDER_CREATED", "Recebido").catch(() => {});
  res.status(201).json({
    ...serialized,
    requiresPayment:
      !isDineIn && ["CARD", "PIX"].includes(paymentMethod),
    payment: embeddedPayment,
    visibleToStore:
      isDineIn ||
      !["CARD", "PIX"].includes(paymentMethod) ||
      order.paymentStatus === "APPROVED",
  });
});

app.post(
  "/api/payments/mercadopago/card",
  paymentRateLimit,
  async (req, res) => {
    const trackingCode = cleanText(req.body?.trackingCode, 100);
    const token = cleanText(req.body?.token, 320);
    const paymentMethodId = cleanText(req.body?.payment_method_id, 80).toLowerCase();
    const issuerId = cleanText(req.body?.issuer_id, 60);
    const installments = boundedInteger(req.body?.installments, 1, 24);
    const payerEmail = cleanText(req.body?.payer?.email, 180).toLowerCase();
    const identificationType = cleanText(
      req.body?.payer?.identification?.type,
      12,
    ).toUpperCase();
    const identificationNumber = cleanText(
      req.body?.payer?.identification?.number,
      40,
    );
    const attemptId = cleanText(req.body?.attemptId, 100);
    if (
      !trackingCode ||
      token.length < 16 ||
      !installments ||
      !/^[a-z0-9_-]{2,80}$/.test(paymentMethodId) ||
      !validEmail(payerEmail)
    )
      return res.status(400).json({
        message: "Dados do cartão incompletos. Confira o formulário e tente novamente.",
      });
    const order = await prisma.order.findUnique({
      where: { trackingCode },
      include: orderInclude,
    });
    if (!order)
      return res.status(404).json({ message: "Pedido não encontrado." });
    if (order.paymentMethod !== "CARD" || order.paymentProvider !== "MERCADO_PAGO")
      return res.status(409).json({ message: "Este pedido não aceita pagamento por cartão." });
    if (order.paymentStatus === "APPROVED")
      return res.json({
        ...serializeCustomerOrder(order),
        paymentId: order.paymentExternalId,
      });
    if (["REJECTED", "CANCELED"].includes(order.paymentStatus))
      return res.status(409).json({
        message: "Este pedido não está mais disponível para pagamento.",
      });
    const idempotencyKey = crypto
      .createHash("sha256")
      .update(`${order.id}:${attemptId || "card-attempt"}`)
      .digest("hex");
    try {
      const payment = await mercadoPagoRequest("/v1/payments", {
        method: "POST",
        body: JSON.stringify({
          transaction_amount: Number(order.total),
          token,
          description: `Pedido #${order.id.slice(-8).toUpperCase()}`,
          installments,
          payment_method_id: paymentMethodId,
          ...(issuerId ? { issuer_id: issuerId } : {}),
          payer: {
            email: payerEmail,
            ...(identificationType && identificationNumber
              ? {
                  identification: {
                    type: identificationType,
                    number: identificationNumber,
                  },
                }
              : {}),
          },
          external_reference: order.id,
          ...(MERCADOPAGO_NOTIFICATION_URL
            ? { notification_url: MERCADOPAGO_NOTIFICATION_URL }
            : {}),
        }),
        headers: { "X-Idempotency-Key": idempotencyKey },
      });
      const updated = await syncMercadoPagoPayment(
        String(payment.id),
        trackingCode,
      );
      if (!updated)
        return res.status(502).json({
          message: "O pagamento não pôde ser vinculado ao pedido.",
        });
      res.json({
        ...serializeCustomerOrder(updated),
        paymentId: String(payment.id),
        providerStatus: payment.status,
        providerStatusDetail: payment.status_detail || null,
      });
    } catch (error) {
      console.error("Falha ao processar cartão:", error.message);
      res.status(502).json({
        message:
          "O Mercado Pago não conseguiu processar o cartão. Confira os dados ou tente outro cartão.",
      });
    }
  },
);

app.post(
  "/api/payments/mercadopago/webhook",
  paymentRateLimit,
  async (req, res) => {
    const paymentId =
      req.query?.["data.id"] || req.body?.data?.id || req.query?.id;
    if (!paymentId || !MERCADOPAGO_ACCESS_TOKEN || !MERCADOPAGO_WEBHOOK_SECRET)
      return res.status(400).json({ ok: false });
    const validSignature = verifyMercadoPagoSignature({
      xSignature: req.get("x-signature"),
      xRequestId: req.get("x-request-id"),
      dataId: paymentId,
      secret: MERCADOPAGO_WEBHOOK_SECRET,
    });
    if (!validSignature) return res.status(401).json({ ok: false });
    if (req.body?.type && req.body.type !== "payment")
      return res.status(200).json({ ok: true, ignored: true });
    res.status(200).json({ ok: true });
    syncMercadoPagoPayment(String(paymentId)).catch((error) =>
      console.error("Falha ao sincronizar pagamento:", error.message),
    );
  },
);
app.post(
  "/api/payments/mercadopago/sync",
  paymentRateLimit,
  async (req, res) => {
    const paymentId = cleanText(req.body?.paymentId, 80);
    const trackingCode = cleanText(req.body?.trackingCode, 100);
    if (!paymentId || !trackingCode)
      return res
        .status(400)
        .json({ message: "Dados de pagamento incompletos." });
    try {
      const order = await syncMercadoPagoPayment(paymentId, trackingCode);
      if (!order)
        return res
          .status(404)
          .json({ message: "Pagamento não corresponde a este pedido." });
      res.json(serializeCustomerOrder(order));
    } catch {
      res
        .status(502)
        .json({ message: "Não foi possível confirmar o pagamento." });
    }
  },
);
app.get(
  "/api/orders/payment-status/:trackingCode",
  trackingRateLimit,
  async (req, res) => {
    let order = await prisma.order.findUnique({
      where: { trackingCode: cleanText(req.params.trackingCode, 100) },
      select: {
        trackingCode: true,
        paymentStatus: true,
        paymentMethod: true,
        paymentMethodLabel: true,
        paymentExternalId: true,
        paymentProvider: true,
        paymentUrl: true,
        status: true,
        scheduledAt: true,
      },
    });
    if (!order)
      return res.status(404).json({ message: "Pedido não encontrado." });
    if (
      order.paymentStatus === "PENDING" &&
      order.paymentProvider === "MERCADO_PAGO" &&
      order.paymentExternalId
    ) {
      try {
        const synced = await syncMercadoPagoPayment(
          order.paymentExternalId,
          order.trackingCode,
        );
        if (synced)
          order = {
            ...order,
            paymentStatus: synced.paymentStatus,
            status: synced.status,
            scheduledAt: synced.scheduledAt,
          };
      } catch {}
    }
    const { paymentExternalId, paymentProvider, ...publicStatus } = order;
    res.json(publicStatus);
  },
);

app.get(
  "/api/orders/track/:trackingCode",
  trackingRateLimit,
  async (req, res) => {
    await activateDueScheduledOrders();
    const order = await prisma.order.findUnique({
      where: { trackingCode: cleanText(req.params.trackingCode, 80) },
      include: orderInclude,
    });
    if (!order)
      return res.status(404).json({ message: "Pedido não encontrado." });
    const o = serializeCustomerOrder(order);
    res.json({
      id: o.id,
      shortCode: o.shortCode,
      trackingCode: o.trackingCode,
      status: o.status,
      fulfillmentType: o.fulfillmentType,
      table: o.table,
      total: o.total,
      createdAt: o.createdAt,
      scheduledAt: o.scheduledAt,
      paymentStatus: o.paymentStatus,
      paymentMethod: o.paymentMethod,
      paymentMethodLabel: o.paymentMethodLabel,
      estimatedDeliveryMin: o.estimatedDeliveryMin,
      estimatedDeliveryMax: o.estimatedDeliveryMax,
      estimatedFrom: o.estimatedFrom,
      estimatedTo: o.estimatedTo,
      neighborhood: o.neighborhood,
      city: o.city,
      cancelReason: o.cancelReason || null,
      items: o.items,
      history: o.history,
    });
  },
);

function permissionNeededForAdminRequest(req) {
  const path = req.path || "/";
  if (path.startsWith("/staff")) return "__OWNER__";
  if (path.startsWith("/tables") || path.startsWith("/table-"))
    return "tables";
  if (path.startsWith("/dashboard")) return "overview";
  if (path.startsWith("/team-analytics")) return "analytics";
  if (path.startsWith("/business-insights")) return "reports";
  if (path.startsWith("/inventory") || path.includes("/recipe"))
    return "inventory";
  if (path.startsWith("/kitchen")) return "kitchen";
  if (path.startsWith("/delivery-surcharges")) return "delivery";
  if (path.startsWith("/courier")) return "orders";
  if (path.startsWith("/orders")) return "orders";
  if (path.startsWith("/customers")) return "customers";
  if (path.startsWith("/customer-segments")) return "customers";
  if (path.startsWith("/promotions")) return "promotions";
  if (path.startsWith("/coupons")) return "promotions";
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
  if (path.startsWith("/store-hours")) return "settings";
  if (path.startsWith("/operations")) return "operations";
  if (path.startsWith("/media")) return "__CONTENT__";
  if (path.startsWith("/products") || path.startsWith("/sizes"))
    return req.method === "GET" ? "__PRODUCT_READ__" : "products";
  if (path.startsWith("/categories") || path.startsWith("/subcategories"))
    return req.method === "GET" ? "__CATEGORY_READ__" : "categories";
  if (path.startsWith("/flavors") || path.startsWith("/modifier-"))
    return req.method === "GET" ? "__ALTERATION_READ__" : "alterations";
  if (path.startsWith("/modifier-groups"))
    return req.method === "GET" ? "__ALTERATION_READ__" : "alterations";
  if (path.startsWith("/settings")) {
    if (req.method === "GET") return "__SHARED_SETTINGS__";
    const keys = Object.keys(req.body || {});
    const operationFields = new Set([
      "isOpen",
      "deliveryEnabled",
      "pickupEnabled",
      "schedulingEnabled",
    ]);
    const deliveryFields = new Set([
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
    if (keys.length && keys.every((key) => operationFields.has(key)))
      return "operations";
    if (keys.length && keys.every((key) => deliveryFields.has(key)))
      return "delivery";
    return "settings";
  }
  return null;
}
app.use("/api/admin", auth, admin, adminRateLimit, (req, res, next) => {
  const needed = permissionNeededForAdminRequest(req);
  if (!needed)
    return res.status(403).json({
      code: "ADMIN_PERMISSION_UNMAPPED",
      message: "Esta rota administrativa não possui uma permissão configurada.",
    });
  if (needed === "__OWNER__") return ownerOnly(req, res, next);
  if (needed === "__SHARED_SETTINGS__") return next();
  if (needed === "__CONTENT__") {
    if (
      req.adminPermissions == null ||
      ["products", "promotions", "alterations", "settings"].some((key) =>
        hasAdminPermission(req, key),
      )
    )
      return next();
  } else if (needed === "__PRODUCT_READ__") {
    if (
      req.adminPermissions == null ||
      ["products", "promotions"].some((key) => hasAdminPermission(req, key))
    )
      return next();
  } else if (needed === "__CATEGORY_READ__") {
    if (
      req.adminPermissions == null ||
      ["categories", "products"].some((key) => hasAdminPermission(req, key))
    )
      return next();
  } else if (needed === "__ALTERATION_READ__") {
    if (
      req.adminPermissions == null ||
      ["alterations", "products"].some((key) => hasAdminPermission(req, key))
    )
      return next();
  } else if (hasAdminPermission(req, needed)) {
    return next();
  }
  return res.status(403).json({
    code: "ADMIN_PERMISSION_DENIED",
    message: "Seu usuário não tem permissão para esta área do painel.",
  });
});

const tableOrderInclude = {
  include: {
    table: true,
    items: { include: { flavors: true, options: true } },
    history: { orderBy: { createdAt: "asc" } },
  },
  orderBy: { createdAt: "asc" },
};
const tableSessionInclude = {
  table: true,
  orders: tableOrderInclude,
};
function requireTableManager(req, res) {
  if (!hasTableAccess(req)) {
    res.status(403).json({ message: "Acesso às mesas não autorizado." });
    return false;
  }
  if (req.adminUser.staffRole === "WAITER") {
    res.status(403).json({
      code: "TABLE_MANAGER_ONLY",
      message: "O garçom pode atender mesas, mas não alterar o cadastro delas.",
    });
    return false;
  }
  return true;
}
function serializeRestaurantTable(table) {
  const currentSession = table.sessions?.[0]
    ? serializeTableSession(table.sessions[0])
    : null;
  const { sessions, ...row } = table;
  return {
    ...row,
    label: tableLabel(table),
    occupied: Boolean(currentSession),
    currentSession,
  };
}

app.get("/api/admin/tables", auth, admin, async (req, res) => {
  const includeInactive = req.query.all === "1" && req.adminUser.staffRole !== "WAITER";
  const rows = await prisma.restaurantTable.findMany({
    where: includeInactive ? {} : { active: true },
    include: {
      sessions: {
        where: { status: "OPEN", openKey: { not: null } },
        include: { orders: tableOrderInclude },
        orderBy: { openedAt: "desc" },
        take: 1,
      },
    },
    orderBy: [{ sortOrder: "asc" }, { number: "asc" }],
  });
  res.json(rows.map(serializeRestaurantTable));
});

app.post("/api/admin/tables", auth, admin, async (req, res) => {
  if (!requireTableManager(req, res)) return;
  const number = boundedInteger(req.body?.number, 1, 999);
  const seats = boundedInteger(req.body?.seats ?? 4, 1, 50);
  const sortOrder = boundedInteger(req.body?.sortOrder ?? number, 0, 100_000);
  const name = cleanText(req.body?.name, 80) || null;
  const location = cleanText(req.body?.location, 100) || null;
  if (number == null || seats == null || sortOrder == null)
    return res.status(400).json({
      message: "Informe um número de mesa e uma quantidade de lugares válidos.",
    });
  const row = await prisma.restaurantTable.create({
    data: { number, seats, sortOrder, name, location },
  });
  await writeAdminLog(req, "CREATE_TABLE", "RestaurantTable", row.id, {
    number,
    seats,
  });
  res.status(201).json({ ...row, label: tableLabel(row), occupied: false, currentSession: null });
});

app.post("/api/admin/tables/bulk", auth, admin, async (req, res) => {
  if (!requireTableManager(req, res)) return;
  const startNumber = boundedInteger(req.body?.startNumber ?? 1, 1, 999);
  const count = boundedInteger(req.body?.count ?? 10, 1, 100);
  const seats = boundedInteger(req.body?.seats ?? 4, 1, 50);
  if (startNumber == null || count == null || seats == null || startNumber + count - 1 > 999)
    return res.status(400).json({ message: "Intervalo de mesas inválido." });
  const numbers = Array.from({ length: count }, (_, index) => startNumber + index);
  const result = await prisma.restaurantTable.createMany({
    data: numbers.map((number) => ({ number, seats, sortOrder: number })),
    skipDuplicates: true,
  });
  await writeAdminLog(req, "BULK_CREATE_TABLES", "RestaurantTable", null, {
    startNumber,
    count,
    created: result.count,
  });
  res.status(201).json({ created: result.count });
});

app.patch("/api/admin/tables/:id", auth, admin, async (req, res) => {
  if (!requireTableManager(req, res)) return;
  const current = await prisma.restaurantTable.findUnique({
    where: { id: req.params.id },
    include: {
      sessions: {
        where: { status: "OPEN", openKey: { not: null } },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!current)
    return res.status(404).json({ message: "Mesa não encontrada." });
  const data = {};
  if (req.body?.number !== undefined) {
    data.number = boundedInteger(req.body.number, 1, 999);
    if (data.number == null)
      return res.status(400).json({ message: "Número de mesa inválido." });
  }
  if (req.body?.seats !== undefined) {
    data.seats = boundedInteger(req.body.seats, 1, 50);
    if (data.seats == null)
      return res.status(400).json({ message: "Quantidade de lugares inválida." });
  }
  if (req.body?.sortOrder !== undefined) {
    data.sortOrder = boundedInteger(req.body.sortOrder, 0, 100_000);
    if (data.sortOrder == null)
      return res.status(400).json({ message: "Ordem da mesa inválida." });
  }
  if (req.body?.name !== undefined)
    data.name = cleanText(req.body.name, 80) || null;
  if (req.body?.location !== undefined)
    data.location = cleanText(req.body.location, 100) || null;
  if (req.body?.active !== undefined) {
    data.active = booleanValue(req.body.active);
    if (!data.active && current.sessions.length)
      return res.status(409).json({
        message: "Feche ou cancele a comanda antes de desativar esta mesa.",
      });
  }
  const row = await prisma.restaurantTable.update({
    where: { id: current.id },
    data,
  });
  await writeAdminLog(req, "UPDATE_TABLE", "RestaurantTable", row.id, data);
  res.json({ ...row, label: tableLabel(row), occupied: false, currentSession: null });
});

app.delete("/api/admin/tables/:id", auth, admin, async (req, res) => {
  if (!requireTableManager(req, res)) return;
  const open = await prisma.tableSession.findFirst({
    where: { tableId: req.params.id, status: "OPEN", openKey: { not: null } },
    select: { id: true },
  });
  if (open)
    return res.status(409).json({
      message: "Feche ou cancele a comanda antes de desativar esta mesa.",
    });
  const row = await prisma.restaurantTable.update({
    where: { id: req.params.id },
    data: { active: false },
  });
  await writeAdminLog(req, "ARCHIVE_TABLE", "RestaurantTable", row.id);
  res.json({ ok: true, archived: true });
});

app.post("/api/admin/tables/:id/open", auth, admin, async (req, res) => {
  if (!hasTableAccess(req))
    return res.status(403).json({ message: "Acesso às mesas não autorizado." });
  const customerName = cleanText(req.body?.customerName, 80) || null;
  const guestCount =
    req.body?.guestCount === "" || req.body?.guestCount == null
      ? null
      : boundedInteger(req.body.guestCount, 1, 50);
  const notes = cleanText(req.body?.notes, 300) || null;
  if (req.body?.guestCount !== "" && req.body?.guestCount != null && guestCount == null)
    return res.status(400).json({ message: "Quantidade de pessoas inválida." });
  const session = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('master-pizza-table'), hashtext(${req.params.id}))`;
    const table = await tx.restaurantTable.findFirst({
      where: { id: req.params.id, active: true },
    });
    if (!table)
      throw Object.assign(new Error("Mesa não encontrada ou desativada."), {
        code: "TABLE_NOT_AVAILABLE",
      });
    const existing = await tx.tableSession.findFirst({
      where: { tableId: table.id, status: "OPEN", openKey: { not: null } },
      select: { id: true },
    });
    if (existing)
      throw Object.assign(new Error("Esta mesa já possui uma comanda aberta."), {
        code: "TABLE_NOT_AVAILABLE",
      });
    return tx.tableSession.create({
      data: {
        tableId: table.id,
        openKey: table.id,
        customerName,
        guestCount,
        notes,
        openedById: req.adminUser.id,
        openedByName: req.adminUser.name,
      },
      include: tableSessionInclude,
    });
  });
  await writeAdminLog(req, "OPEN_TABLE", "TableSession", session.id, {
    tableId: session.tableId,
    guestCount,
  });
  res.status(201).json(serializeTableSession(session));
});

app.patch("/api/admin/table-sessions/:id", auth, admin, async (req, res) => {
  if (!hasTableAccess(req))
    return res.status(403).json({ message: "Acesso às mesas não autorizado." });
  const session = await prisma.tableSession.findFirst({
    where: { id: req.params.id, status: "OPEN", openKey: { not: null } },
  });
  if (!session)
    return res.status(404).json({ message: "Comanda aberta não encontrada." });
  const data = {};
  if (req.body?.customerName !== undefined)
    data.customerName = cleanText(req.body.customerName, 80) || null;
  if (req.body?.notes !== undefined)
    data.notes = cleanText(req.body.notes, 300) || null;
  if (req.body?.guestCount !== undefined) {
    data.guestCount =
      req.body.guestCount === "" || req.body.guestCount == null
        ? null
        : boundedInteger(req.body.guestCount, 1, 50);
    if (req.body.guestCount !== "" && req.body.guestCount != null && data.guestCount == null)
      return res.status(400).json({ message: "Quantidade de pessoas inválida." });
  }
  const row = await prisma.tableSession.update({
    where: { id: session.id },
    data,
    include: tableSessionInclude,
  });
  res.json(serializeTableSession(row));
});

app.post("/api/admin/table-orders/:id/served", auth, admin, async (req, res) => {
  if (!hasTableAccess(req))
    return res.status(403).json({ message: "Acesso às mesas não autorizado." });
  const row = await prisma.$transaction(async (tx) => {
    const target = await tx.order.findUnique({
      where: { id: req.params.id },
      select: { tableSessionId: true },
    });
    if (!target?.tableSessionId)
      throw Object.assign(new Error("Pedido de mesa não encontrado."), {
        code: "TABLE_ORDER_UNAVAILABLE",
      });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('master-pizza-table-session'), hashtext(${target.tableSessionId}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${req.params.id}))`;
    const current = await tx.order.findFirst({
      where: {
        id: req.params.id,
        fulfillmentType: "DINE_IN",
        status: "READY_FOR_TABLE",
        tableSession: { status: "OPEN", openKey: { not: null } },
      },
      select: { id: true },
    });
    if (!current)
      throw Object.assign(new Error("Pedido não está pronto ou a comanda foi fechada."), {
        code: "TABLE_ORDER_UNAVAILABLE",
      });
    await tx.order.update({ where: { id: current.id }, data: { status: "SERVED" } });
    await tx.orderStatusHistory.create({
      data: {
        orderId: current.id,
        status: "SERVED",
        changedByUserId: req.adminUser.id,
        changedByName: req.adminUser.name,
        changedByRole: req.adminUser.staffRole === "WAITER" ? "GARÇOM" : "ADMINISTRADOR",
      },
    });
    return tx.order.findUnique({ where: { id: current.id }, include: orderInclude });
  });
  res.json(serializeOrder(row));
});

app.post("/api/admin/table-orders/:id/cancel", auth, admin, async (req, res) => {
  if (!hasTableAccess(req))
    return res.status(403).json({ message: "Acesso às mesas não autorizado." });
  const reason = cleanText(req.body?.reason, 280);
  if (reason.length < 3)
    return res.status(400).json({ message: "Informe o motivo do cancelamento." });
  const row = await prisma.$transaction(async (tx) => {
    const target = await tx.order.findUnique({
      where: { id: req.params.id },
      select: { tableSessionId: true },
    });
    if (!target?.tableSessionId)
      throw Object.assign(new Error("Pedido de mesa não encontrado."), {
        code: "TABLE_ORDER_UNAVAILABLE",
      });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('master-pizza-table-session'), hashtext(${target.tableSessionId}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${req.params.id}))`;
    const current = await tx.order.findFirst({
      where: {
        id: req.params.id,
        fulfillmentType: "DINE_IN",
        status: { in: ["RECEIVED", "PREPARING", "READY_FOR_TABLE", "SERVED"] },
        tableSession: { status: "OPEN", openKey: { not: null } },
      },
      select: { id: true },
    });
    if (!current)
      throw Object.assign(new Error("Pedido não pode mais ser cancelado."), {
        code: "TABLE_ORDER_UNAVAILABLE",
      });
    await restoreOrderStock(tx, current.id);
    await tx.order.update({
      where: { id: current.id },
      data: { status: "CANCELED", cancelReason: reason },
    });
    await tx.orderStatusHistory.create({
      data: {
        orderId: current.id,
        status: "CANCELED",
        changedByUserId: req.adminUser.id,
        changedByName: req.adminUser.name,
        changedByRole: req.adminUser.staffRole === "WAITER" ? "GARÇOM" : "ADMINISTRADOR",
      },
    });
    return tx.order.findUnique({ where: { id: current.id }, include: orderInclude });
  });
  await writeAdminLog(req, "CANCEL_TABLE_ORDER", "Order", row.id, { reason });
  res.json(serializeOrder(row));
});

app.post("/api/admin/table-sessions/:id/cancel", auth, admin, async (req, res) => {
  if (!hasTableAccess(req))
    return res.status(403).json({ message: "Acesso às mesas não autorizado." });
  const cancelOrders = booleanValue(req.body?.cancelOrders);
  const reason = cleanText(req.body?.reason, 280);
  const row = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('master-pizza-table-session'), hashtext(${req.params.id}))`;
    const current = await tx.tableSession.findFirst({
      where: { id: req.params.id, status: "OPEN", openKey: { not: null } },
      include: { orders: { where: { status: { not: "CANCELED" } } } },
    });
    if (!current)
      throw Object.assign(new Error("Comanda aberta não encontrada."), {
        code: "TABLE_SESSION_CLOSED",
      });
    if (current.orders.length && !cancelOrders)
      throw Object.assign(
        new Error("Esta comanda possui pedidos. Confirme o cancelamento de todos eles."),
        { code: "TABLE_SESSION_HAS_ORDERS" },
      );
    if (current.orders.length && reason.length < 3)
      throw Object.assign(new Error("Informe o motivo para cancelar os pedidos."), {
        code: "TABLE_SESSION_HAS_ORDERS",
      });
    for (const order of current.orders) {
      await restoreOrderStock(tx, order.id);
      await tx.order.update({
        where: { id: order.id },
        data: { status: "CANCELED", cancelReason: reason },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: "CANCELED",
          changedByUserId: req.adminUser.id,
          changedByName: req.adminUser.name,
          changedByRole: req.adminUser.staffRole === "WAITER" ? "GARÇOM" : "ADMINISTRADOR",
        },
      });
    }
    return tx.tableSession.update({
      where: { id: current.id },
      data: {
        status: "CANCELED",
        openKey: null,
        closedAt: new Date(),
        closedById: req.adminUser.id,
        closedByName: req.adminUser.name,
        notes: reason || current.notes,
      },
      include: tableSessionInclude,
    });
  });
  await writeAdminLog(req, "CANCEL_TABLE_SESSION", "TableSession", row.id, { reason });
  res.json(serializeTableSession(row));
});

app.post("/api/admin/table-sessions/:id/close", auth, admin, async (req, res) => {
  if (!hasTableAccess(req))
    return res.status(403).json({ message: "Acesso às mesas não autorizado." });
  const requestedPaymentMethod = cleanText(req.body?.paymentMethod, 80);
  let paymentMethod = requestedPaymentMethod.startsWith(CUSTOM_PAYMENT_PREFIX)
    ? requestedPaymentMethod
    : requestedPaymentMethod.toUpperCase();
  let paymentMethodLabel = null;
  if (paymentMethod.startsWith(CUSTOM_PAYMENT_PREFIX)) {
    const customPayment = resolveCustomPaymentMethod(
      await getSettings(),
      paymentMethod,
      "TABLE",
    );
    if (!customPayment)
      return res.status(409).json({
        code: "TABLE_PAYMENT_INVALID",
        message: "Esta forma de pagamento não está mais disponível.",
      });
    paymentMethod = "CUSTOM";
    paymentMethodLabel = customPayment.label;
  }
  const rawAmountPaid =
    typeof req.body?.amountPaid === "string"
      ? Number(req.body.amountPaid.replace(/[^0-9,.-]/g, "").replace(",", "."))
      : Number(req.body?.amountPaid);
  const row = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('master-pizza-table-session'), hashtext(${req.params.id}))`;
    const current = await tx.tableSession.findFirst({
      where: { id: req.params.id, status: "OPEN", openKey: { not: null } },
      include: { orders: { where: { status: { not: "CANCELED" } } } },
    });
    if (!current)
      throw Object.assign(new Error("Esta comanda já foi fechada."), {
        code: "TABLE_SESSION_CLOSED",
      });
    if (!current.orders.length)
      throw Object.assign(new Error("Uma comanda vazia deve ser cancelada, não recebida."), {
        code: "TABLE_PAYMENT_INVALID",
      });
    const pending = current.orders.filter((order) =>
      ["RECEIVED", "PREPARING"].includes(order.status),
    );
    if (pending.length)
      throw Object.assign(
        new Error("Ainda existem pedidos em preparo. Aguarde a cozinha finalizar antes de receber."),
        { code: "TABLE_ORDERS_PENDING" },
      );
    const summary = summarizeTableOrders(current.orders);
    const payment = calculateTablePayment(summary.subtotal, paymentMethod, rawAmountPaid);
    if (!payment.ok)
      throw Object.assign(new Error(payment.message), { code: "TABLE_PAYMENT_INVALID" });
    const closedAt = new Date();
    await tx.order.updateMany({
      where: { tableSessionId: current.id, status: { not: "CANCELED" } },
      data: {
        status: "DELIVERED",
        paymentMethod,
        paymentMethodLabel,
        paymentStatus: "APPROVED",
        paidAt: closedAt,
        deliveredAt: closedAt,
        changeFor: payment.changeAmount || null,
      },
    });
    await tx.orderStatusHistory.createMany({
      data: current.orders.map((order) => ({
        orderId: order.id,
        status: "DELIVERED",
        changedByUserId: req.adminUser.id,
        changedByName: req.adminUser.name,
        changedByRole: req.adminUser.staffRole === "WAITER" ? "GARÇOM" : "ADMINISTRADOR",
      })),
    });
    return tx.tableSession.update({
      where: { id: current.id },
      data: {
        status: "CLOSED",
        openKey: null,
        closedAt,
        closedById: req.adminUser.id,
        closedByName: req.adminUser.name,
        paymentMethod,
        paymentMethodLabel,
        subtotal: payment.total,
        total: payment.total,
        amountPaid: payment.amountPaid,
        changeAmount: payment.changeAmount,
      },
      include: tableSessionInclude,
    });
  });
  await writeAdminLog(req, "CLOSE_TABLE", "TableSession", row.id, {
    tableId: row.tableId,
    paymentMethod,
    paymentMethodLabel,
    total: Number(row.total),
  });
  res.json(serializeTableSession(row));
});

app.get("/api/admin/table-sessions/history", auth, admin, async (req, res) => {
  const limit = boundedInteger(req.query.limit ?? 30, 1, 100) || 30;
  const rows = await prisma.tableSession.findMany({
    where: {
      status: { in: ["CLOSED", "CANCELED"] },
      closedAt: { gte: new Date(Date.now() - 12 * 60 * 60 * 1000) },
    },
    include: { table: true },
    orderBy: { closedAt: "desc" },
    take: limit,
  });
  res.json(rows.map(serializeTableSession));
});

app.get("/api/admin/dashboard", auth, admin, async (req, res) => {
  await activateDueScheduledOrders();
  const settings = await getSettings();
  const start = startOfZonedDay(
    new Date(),
    settings.timezone || "America/Maceio",
  );
  // Uma única transação em lote usa uma conexão do pool. O antigo Promise.all
  // abria quatro consultas simultâneas e podia esgotar o limite pequeno do Neon.
  const [todayOrders, openOrders, scheduledOrders, activeOrders] =
    await prisma.$transaction([
      prisma.order.count({
        where: {
          createdAt: { gte: start },
          paymentStatus: { in: ["APPROVED", "CASH_PENDING"] },
        },
      }),
      prisma.order.count({
        where: {
          paymentStatus: { in: ["APPROVED", "CASH_PENDING"] },
          status: {
            in: [
              "RECEIVED",
              "PREPARING",
            ],
          },
        },
      }),
      prisma.order.count({
        where: {
          paymentStatus: { in: ["APPROVED", "CASH_PENDING"] },
          status: "SCHEDULED",
        },
      }),
      prisma.order.findMany({
        where: {
          paymentStatus: { in: ["APPROVED", "CASH_PENDING"] },
          status: {
            in: [
              "RECEIVED",
              "PREPARING",
              "OUT_FOR_DELIVERY",
              "READY_FOR_PICKUP",
              "READY_FOR_TABLE",
              "SERVED",
            ],
          },
          acceptedAt: { not: null },
        },
        select: { acceptedAt: true, estimatedDeliveryMax: true },
      }),
    ]);
  const warningWindow =
    Math.max(1, Number(settings.lateWarningMinutes || 30)) * 60_000;
  const now = Date.now();
  let warningOrders = 0,
    overdueOrders = 0;
  for (const order of activeOrders) {
    const accepted = new Date(order.acceptedAt).getTime();
    if (!Number.isFinite(accepted)) continue;
    const deadline =
      accepted +
      Math.max(
        1,
        Number(order.estimatedDeliveryMax || settings.deliveryEtaMax || 45),
      ) *
        60_000;
    const remaining = deadline - now;
    if (remaining <= 0) overdueOrders++;
    else if (remaining <= warningWindow) warningOrders++;
  }
  res.json({
    todayOrders,
    openOrders,
    scheduledOrders,
    warningOrders,
    overdueOrders,
  });
});

function zonedMonthKey(date, timezone = "America/Maceio") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date(date));
  return `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}`;
}
function dateKeyToUtc(key) {
  return new Date(`${key}T12:00:00Z`);
}
function shiftDateKey(key, days) {
  const d = dateKeyToUtc(key);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function startOfWeekKey(todayKey) {
  const d = dateKeyToUtc(todayKey);
  const day = (d.getUTCDay() + 6) % 7;
  return shiftDateKey(todayKey, -day);
}
function monthLabel(key) {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" })
    .format(new Date(Date.UTC(year, month - 1, 1)))
    .replace(" de ", "/");
}
function dayLabel(key) {
  const [y, m, d] = key.split("-");
  return `${d}/${m}`;
}
function weekLabel(key) {
  const end = shiftDateKey(key, 6);
  return `${dayLabel(key)}–${dayLabel(end)}`;
}
function yearLabel(key) {
  return String(key);
}

app.get("/api/admin/team-analytics", auth, admin, async (req, res) => {
  const settings = await getSettings();
  const timezone = settings.timezone || "America/Maceio";
  const todayKey = zonedDateKey(new Date(), timezone),
    weekKey = startOfWeekKey(todayKey),
    monthKey = todayKey.slice(0, 7),
    yearKey = todayKey.slice(0, 4);
  const users = await prisma.user.findMany({
    where: { isAdmin: true },
    select: {
      id: true,
      name: true,
      email: true,
      staffRole: true,
      staffActive: true,
      adminPermissions: true,
      createdAt: true,
    },
  });
  const orders = await prisma.order.findMany({
    where: { paymentStatus: { in: ["APPROVED", "CASH_PENDING"] } },
    select: {
      id: true,
      total: true,
      deliveryFee: true,
      status: true,
      fulfillmentType: true,
      createdAt: true,
      updatedAt: true,
      paymentMethod: true,
      paymentMethodLabel: true,
      paymentStatus: true,
      customerName: true,
      customerPhone: true,
      trackingCode: true,
      cancelReason: true,
      distanceKm: true,
      neighborhood: true,
      city: true,
    },
    orderBy: { createdAt: "asc" },
  });
  const histories = await prisma.orderStatusHistory.findMany({
    where: { changedByUserId: { not: null } },
    select: {
      orderId: true,
      status: true,
      changedByUserId: true,
      changedByName: true,
      changedByRole: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
  const orderMap = new Map(orders.map((o) => [o.id, o]));
  const deliveredByOrder = new Map(),
    canceledByOrder = new Map(),
    uniqueActions = new Map();
  for (const h of histories) {
    const actor = h.changedByUserId || null;
    if (!actor || !orderMap.has(h.orderId)) continue;
    const actionKey = `${h.orderId}:${h.status}:${actor}`;
    if (!uniqueActions.has(actionKey)) uniqueActions.set(actionKey, h);
    if (h.status === "DELIVERED" && !deliveredByOrder.has(h.orderId))
      deliveredByOrder.set(h.orderId, h);
    if (h.status === "CANCELED" && !canceledByOrder.has(h.orderId))
      canceledByOrder.set(h.orderId, h);
  }
  const blankDetails = () => ({ delivered: [], canceled: [] });
  const team = new Map(
    users.map((u) => [
      u.id,
      {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.staffRole || "STAFF",
        active: u.staffActive !== false,
        completedOrders: 0,
        deliveries: 0,
        deliveredRevenue: 0,
        deliveryFees: 0,
        cashCollected: 0,
        totalDistanceKm: 0,
        canceledOrders: 0,
        statusActions: 0,
        lastActivity: null,
        details: blankDetails(),
      },
    ]),
  );
  for (const h of histories) {
    if (h.changedByUserId && !team.has(h.changedByUserId))
      team.set(h.changedByUserId, {
        id: h.changedByUserId,
        name: h.changedByName || "Ex-funcionário",
        email: "",
        role: h.changedByRole === "ENTREGADOR" ? "DELIVERY" : "STAFF",
        active: false,
        former: true,
        completedOrders: 0,
        deliveries: 0,
        deliveredRevenue: 0,
        deliveryFees: 0,
        cashCollected: 0,
        totalDistanceKm: 0,
        canceledOrders: 0,
        statusActions: 0,
        lastActivity: null,
        details: blankDetails(),
      });
  }
  for (const h of uniqueActions.values()) {
    const row = team.get(h.changedByUserId);
    if (!row) continue;
    row.statusActions++;
    if (!row.lastActivity || new Date(h.createdAt) > new Date(row.lastActivity))
      row.lastActivity = h.createdAt;
  }
  for (const [orderId, h] of deliveredByOrder) {
    const order = orderMap.get(orderId),
      row = team.get(h.changedByUserId);
    if (!order || !row) continue;
    row.completedOrders++;
    row.deliveredRevenue += Number(order.total || 0);
    if (order.fulfillmentType === "DELIVERY") {
      row.deliveries++;
      row.deliveryFees += Number(order.deliveryFee || 0);
      row.totalDistanceKm += Number(order.distanceKm || 0);
      if (order.paymentMethod === "CASH")
        row.cashCollected += Number(order.total || 0);
    }
    const detailDateKey = zonedDateKey(h.createdAt, timezone),
      detailMonthKey = zonedMonthKey(h.createdAt, timezone);
    row.details.delivered.push({
      orderId,
      shortCode: String(order.id.slice(-8)).toUpperCase(),
      trackingCode: order.trackingCode,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      paymentMethod: order.paymentMethod,
      paymentMethodLabel: order.paymentMethodLabel,
      paymentStatus: order.paymentStatus,
      total: Number(order.total || 0),
      deliveryFee: Number(order.deliveryFee || 0),
      netRevenue: roundMoney(
        Number(order.total || 0) - Number(order.deliveryFee || 0),
      ),
      distanceKm: numberOrNull(order.distanceKm),
      cashCollected:
        order.fulfillmentType === "DELIVERY" && order.paymentMethod === "CASH"
          ? Number(order.total || 0)
          : 0,
      neighborhood: order.neighborhood || "",
      city: order.city || "",
      fulfillmentType: order.fulfillmentType,
      at: h.createdAt,
      periods: {
        day: detailDateKey === todayKey,
        week: detailDateKey >= weekKey,
        month: detailMonthKey === monthKey,
        year: detailDateKey.startsWith(yearKey),
      },
    });
  }
  for (const [orderId, h] of canceledByOrder) {
    const row = team.get(h.changedByUserId),
      order = orderMap.get(orderId);
    if (row && order) {
      const detailDateKey = zonedDateKey(h.createdAt, timezone),
        detailMonthKey = zonedMonthKey(h.createdAt, timezone);
      row.canceledOrders++;
      row.details.canceled.push({
        orderId,
        shortCode: String(order.id.slice(-8)).toUpperCase(),
        trackingCode: order.trackingCode,
        customerName: order.customerName,
        total: Number(order.total || 0),
        cancelReason: order.cancelReason || "",
        at: h.createdAt,
        periods: {
          day: detailDateKey === todayKey,
          week: detailDateKey >= weekKey,
          month: detailMonthKey === monthKey,
          year: detailDateKey.startsWith(yearKey),
        },
      });
    }
  }
  const teamRows = [...team.values()]
    .map((r) => ({
      ...r,
      deliveredRevenue: roundMoney(r.deliveredRevenue),
      deliveryFees: roundMoney(r.deliveryFees),
      cashCollected: roundMoney(r.cashCollected),
      totalDistanceKm: Math.round(Number(r.totalDistanceKm || 0) * 10) / 10,
      netRevenue: roundMoney(r.deliveredRevenue - r.deliveryFees),
      details: {
        delivered: r.details.delivered
          .sort((a, b) => new Date(b.at) - new Date(a.at))
          .slice(0, 100),
        canceled: r.details.canceled
          .sort((a, b) => new Date(b.at) - new Date(a.at))
          .slice(0, 100),
      },
    }))
    .sort(
      (a, b) =>
        b.deliveredRevenue - a.deliveredRevenue ||
        b.completedOrders - a.completedOrders ||
        a.name.localeCompare(b.name, "pt-BR"),
    );

  const periods = {
    day: {
      key: todayKey,
      completed: 0,
      deliveries: 0,
      revenue: 0,
      deliveryFees: 0,
      canceled: 0,
      netRevenue: 0,
    },
    week: {
      key: weekKey,
      completed: 0,
      deliveries: 0,
      revenue: 0,
      deliveryFees: 0,
      canceled: 0,
      netRevenue: 0,
    },
    month: {
      key: monthKey,
      completed: 0,
      deliveries: 0,
      revenue: 0,
      deliveryFees: 0,
      canceled: 0,
      netRevenue: 0,
    },
    year: {
      key: yearKey,
      completed: 0,
      deliveries: 0,
      revenue: 0,
      deliveryFees: 0,
      canceled: 0,
      netRevenue: 0,
    },
    lifetime: {
      key: "all",
      completed: 0,
      deliveries: 0,
      revenue: 0,
      deliveryFees: 0,
      canceled: 0,
      netRevenue: 0,
    },
  };
  const blankHistory = (key, label) => ({
    key,
    label,
    completed: 0,
    deliveries: 0,
    revenue: 0,
    deliveryFees: 0,
    canceled: 0,
    netRevenue: 0,
  });
  const dailyKeys = [];
  for (let i = 13; i >= 0; i--) dailyKeys.push(shiftDateKey(todayKey, -i));
  const weeklyKeys = [];
  for (let i = 11; i >= 0; i--) weeklyKeys.push(shiftDateKey(weekKey, -i * 7));
  const nowMonth = new Date(`${monthKey}-01T12:00:00Z`);
  const monthKeys = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(nowMonth);
    d.setUTCMonth(d.getUTCMonth() - i);
    monthKeys.push(d.toISOString().slice(0, 7));
  }
  const yearKeys = [];
  for (let i = 4; i >= 0; i--) yearKeys.push(String(Number(yearKey) - i));
  const dailyMap = new Map(
    dailyKeys.map((key) => [key, blankHistory(key, dayLabel(key))]),
  );
  const weeklyMap = new Map(
    weeklyKeys.map((key) => [key, blankHistory(key, weekLabel(key))]),
  );
  const monthlyMap = new Map(
    monthKeys.map((key) => [key, blankHistory(key, monthLabel(key))]),
  );
  const yearlyMap = new Map(
    yearKeys.map((key) => [key, blankHistory(key, yearLabel(key))]),
  );
  for (const order of orders) {
    const isDelivered = order.status === "DELIVERED",
      isCanceled = order.status === "CANCELED";
    const terminalEvent = isDelivered
      ? deliveredByOrder.get(order.id)
      : isCanceled
        ? canceledByOrder.get(order.id)
        : null;
    const terminalDate =
      terminalEvent?.createdAt || order.updatedAt || order.createdAt;
    const dateKey = zonedDateKey(terminalDate, timezone),
      mKey = zonedMonthKey(terminalDate, timezone);
    if (!isDelivered && !isCanceled) continue;
    const apply = (bucket) => {
      if (isDelivered) {
        bucket.completed++;
        bucket.revenue += Number(order.total || 0);
        if (order.fulfillmentType === "DELIVERY") {
          bucket.deliveries++;
          bucket.deliveryFees += Number(order.deliveryFee || 0);
        }
        bucket.netRevenue +=
          Number(order.total || 0) - Number(order.deliveryFee || 0);
      } else bucket.canceled++;
    };
    apply(periods.lifetime);
    if (dateKey === todayKey) apply(periods.day);
    if (dateKey >= weekKey) apply(periods.week);
    if (mKey === monthKey) apply(periods.month);
    if (dateKey.startsWith(yearKey)) apply(periods.year);
    const daily = dailyMap.get(dateKey);
    if (daily) apply(daily);
    const weekly = weeklyMap.get(startOfWeekKey(dateKey));
    if (weekly) apply(weekly);
    const monthly = monthlyMap.get(mKey);
    if (monthly) apply(monthly);
    const yearly = yearlyMap.get(dateKey.slice(0, 4));
    if (yearly) apply(yearly);
  }
  const finalize = (bucket) => ({
    ...bucket,
    revenue: roundMoney(bucket.revenue),
    deliveryFees: roundMoney(bucket.deliveryFees),
    netRevenue: roundMoney(bucket.netRevenue),
  });
  for (const key of Object.keys(periods)) periods[key] = finalize(periods[key]);
  const history = {
    daily: [...dailyMap.values()].map(finalize),
    weekly: [...weeklyMap.values()].map(finalize),
    monthly: [...monthlyMap.values()].map(finalize),
    yearly: [...yearlyMap.values()].map(finalize),
  };
  res.json({
    updatedAt: new Date().toISOString(),
    timezone,
    periods,
    monthly: history.monthly,
    history,
    team: teamRows,
  });
});

app.get("/api/admin/orders", auth, admin, async (req, res) => {
  await activateDueScheduledOrders();
  const where = { paymentStatus: { in: ["APPROVED", "CASH_PENDING"] } };
  if (req.adminUser?.staffRole === "DELIVERY") {
    // Fila compartilhada: todos os entregadores veem somente corridas prontas ainda não aceitas.
    // Assim que um deles aceita, o pedido passa a ser exclusivo daquele entregador.
    where.OR = [
      {
        status: "READY_FOR_DELIVERY",
        fulfillmentType: "DELIVERY",
        assignedCourierId: null,
      },
      { status: "OUT_FOR_DELIVERY", assignedCourierId: req.adminUser.id },
      {
        status: "DELIVERED",
        OR: [
          { assignedCourierId: req.adminUser.id },
          {
            history: {
              some: { status: "DELIVERED", changedByUserId: req.adminUser.id },
            },
          },
        ],
      },
    ];
  } else if (!hasAdminPermission(req, "tables")) {
    where.fulfillmentType = { not: "DINE_IN" };
  }
  const orders = await prisma.order.findMany({
    where,
    include: orderInclude,
    orderBy: { createdAt: "desc" },
    take: 250,
  });
  res.json(orders.map(serializeOrder));
});
app.get("/api/admin/orders/:id", auth, admin, async (req, res) => {
  const where = {
    id: req.params.id,
    paymentStatus: { in: ["APPROVED", "CASH_PENDING"] },
  };
  if (req.adminUser?.staffRole === "DELIVERY")
    where.OR = [
      {
        status: "READY_FOR_DELIVERY",
        fulfillmentType: "DELIVERY",
        assignedCourierId: null,
      },
      { status: "OUT_FOR_DELIVERY", assignedCourierId: req.adminUser.id },
      {
        status: "DELIVERED",
        OR: [
          { assignedCourierId: req.adminUser.id },
          {
            history: {
              some: { status: "DELIVERED", changedByUserId: req.adminUser.id },
            },
          },
        ],
      },
    ];
  else if (!hasAdminPermission(req, "tables"))
    where.fulfillmentType = { not: "DINE_IN" };
  const order = await prisma.order.findFirst({ where, include: orderInclude });
  if (!order)
    return res.status(404).json({
      message:
        "Pedido não encontrado, já aceito por outro entregador ou não atribuído a você.",
    });
  res.json(serializeOrder(order));
});
app.patch("/api/admin/orders/:id/status", auth, admin, async (req, res) => {
  const status = cleanText(req.body?.status, 30);
  const cancelReason = cleanText(req.body?.cancelReason, 280);
  const allowed = [
    "SCHEDULED",
    "RECEIVED",
    "PREPARING",
    "READY_FOR_DELIVERY",
    "OUT_FOR_DELIVERY",
    "READY_FOR_PICKUP",
    "READY_FOR_TABLE",
    "SERVED",
    "DELIVERED",
    "CANCELED",
  ];
  if (!allowed.includes(status))
    return res.status(400).json({ message: "Status inválido." });
  if (status === "CANCELED" && cancelReason.length < 3)
    return res
      .status(400)
      .json({ message: "Informe o motivo do cancelamento." });
  const current = await prisma.order.findFirst({
    where: {
      id: req.params.id,
      paymentStatus: { in: ["APPROVED", "CASH_PENDING"] },
    },
    select: {
      status: true,
      fulfillmentType: true,
      acceptedAt: true,
      assignedCourierId: true,
      couponCode: true,
    },
  });
  if (!current)
    return res.status(404).json({ message: "Pedido não encontrado." });
  if (current.fulfillmentType === "DINE_IN")
    return res.status(409).json({
      code: "TABLE_ORDER_FLOW_REQUIRED",
      message: "Pedidos presenciais devem ser movimentados pelas telas Cozinha e Mesas.",
    });

  const isDeliveryRole = req.adminUser?.staffRole === "DELIVERY";

  // Idempotência sem vazar uma corrida de outro entregador.
  if (current.status === status) {
    if (isDeliveryRole) {
      const owns = current.assignedCourierId === req.adminUser.id;
      const visibleReady =
        current.status === "READY_FOR_DELIVERY" &&
        current.assignedCourierId == null &&
        current.fulfillmentType === "DELIVERY";
      if (!owns && !visibleReady)
        return res.status(404).json({
          message: "Pedido não encontrado ou atribuído a outro entregador.",
        });
    }
    const same = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: orderInclude,
    });
    return res.json({ ...serializeOrder(same), idempotent: true });
  }

  if (isDeliveryRole) {
    if (current.fulfillmentType !== "DELIVERY")
      return res.status(403).json({
        code: "DELIVERY_ROLE_ONLY",
        message: "Este pedido não é uma entrega.",
      });
    const accepting =
      status === "OUT_FOR_DELIVERY" &&
      current.status === "READY_FOR_DELIVERY" &&
      current.assignedCourierId == null;
    const completing =
      status === "DELIVERED" &&
      current.status === "OUT_FOR_DELIVERY" &&
      current.assignedCourierId === req.adminUser.id;
    if (!accepting && !completing) {
      if (
        status === "OUT_FOR_DELIVERY" &&
        current.status === "READY_FOR_DELIVERY" &&
        current.assignedCourierId &&
        current.assignedCourierId !== req.adminUser.id
      )
        return res.status(409).json({
          code: "DELIVERY_ALREADY_CLAIMED",
          message: "Esta entrega já foi aceita por outro entregador.",
        });
      return res.status(403).json({
        code: "DELIVERY_ROLE_ONLY",
        message:
          "O entregador pode aceitar pedidos em Pronto para entrega e concluir somente as próprias entregas.",
      });
    }
  } else {
    const nextByStatus = {
      SCHEDULED: "RECEIVED",
      RECEIVED: "PREPARING",
      PREPARING:
        current.fulfillmentType === "DINE_IN"
          ? "READY_FOR_TABLE"
          : current.fulfillmentType === "PICKUP"
          ? "READY_FOR_PICKUP"
          : "READY_FOR_DELIVERY",
      READY_FOR_DELIVERY: "OUT_FOR_DELIVERY",
      OUT_FOR_DELIVERY: "DELIVERED",
      READY_FOR_PICKUP: "DELIVERED",
      READY_FOR_TABLE: "SERVED",
    };
    const validForward = nextByStatus[current.status] === status;
    const validCancel =
      status === "CANCELED" &&
      !["DELIVERED", "CANCELED"].includes(current.status);
    if (!validForward && !validCancel)
      return res.status(409).json({
        code: "INVALID_STATUS_TRANSITION",
        message: "O pedido deve avançar uma etapa por vez.",
      });
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${req.params.id}))`;
    const locked = await tx.order.findUnique({
      where: { id: req.params.id },
      select: { status: true, paymentStatus: true },
    });
    if (
      !locked ||
      !["APPROVED", "CASH_PENDING"].includes(locked.paymentStatus) ||
      locked.status !== current.status
    ) {
      const latest = await tx.order.findUnique({
        where: { id: req.params.id },
        include: orderInclude,
      });
      return { order: latest, changed: false };
    }
    if (status === "PREPARING") await applyOrderStock(tx, req.params.id);
    if (status === "CANCELED") await restoreOrderStock(tx, req.params.id);
    const acceptedNow =
      !current.acceptedAt && ["RECEIVED", "PREPARING"].includes(status)
        ? new Date()
        : null;
    const statusData = {
      status,
      ...(acceptedNow ? { acceptedAt: acceptedNow } : {}),
      ...(status === "CANCELED" ? { cancelReason } : {}),
    };
    if (["READY_FOR_DELIVERY", "READY_FOR_PICKUP", "READY_FOR_TABLE"].includes(status))
      statusData.readyAt = new Date();
    if (status === "OUT_FOR_DELIVERY") statusData.outForDeliveryAt = new Date();
    if (status === "DELIVERED") statusData.deliveredAt = new Date();

    let where = { id: req.params.id, status: current.status };
    if (isDeliveryRole && status === "OUT_FOR_DELIVERY") {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('courier'), hashtext(${req.adminUser.id}))`;
      const settings = await tx.businessSettings
        .findUnique({ where: { id: "default" } })
        .catch(() => null);
      const maxActive = Math.max(
        1,
        Number(settings?.courierMaxActiveOrders || 3),
      );
      const active = await tx.order.count({
        where: {
          assignedCourierId: req.adminUser.id,
          status: "OUT_FOR_DELIVERY",
        },
      });
      if (active >= maxActive)
        throw Object.assign(
          new Error(
            `Você já está com ${active} entrega(s) ativa(s). Conclua uma antes de aceitar outra.`,
          ),
          { code: "COURIER_LIMIT" },
        );
      where = {
        id: req.params.id,
        status: "READY_FOR_DELIVERY",
        assignedCourierId: null,
        fulfillmentType: "DELIVERY",
      };
      statusData.assignedCourierId = req.adminUser.id;
    } else if (isDeliveryRole && status === "DELIVERED") {
      where = {
        id: req.params.id,
        status: "OUT_FOR_DELIVERY",
        assignedCourierId: req.adminUser.id,
      };
    }

    const changed = await tx.order.updateMany({ where, data: statusData });
    if (!changed.count) {
      const latest = await tx.order.findUnique({
        where: { id: req.params.id },
        include: orderInclude,
      });
      if (isDeliveryRole && status === "OUT_FOR_DELIVERY")
        throw Object.assign(
          new Error("Esta entrega acabou de ser aceita por outro entregador."),
          { code: "DELIVERY_ALREADY_CLAIMED" },
        );
      return { order: latest, changed: false };
    }
    if (status === "CANCELED" && current.couponCode)
      await tx.coupon.updateMany({
        where: { code: current.couponCode, uses: { gt: 0 } },
        data: { uses: { decrement: 1 } },
      });
    // Fluxo administrativo antigo ainda pode despachar automaticamente; o fluxo normal é o entregador aceitar a fila pronta.
    if (status === "OUT_FOR_DELIVERY" && !isDeliveryRole)
      await autoAssignCourier(tx, req.params.id);
    await tx.orderStatusHistory.create({
      data: {
        orderId: req.params.id,
        status,
        changedByUserId: req.adminUser?.id || null,
        changedByName: req.adminUser?.name || "Equipe",
        changedByRole: isDeliveryRole
          ? "ENTREGADOR"
          : req.adminPermissions == null
            ? "ADMINISTRADOR"
            : "FUNCIONÁRIO",
      },
    });
    const order = await tx.order.findUnique({
      where: { id: req.params.id },
      include: orderInclude,
    });
    return { order, changed: true };
  });
  const serializedResult = {
    ...serializeOrder(result.order),
    idempotent: !result.changed,
  };
  if (result.changed) {
    const labels = {
      SCHEDULED: "Agendado",
      RECEIVED: "Recebido",
      PREPARING: "Em preparação",
      READY_FOR_DELIVERY: "Pronto para entrega",
      OUT_FOR_DELIVERY: "Saiu para entrega",
      READY_FOR_PICKUP: "Pronto para retirada",
      READY_FOR_TABLE: "Pronto para servir",
      SERVED: "Servido na mesa",
      DELIVERED: "Entregue",
      CANCELED: "Cancelado",
    };
    if (serializedResult.fulfillmentType !== "DINE_IN")
      queueWhatsApp(
        serializedResult,
        "STATUS_CHANGED",
        labels[status] || status,
      ).catch(() => {});
  }
  res.json(serializedResult);
});

app.get("/api/admin/customers", auth, admin, async (req, res) => {
  const [settings, users, completedMetrics, latestOrders] = await Promise.all([
    prisma.businessSettings.findUnique({ where: { id: "default" } }),
    prisma.user.findMany({
      where: { isAdmin: false },
      include: { _count: { select: { orders: true } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.order.groupBy({
      by: ["userId"],
      where: { userId: { not: null }, status: "DELIVERED" },
      _count: { _all: true },
      _sum: { total: true },
    }),
    prisma.$queryRaw`
      SELECT DISTINCT ON ("userId") "userId", "createdAt", "total"
      FROM "Order"
      WHERE "userId" IS NOT NULL
      ORDER BY "userId", "createdAt" DESC
    `,
  ]);
  const metricsByUser = new Map(
    completedMetrics.map((row) => [row.userId, row]),
  );
  const latestByUser = new Map(latestOrders.map((row) => [row.userId, row]));
  res.json(
    users.map((u) => {
      const completed = metricsByUser.get(u.id);
      const latest = latestByUser.get(u.id);
      const deliveredCount = Number(completed?._count?._all || 0);
      const spent = Number(completed?._sum?.total || 0);
      const last = latest?.createdAt || null;
      const inactiveDays = last
        ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000)
        : 99999;
      return {
        ...publicUser(u),
        adminNote: u.adminNote || "",
        customerBlocked: Boolean(u.customerBlocked),
        ordersCount: u._count.orders,
        completedOrders: deliveredCount,
        lifetimeSpent: roundMoney(spent),
        vip:
          deliveredCount >= Number(settings?.vipMinOrders || 8) ||
          spent >= Number(settings?.vipMinSpend || 400),
        inactive: inactiveDays >= Number(settings?.inactiveCustomerDays || 60),
        inactiveDays,
        lastOrderAt: last,
        lastOrderTotal: latest ? Number(latest.total) : null,
      };
    }),
  );
});

app.delete("/api/admin/customers/:id", auth, admin, async (req, res) => {
  const customer = await prisma.user.findFirst({
    where: { id: req.params.id, isAdmin: false },
  });
  if (!customer)
    return res.status(404).json({ message: "Cliente não encontrado." });
  const openCount = await prisma.order.count({
    where: {
      userId: customer.id,
      status: { notIn: ["DELIVERED", "CANCELED"] },
    },
  });
  if (openCount > 0)
    return res.status(409).json({
      code: "CUSTOMER_HAS_OPEN_ORDERS",
      message:
        "Este cliente ainda possui pedido em aberto. Só é possível excluir a conta quando todos os pedidos estiverem entregues ou cancelados.",
    });
  await prisma.user.delete({ where: { id: customer.id } });
  res.status(204).end();
});

app.get("/api/admin/categories", auth, admin, async (req, res) => {
  const rows = await prisma.category.findMany({
    include: { _count: { select: { products: true, subcategories: true } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  res.json(
    rows.map((c) => ({
      ...c,
      productsCount: c._count.products,
      subcategoriesCount: c._count.subcategories,
    })),
  );
});
app.post("/api/admin/categories", auth, admin, async (req, res) => {
  const name = cleanText(req.body?.name, 80);
  const slug = cleanText(req.body?.slug, 80).toLowerCase();
  const sortOrder = boundedInteger(req.body?.sortOrder ?? 0);
  if (!name || !validSlug(slug) || sortOrder == null)
    return res
      .status(400)
      .json({ message: "Informe nome, slug e ordem válidos da categoria." });
  const row = await prisma.category.create({
    data: {
      name,
      slug,
      sortOrder,
      active:
        req.body?.active === undefined ? true : booleanValue(req.body.active),
    },
  });
  res.status(201).json({ ...row, productsCount: 0, subcategoriesCount: 0 });
});
app.patch("/api/admin/categories/:id", auth, admin, async (req, res) => {
  const data = {};
  if (req.body?.name !== undefined) {
    data.name = cleanText(req.body.name, 80);
    if (!data.name)
      return res.status(400).json({ message: "Nome da categoria inválido." });
  }
  if (req.body?.slug !== undefined) {
    data.slug = cleanText(req.body.slug, 80).toLowerCase();
    if (!validSlug(data.slug))
      return res.status(400).json({ message: "Slug da categoria inválido." });
  }
  if (req.body?.sortOrder !== undefined) {
    const sortOrder = boundedInteger(req.body.sortOrder);
    if (sortOrder == null)
      return res.status(400).json({ message: "Ordem da categoria inválida." });
    data.sortOrder = sortOrder;
  }
  if (req.body?.active !== undefined)
    data.active = booleanValue(req.body.active);
  res.json(
    await prisma.category.update({ where: { id: req.params.id }, data }),
  );
});
app.delete("/api/admin/categories/:id", auth, admin, async (req, res) => {
  const count = await prisma.product.count({
    where: { categoryId: req.params.id },
  });
  if (count > 0) {
    const category = await prisma.category.update({
      where: { id: req.params.id },
      data: { active: false },
    });
    return res.json({
      ok: true,
      archived: true,
      category,
      message: "Categoria ocultada porque possui produtos vinculados.",
    });
  }
  await prisma.category.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

app.get("/api/admin/subcategories", auth, admin, async (req, res) => {
  const rows = await prisma.subcategory.findMany({
    include: { category: true, _count: { select: { products: true } } },
    orderBy: [
      { category: { sortOrder: "asc" } },
      { sortOrder: "asc" },
      { name: "asc" },
    ],
  });
  res.json(rows.map((r) => ({ ...r, productsCount: r._count.products })));
});
app.post("/api/admin/subcategories", auth, admin, async (req, res) => {
  const name = cleanText(req.body?.name, 80);
  const slug = cleanText(req.body?.slug, 80).toLowerCase();
  const categoryId = cleanText(req.body?.categoryId, 80);
  const sortOrder = boundedInteger(req.body?.sortOrder ?? 0);
  if (!name || !validSlug(slug) || !categoryId || sortOrder == null)
    return res
      .status(400)
      .json({ message: "Informe categoria, nome, slug e ordem válidos." });
  const categoryExists = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { id: true },
  });
  if (!categoryExists)
    return res.status(400).json({ message: "Categoria não encontrada." });
  const row = await prisma.subcategory.create({
    data: {
      name,
      slug,
      categoryId,
      sortOrder,
      active:
        req.body?.active === undefined ? true : booleanValue(req.body.active),
    },
    include: { category: true },
  });
  res.status(201).json({ ...row, productsCount: 0 });
});
app.patch("/api/admin/subcategories/:id", auth, admin, async (req, res) => {
  const data = {};
  if (req.body?.name !== undefined) {
    data.name = cleanText(req.body.name, 80);
    if (!data.name)
      return res
        .status(400)
        .json({ message: "Nome da subcategoria inválido." });
  }
  if (req.body?.slug !== undefined) {
    data.slug = cleanText(req.body.slug, 80).toLowerCase();
    if (!validSlug(data.slug))
      return res
        .status(400)
        .json({ message: "Slug da subcategoria inválido." });
  }
  if (req.body?.categoryId !== undefined) {
    data.categoryId = cleanText(req.body.categoryId, 80);
    const categoryExists = data.categoryId
      ? await prisma.category.findUnique({
          where: { id: data.categoryId },
          select: { id: true },
        })
      : null;
    if (!categoryExists)
      return res.status(400).json({ message: "Categoria não encontrada." });
  }
  if (req.body?.sortOrder !== undefined) {
    const sortOrder = boundedInteger(req.body.sortOrder);
    if (sortOrder == null)
      return res
        .status(400)
        .json({ message: "Ordem da subcategoria inválida." });
    data.sortOrder = sortOrder;
  }
  if (req.body?.active !== undefined)
    data.active = booleanValue(req.body.active);
  res.json(
    await prisma.subcategory.update({
      where: { id: req.params.id },
      data,
      include: { category: true },
    }),
  );
});
app.delete("/api/admin/subcategories/:id", auth, admin, async (req, res) => {
  const count = await prisma.product.count({
    where: { subcategoryId: req.params.id },
  });
  if (count > 0) {
    const row = await prisma.subcategory.update({
      where: { id: req.params.id },
      data: { active: false },
    });
    return res.json({ ok: true, archived: true, subcategory: row });
  }
  await prisma.subcategory.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

app.get("/api/admin/flavors", auth, admin, async (req, res) => {
  const rows = await prisma.flavor.findMany({
    include: { _count: { select: { products: true } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  res.json(
    rows.map((f) => ({
      ...serializeFlavor(f),
      productsCount: f._count.products,
    })),
  );
});
app.post("/api/admin/flavors", auth, admin, async (req, res) => {
  const name = cleanText(req.body?.name, 100);
  const price = Number(req.body?.price);
  const image = safeMediaUrl(req.body?.image) || null;
  const promoPrice =
    req.body?.promoPrice === "" || req.body?.promoPrice == null
      ? null
      : Number(req.body.promoPrice);
  const promoStartAt = optionalDate(req.body?.promoStartAt);
  const promoEndAt = optionalDate(req.body?.promoEndAt);
  const sortOrder = boundedInteger(req.body?.sortOrder ?? 0);
  if (
    !name ||
    (req.body?.image && !image) ||
    !Number.isFinite(price) ||
    price < 0 ||
    (promoPrice != null &&
      (!Number.isFinite(promoPrice) ||
        promoPrice < 0 ||
        promoPrice >= price)) ||
    promoStartAt === undefined ||
    promoEndAt === undefined ||
    sortOrder == null ||
    (promoStartAt && promoEndAt && promoEndAt <= promoStartAt)
  )
    return res
      .status(400)
      .json({ message: "Informe nome, preço e promoção válidos do sabor." });
  const row = await prisma.flavor.create({
    data: {
      name,
      price,
      promoPrice,
      promoActive: booleanValue(req.body?.promoActive) && promoPrice != null,
      promoStartAt,
      promoEndAt,
      image,
      active:
        req.body?.active === undefined ? true : booleanValue(req.body.active),
      sortOrder,
    },
  });
  res.status(201).json(serializeFlavor(row));
});
app.patch("/api/admin/flavors/:id", auth, admin, async (req, res) => {
  const data = {};
  if (req.body?.name !== undefined) data.name = cleanText(req.body.name, 100);
  if (req.body?.image !== undefined)
    data.image = safeMediaUrl(req.body.image) || null;
  if (req.body?.image && !data.image)
    return res.status(400).json({ message: "URL de imagem inválida." });
  if (req.body?.price !== undefined) {
    const v = Number(req.body.price);
    if (!Number.isFinite(v) || v < 0)
      return res.status(400).json({ message: "Preço inválido." });
    data.price = v;
  }
  if (req.body?.promoPrice !== undefined) {
    if (req.body.promoPrice === "" || req.body.promoPrice == null)
      data.promoPrice = null;
    else {
      const v = Number(req.body.promoPrice);
      if (!Number.isFinite(v) || v < 0)
        return res.status(400).json({ message: "Preço promocional inválido." });
      data.promoPrice = v;
    }
  }
  if (req.body?.promoActive !== undefined)
    data.promoActive = booleanValue(req.body.promoActive);
  for (const f of ["promoStartAt", "promoEndAt"])
    if (req.body?.[f] !== undefined) {
      const value = optionalDate(req.body[f]);
      if (value === undefined)
        return res
          .status(400)
          .json({ message: "Período promocional inválido." });
      data[f] = value;
    }
  if (req.body?.active !== undefined)
    data.active = booleanValue(req.body.active);
  if (req.body?.sortOrder !== undefined) {
    const sortOrder = boundedInteger(req.body.sortOrder);
    if (sortOrder == null)
      return res.status(400).json({ message: "Ordem do sabor inválida." });
    data.sortOrder = sortOrder;
  }
  const current = await prisma.flavor.findUnique({
    where: { id: req.params.id },
  });
  if (!current)
    return res.status(404).json({ message: "Sabor não encontrado." });
  const finalBase = Number(data.price ?? current?.price ?? 0),
    finalPromo =
      data.promoPrice === null
        ? null
        : Number(data.promoPrice ?? current?.promoPrice);
  const finalStart = Object.hasOwn(data, "promoStartAt")
    ? data.promoStartAt
    : current.promoStartAt;
  const finalEnd = Object.hasOwn(data, "promoEndAt")
    ? data.promoEndAt
    : current.promoEndAt;
  if (finalStart && finalEnd && finalEnd <= finalStart)
    return res
      .status(400)
      .json({ message: "O fim da promoção deve ser posterior ao início." });
  if (
    data.promoActive !== false &&
    finalPromo != null &&
    finalPromo >= finalBase
  )
    return res.status(400).json({
      message: "A promoção do sabor precisa ser menor que o preço base.",
    });
  res.json(
    serializeFlavor(
      await prisma.flavor.update({ where: { id: req.params.id }, data }),
    ),
  );
});
app.delete("/api/admin/flavors/:id", auth, admin, async (req, res) => {
  const used = await prisma.productFlavor.count({
    where: { flavorId: req.params.id },
  });
  if (used > 0) {
    const row = await prisma.flavor.update({
      where: { id: req.params.id },
      data: { active: false },
    });
    return res.json({
      ok: true,
      archived: true,
      flavor: serializeFlavor(row),
      message: "Sabor pausado porque está vinculado a produtos.",
    });
  }
  await prisma.flavor.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

app.get("/api/admin/modifier-groups", auth, admin, async (req, res) => {
  const rows = await prisma.modifierGroup.findMany({
    include: {
      options: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
      _count: { select: { products: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  res.json(
    rows.map((row) => ({
      ...serializeModifierGroup(row),
      productsCount: row._count.products,
    })),
  );
});
app.post("/api/admin/modifier-groups", auth, admin, async (req, res) => {
  const name = cleanText(req.body?.name, 100),
    description = cleanText(req.body?.description, 220) || null;
  const required = booleanValue(req.body?.required);
  const minSelect = Number(req.body?.minSelect ?? 0);
  const maxSelect = Number(req.body?.maxSelect ?? 1);
  const sortOrder = boundedInteger(req.body?.sortOrder ?? 0);
  const effectiveMin = required ? Math.max(1, minSelect) : minSelect;
  if (
    !name ||
    !Number.isInteger(minSelect) ||
    !Number.isInteger(maxSelect) ||
    minSelect < 0 ||
    maxSelect < 1 ||
    maxSelect > 50 ||
    sortOrder == null ||
    maxSelect < effectiveMin
  )
    return res
      .status(400)
      .json({ message: "Informe um nome e limites de seleção válidos." });
  const row = await prisma.modifierGroup.create({
    data: {
      name,
      description,
      required,
      minSelect: effectiveMin,
      maxSelect,
      active:
        req.body?.active === undefined ? true : booleanValue(req.body.active),
      sortOrder,
    },
    include: { options: true },
  });
  res.status(201).json(serializeModifierGroup(row));
});
app.patch("/api/admin/modifier-groups/:id", auth, admin, async (req, res) => {
  const current = await prisma.modifierGroup.findUnique({
    where: { id: req.params.id },
  });
  if (!current)
    return res
      .status(404)
      .json({ message: "Grupo de adicionais não encontrado." });
  const data = {};
  for (const f of ["name", "description"])
    if (req.body?.[f] !== undefined)
      data[f] = cleanText(req.body[f], f === "description" ? 220 : 100) || null;
  if (Object.hasOwn(data, "name") && !data.name)
    return res.status(400).json({ message: "Nome do grupo inválido." });
  if (req.body?.required !== undefined)
    data.required = booleanValue(req.body.required);
  for (const f of ["minSelect", "maxSelect", "sortOrder"])
    if (req.body?.[f] !== undefined) {
      const value = Number(req.body[f]);
      if (
        !Number.isInteger(value) ||
        value < 0 ||
        (f === "maxSelect" && value < 1)
      )
        return res.status(400).json({ message: "Limite de seleção inválido." });
      data[f] = value;
    }
  if (req.body?.active !== undefined)
    data.active = booleanValue(req.body.active);
  const finalRequired = data.required ?? current.required;
  const finalMin = finalRequired
    ? Math.max(1, data.minSelect ?? current.minSelect)
    : (data.minSelect ?? current.minSelect);
  const finalMax = data.maxSelect ?? current.maxSelect;
  if (finalMax > 50 || finalMax < finalMin)
    return res
      .status(400)
      .json({ message: "O máximo deve ser igual ou maior que o mínimo." });
  if (finalRequired) data.minSelect = finalMin;
  const row = await prisma.modifierGroup.update({
    where: { id: req.params.id },
    data,
    include: { options: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
  });
  res.json(serializeModifierGroup(row));
});
app.delete("/api/admin/modifier-groups/:id", auth, admin, async (req, res) => {
  const used = await prisma.productModifierGroup.count({
    where: { groupId: req.params.id },
  });
  if (used) {
    const row = await prisma.modifierGroup.update({
      where: { id: req.params.id },
      data: { active: false },
      include: { options: true },
    });
    return res.json({
      ok: true,
      archived: true,
      group: serializeModifierGroup(row),
    });
  }
  await prisma.modifierGroup.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
app.post(
  "/api/admin/modifier-groups/:id/options",
  auth,
  admin,
  async (req, res) => {
    const name = cleanText(req.body?.name, 100),
      description = cleanText(req.body?.description, 220) || null,
      image = safeMediaUrl(req.body?.image) || null,
      price = Number(req.body?.price || 0),
      promoPrice =
        req.body?.promoPrice === "" || req.body?.promoPrice == null
          ? null
          : Number(req.body.promoPrice);
    const promoStartAt = optionalDate(req.body?.promoStartAt);
    const promoEndAt = optionalDate(req.body?.promoEndAt);
    const sortOrder = boundedInteger(req.body?.sortOrder ?? 0);
    if (
      !name ||
      (req.body?.image && !image) ||
      !Number.isFinite(price) ||
      price < 0 ||
      (promoPrice != null &&
        (!Number.isFinite(promoPrice) ||
          promoPrice < 0 ||
          promoPrice >= price)) ||
      promoStartAt === undefined ||
      promoEndAt === undefined ||
      sortOrder == null ||
      (promoStartAt && promoEndAt && promoEndAt <= promoStartAt)
    )
      return res
        .status(400)
        .json({ message: "Informe nome, preço e promoção válidos." });
    const groupExists = await prisma.modifierGroup.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!groupExists)
      return res
        .status(404)
        .json({ message: "Grupo de adicionais não encontrado." });
    const option = await prisma.modifierOption.create({
      data: {
        groupId: req.params.id,
        name,
        description,
        image,
        price,
        promoPrice,
        promoActive: booleanValue(req.body?.promoActive) && promoPrice != null,
        promoStartAt,
        promoEndAt,
        active:
          req.body?.active === undefined ? true : booleanValue(req.body.active),
        sortOrder,
      },
    });
    res.status(201).json(serializeModifierOption(option));
  },
);
app.patch("/api/admin/modifier-options/:id", auth, admin, async (req, res) => {
  const data = {};
  for (const f of ["name", "description"])
    if (req.body?.[f] !== undefined)
      data[f] = cleanText(req.body[f], f === "description" ? 220 : 100) || null;
  if (Object.hasOwn(data, "name") && !data.name)
    return res.status(400).json({ message: "Nome do adicional inválido." });
  if (req.body?.image !== undefined)
    data.image = safeMediaUrl(req.body.image) || null;
  if (req.body?.price !== undefined) {
    const v = Number(req.body.price);
    if (!Number.isFinite(v) || v < 0)
      return res.status(400).json({ message: "Preço inválido." });
    data.price = v;
  }
  if (req.body?.promoPrice !== undefined) {
    if (req.body.promoPrice === "" || req.body.promoPrice == null)
      data.promoPrice = null;
    else {
      const v = Number(req.body.promoPrice);
      if (!Number.isFinite(v) || v < 0)
        return res.status(400).json({ message: "Preço promocional inválido." });
      data.promoPrice = v;
    }
  }
  if (req.body?.promoActive !== undefined)
    data.promoActive = booleanValue(req.body.promoActive);
  for (const f of ["promoStartAt", "promoEndAt"])
    if (req.body?.[f] !== undefined) {
      const value = optionalDate(req.body[f]);
      if (value === undefined)
        return res
          .status(400)
          .json({ message: "Período promocional inválido." });
      data[f] = value;
    }
  if (req.body?.active !== undefined)
    data.active = booleanValue(req.body.active);
  if (req.body?.sortOrder !== undefined) {
    const sortOrder = boundedInteger(req.body.sortOrder);
    if (sortOrder == null)
      return res.status(400).json({ message: "Ordem do adicional inválida." });
    data.sortOrder = sortOrder;
  }
  const current = await prisma.modifierOption.findUnique({
    where: { id: req.params.id },
  });
  if (!current)
    return res.status(404).json({ message: "Adicional não encontrado." });
  const finalBase = Number(data.price ?? current?.price ?? 0),
    finalPromo =
      data.promoPrice === null
        ? null
        : Number(data.promoPrice ?? current?.promoPrice);
  const finalStart = Object.hasOwn(data, "promoStartAt")
    ? data.promoStartAt
    : current.promoStartAt;
  const finalEnd = Object.hasOwn(data, "promoEndAt")
    ? data.promoEndAt
    : current.promoEndAt;
  if (finalStart && finalEnd && finalEnd <= finalStart)
    return res
      .status(400)
      .json({ message: "O fim da promoção deve ser posterior ao início." });
  if (
    data.promoActive !== false &&
    finalPromo != null &&
    finalPromo >= finalBase
  )
    return res.status(400).json({
      message: "A promoção do adicional precisa ser menor que o preço base.",
    });
  res.json(
    serializeModifierOption(
      await prisma.modifierOption.update({
        where: { id: req.params.id },
        data,
      }),
    ),
  );
});
app.delete("/api/admin/modifier-options/:id", auth, admin, async (req, res) => {
  const used = await prisma.orderItemOption.count({
    where: { optionId: req.params.id },
  });
  if (used) {
    const option = await prisma.modifierOption.update({
      where: { id: req.params.id },
      data: { active: false },
    });
    return res.json({
      ok: true,
      archived: true,
      option: serializeModifierOption(option),
    });
  }
  await prisma.modifierOption.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

app.get("/api/admin/sizes", auth, admin, async (req, res) => {
  const rows = await prisma.pizzaSize.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  res.json(rows);
});
app.post("/api/admin/sizes", auth, admin, async (req, res) => {
  const name = cleanText(req.body?.name, 60),
    slug = cleanText(req.body?.slug, 60).toLowerCase(),
    diameterCm =
      req.body?.diameterCm == null || req.body?.diameterCm === ""
        ? null
        : boundedInteger(req.body.diameterCm, 1, 200),
    sortOrder = boundedInteger(req.body?.sortOrder ?? 0);
  if (
    !name ||
    !validSlug(slug) ||
    (req.body?.diameterCm !== "" &&
      req.body?.diameterCm != null &&
      diameterCm == null) ||
    sortOrder == null
  )
    return res
      .status(400)
      .json({ message: "Informe nome, slug e diâmetro válidos." });
  res.status(201).json(
    await prisma.pizzaSize.create({
      data: {
        name,
        slug,
        diameterCm,
        sortOrder,
        active:
          req.body?.active === undefined ? true : booleanValue(req.body.active),
      },
    }),
  );
});
app.patch("/api/admin/sizes/:id", auth, admin, async (req, res) => {
  const data = {};
  if (req.body?.name !== undefined) {
    data.name = cleanText(req.body.name, 60);
    if (!data.name)
      return res.status(400).json({ message: "Nome do tamanho inválido." });
  }
  if (req.body?.slug !== undefined) {
    data.slug = cleanText(req.body.slug, 60).toLowerCase();
    if (!validSlug(data.slug))
      return res.status(400).json({ message: "Slug do tamanho inválido." });
  }
  if (req.body?.diameterCm !== undefined) {
    data.diameterCm =
      req.body.diameterCm === "" || req.body.diameterCm == null
        ? null
        : boundedInteger(req.body.diameterCm, 1, 200);
    if (
      req.body.diameterCm !== "" &&
      req.body.diameterCm != null &&
      data.diameterCm == null
    )
      return res.status(400).json({ message: "Diâmetro inválido." });
  }
  if (req.body?.sortOrder !== undefined) {
    const sortOrder = boundedInteger(req.body.sortOrder);
    if (sortOrder == null)
      return res.status(400).json({ message: "Ordem do tamanho inválida." });
    data.sortOrder = sortOrder;
  }
  if (req.body?.active !== undefined)
    data.active = booleanValue(req.body.active);
  res.json(
    await prisma.pizzaSize.update({ where: { id: req.params.id }, data }),
  );
});
app.delete("/api/admin/sizes/:id", auth, admin, async (req, res) => {
  const used = await prisma.productSize.count({
    where: { sizeId: req.params.id },
  });
  if (used) {
    const row = await prisma.pizzaSize.update({
      where: { id: req.params.id },
      data: { active: false },
    });
    return res.json({ ok: true, archived: true, size: row });
  }
  await prisma.pizzaSize.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
app.post("/api/admin/sizes/reorder", auth, admin, async (req, res) => {
  const orderedIds = Array.isArray(req.body?.orderedIds)
    ? [
        ...new Set(
          req.body.orderedIds.map((id) => cleanText(id, 80)).filter(Boolean),
        ),
      ]
    : [];
  if (!orderedIds.length)
    return res.status(400).json({ message: "Informe a ordem dos tamanhos." });
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.pizzaSize.update({
        where: { id },
        data: { sortOrder: index + 1 },
      }),
    ),
  );
  res.json({ ok: true });
});

app.get("/api/admin/products", auth, admin, async (req, res) => {
  const includeArchived = req.query.archived === "1";
  const rows = await prisma.product.findMany({
    where: includeArchived ? {} : { deletedAt: null },
    include: productInclude,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
  const flavorProducts = rows.filter(
    (row) => row.isFlavorOption && row.available && !row.deletedAt,
  );
  res.json(
    rows.map((row) =>
      attachProductFlavorOptions(serializeProduct(row), flavorProducts),
    ),
  );
});
app.post(
  "/api/admin/media",
  auth,
  admin,
  upload.single("image"),
  async (req, res) => {
    if (!req.file)
      return res.status(400).json({ message: "Selecione uma imagem." });
    const detectedMime = detectImageMime(req.file.buffer);
    if (!detectedMime || detectedMime !== req.file.mimetype)
      return res.status(400).json({
        message:
          "O conteúdo do arquivo não corresponde a uma imagem JPG, PNG ou WebP válida.",
      });
    const asset = await prisma.mediaAsset.create({
      data: {
        filename: cleanText(req.file.originalname, 180) || "produto",
        mimeType: detectedMime,
        size: req.file.size,
        data: req.file.buffer,
        uploadedById: req.user.id,
      },
    });
    res.status(201).json({ id: asset.id, url: `/api/media/${asset.id}` });
  },
);
app.post("/api/admin/products/reorder", auth, admin, async (req, res) => {
  const orderedIds = Array.isArray(req.body?.orderedIds)
    ? [
        ...new Set(
          req.body.orderedIds.map((id) => cleanText(id, 80)).filter(Boolean),
        ),
      ]
    : [];
  if (!orderedIds.length)
    return res.status(400).json({ message: "Informe a ordem dos produtos." });
  const existing = await prisma.product.count({
    where: { id: { in: orderedIds }, deletedAt: null },
  });
  if (existing !== orderedIds.length)
    return res.status(400).json({
      message: "A lista de prioridade contém produto inválido ou arquivado.",
    });
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.product.update({ where: { id }, data: { sortOrder: index + 1 } }),
    ),
  );
  res.json({ ok: true, orderedIds });
});
async function syncProductFlavors(tx, productId, flavorIds) {
  await tx.productFlavor.deleteMany({ where: { productId } });
  const unique = [
    ...new Set(
      (flavorIds || []).map((id) => cleanText(id, 80)).filter(Boolean),
    ),
  ];
  if (unique.length)
    await tx.productFlavor.createMany({
      data: unique.map((flavorId, index) => ({
        productId,
        flavorId,
        sortOrder: index,
      })),
    });
}
async function syncProductModifierGroups(
  tx,
  productId,
  groupIds,
  categoryId = null,
) {
  await tx.productModifierGroup.deleteMany({ where: { productId } });
  const unique = [
    ...new Set((groupIds || []).map((id) => cleanText(id, 80)).filter(Boolean)),
  ];
  if (categoryId) {
    const category = await tx.category.findUnique({
      where: { id: categoryId },
      select: { slug: true },
    });
    if (category?.slug === "pizzas") {
      const crust = await tx.modifierGroup.findUnique({
        where: { name: "Borda da pizza" },
        select: { id: true, active: true },
      });
      if (crust?.active && !unique.includes(crust.id)) unique.unshift(crust.id);
    }
  }
  if (unique.length)
    await tx.productModifierGroup.createMany({
      data: unique.map((groupId, index) => ({
        productId,
        groupId,
        sortOrder: index,
      })),
    });
}
async function syncProductSizes(tx, productId, sizes) {
  await tx.productSize.deleteMany({ where: { productId } });
  const cleaned = (Array.isArray(sizes) ? sizes : [])
    .map((row, index) => ({
      sizeId: cleanText(row?.sizeId, 80),
      price: Number(row?.price),
      sortOrder: Number(row?.sortOrder ?? index),
    }))
    .filter(
      (row) => row.sizeId && Number.isFinite(row.price) && row.price >= 0,
    );
  if (cleaned.length)
    await tx.productSize.createMany({
      data: cleaned.map((row) => ({ ...row, productId })),
    });
}
async function validateProductConfiguration(
  tx,
  { categoryId, subcategoryId, flavorIds, modifierGroupIds, sizePrices },
) {
  const category = await tx.category.findUnique({ where: { id: categoryId } });
  if (!category)
    throw Object.assign(new Error("A categoria selecionada não existe."), {
      code: "INVALID_CATALOG_CONFIGURATION",
    });
  if (subcategoryId) {
    const subcategory = await tx.subcategory.findFirst({
      where: { id: subcategoryId, categoryId },
    });
    if (!subcategory)
      throw Object.assign(
        new Error("A subcategoria não pertence à categoria selecionada."),
        { code: "INVALID_CATALOG_CONFIGURATION" },
      );
  }

  const relationChecks = [
    [
      flavorIds,
      (ids) => tx.flavor.count({ where: { id: { in: ids } } }),
      "A lista de sabores contém um item inválido.",
    ],
    [
      modifierGroupIds,
      (ids) => tx.modifierGroup.count({ where: { id: { in: ids } } }),
      "A lista de adicionais contém um grupo inválido.",
    ],
  ];
  for (const [rawIds, countRows, message] of relationChecks) {
    if (!Array.isArray(rawIds)) continue;
    const ids = [
      ...new Set(rawIds.map((id) => cleanText(id, 80)).filter(Boolean)),
    ];
    if ((await countRows(ids)) !== ids.length)
      throw Object.assign(new Error(message), {
        code: "INVALID_CATALOG_CONFIGURATION",
      });
  }

  if (Array.isArray(sizePrices)) {
    const cleaned = sizePrices.map((row) => ({
      sizeId: cleanText(row?.sizeId, 80),
      price: Number(row?.price),
    }));
    const sizeIds = [
      ...new Set(cleaned.map((row) => row.sizeId).filter(Boolean)),
    ];
    const invalid = cleaned.some(
      (row) => !row.sizeId || !Number.isFinite(row.price) || row.price < 0,
    );
    const existing = await tx.pizzaSize.count({
      where: { id: { in: sizeIds } },
    });
    if (
      invalid ||
      sizeIds.length !== cleaned.length ||
      existing !== sizeIds.length
    )
      throw Object.assign(
        new Error("Os tamanhos ou preços informados são inválidos."),
        {
          code: "INVALID_CATALOG_CONFIGURATION",
        },
      );
  }
}
app.post("/api/admin/products", auth, admin, async (req, res) => {
  const name = cleanText(req.body?.name, 100),
    slug = cleanText(req.body?.slug, 100).toLowerCase(),
    description = cleanText(req.body?.description, 350),
    categoryId = cleanText(req.body?.categoryId, 80),
    subcategoryId = cleanText(req.body?.subcategoryId, 80) || null,
    image = safeMediaUrl(req.body?.image) || null,
    badge = cleanText(req.body?.badge, 40) || null;
  const price = Number(req.body?.price);
  const maxFlavors = Number(req.body?.maxFlavors ?? 1);
  const sortOrder = boundedInteger(req.body?.sortOrder ?? 0);
  const flavorPricingMode = ["MAX", "SUM"].includes(req.body?.flavorPricingMode)
    ? req.body.flavorPricingMode
    : "MAX";
  const flavorIds = Array.isArray(req.body?.flavorIds)
    ? req.body.flavorIds
    : [];
  const modifierGroupIds = Array.isArray(req.body?.modifierGroupIds)
    ? req.body.modifierGroupIds
    : [];
  const sizePrices = Array.isArray(req.body?.sizePrices)
    ? req.body.sizePrices
    : [];
  const stockTracked = booleanValue(req.body?.stockTracked);
  const stockQuantity = Number(req.body?.stockQuantity ?? 0);
  const stockLowThreshold = Number(req.body?.stockLowThreshold ?? 0);
  const costPrice = Number(req.body?.costPrice ?? 0);
  const pausedUntil = req.body?.pausedUntil
    ? new Date(req.body.pausedUntil)
    : null;
  const availableStartTime = cleanText(req.body?.availableStartTime, 5) || null;
  const availableEndTime = cleanText(req.body?.availableEndTime, 5) || null;
  const removableIngredients = Array.isArray(req.body?.removableIngredients)
    ? req.body.removableIngredients
        .map((value) => cleanText(value, 80))
        .filter(Boolean)
        .slice(0, 30)
    : [];
  if (
    !name ||
    !slug ||
    !validSlug(slug) ||
    !description ||
    !categoryId ||
    !Number.isFinite(price) ||
    price < 0 ||
    !Number.isInteger(maxFlavors) ||
    maxFlavors < 1 ||
    maxFlavors > 4 ||
    sortOrder == null ||
    !Number.isInteger(stockQuantity) ||
    stockQuantity < 0 ||
    !Number.isInteger(stockLowThreshold) ||
    stockLowThreshold < 0 ||
    !Number.isFinite(costPrice) ||
    costPrice < 0 ||
    (pausedUntil && Number.isNaN(pausedUntil.getTime())) ||
    (availableStartTime && parseClock(availableStartTime) == null) ||
    (availableEndTime && parseClock(availableEndTime) == null) ||
    (req.body?.image && !image)
  )
    return res
      .status(400)
      .json({ message: "Preencha corretamente os dados do produto." });
  const product = await prisma.$transaction(async (tx) => {
    await validateProductConfiguration(tx, {
      categoryId,
      subcategoryId,
      flavorIds,
      modifierGroupIds,
      sizePrices,
    });
    const p = await tx.product.create({
      data: {
        name,
        slug,
        description,
        categoryId,
        subcategoryId,
        image,
        badge,
        price,
        featured: booleanValue(req.body?.featured),
        available:
          req.body?.available === undefined
            ? true
            : booleanValue(req.body.available),
        sortOrder,
        allowFlavorSplit: booleanValue(req.body?.allowFlavorSplit),
        isFlavorOption: booleanValue(req.body?.isFlavorOption),
        maxFlavors,
        flavorPricingMode,
        stockTracked,
        stockQuantity,
        stockLowThreshold,
        costPrice,
        pausedUntil,
        availableStartTime,
        availableEndTime,
        removableIngredients,
      },
    });
    await syncProductFlavors(tx, p.id, flavorIds);
    await syncProductModifierGroups(tx, p.id, modifierGroupIds, categoryId);
    await syncProductSizes(tx, p.id, sizePrices);
    return tx.product.findUnique({
      where: { id: p.id },
      include: productInclude,
    });
  });
  res.status(201).json(serializeProduct(product));
});
app.patch("/api/admin/products/:id", auth, admin, async (req, res) => {
  const data = {};
  for (const f of ["name", "description", "categoryId"]) {
    if (req.body?.[f] !== undefined)
      data[f] = cleanText(req.body[f], f === "description" ? 350 : 100);
  }
  if (req.body?.slug !== undefined)
    data.slug = cleanText(req.body.slug, 100).toLowerCase();
  if (req.body?.subcategoryId !== undefined)
    data.subcategoryId = cleanText(req.body.subcategoryId, 80) || null;
  if (req.body?.image !== undefined)
    data.image = safeMediaUrl(req.body.image) || null;
  if (req.body?.badge !== undefined)
    data.badge = cleanText(req.body.badge, 40) || null;
  if (req.body?.price !== undefined) {
    const v = Number(req.body.price);
    if (!Number.isFinite(v) || v < 0)
      return res.status(400).json({ message: "Preço inválido." });
    data.price = v;
  }
  if (req.body?.available !== undefined)
    data.available = booleanValue(req.body.available);
  if (req.body?.featured !== undefined)
    data.featured = booleanValue(req.body.featured);
  if (req.body?.sortOrder !== undefined) {
    const sortOrder = boundedInteger(req.body.sortOrder);
    if (sortOrder == null)
      return res.status(400).json({ message: "Ordem do produto inválida." });
    data.sortOrder = sortOrder;
  }
  if (req.body?.allowFlavorSplit !== undefined)
    data.allowFlavorSplit = booleanValue(req.body.allowFlavorSplit);
  if (req.body?.isFlavorOption !== undefined)
    data.isFlavorOption = booleanValue(req.body.isFlavorOption);
  if (req.body?.maxFlavors !== undefined) {
    const maxFlavors = Number(req.body.maxFlavors);
    if (!Number.isInteger(maxFlavors) || maxFlavors < 1 || maxFlavors > 4)
      return res
        .status(400)
        .json({ message: "O número de sabores deve ficar entre 1 e 4." });
    data.maxFlavors = maxFlavors;
  }
  if (req.body?.flavorPricingMode !== undefined) {
    if (!["MAX", "SUM"].includes(req.body.flavorPricingMode))
      return res
        .status(400)
        .json({ message: "Regra de preço dos sabores inválida." });
    data.flavorPricingMode = req.body.flavorPricingMode;
  }
  if (req.body?.stockTracked !== undefined)
    data.stockTracked = booleanValue(req.body.stockTracked);
  if (req.body?.stockQuantity !== undefined) {
    const v = Number(req.body.stockQuantity);
    if (!Number.isInteger(v) || v < 0)
      return res.status(400).json({ message: "Estoque simples inválido." });
    data.stockQuantity = v;
  }
  if (req.body?.stockLowThreshold !== undefined) {
    const v = Number(req.body.stockLowThreshold);
    if (!Number.isInteger(v) || v < 0)
      return res.status(400).json({ message: "Alerta de estoque inválido." });
    data.stockLowThreshold = v;
  }
  if (req.body?.costPrice !== undefined) {
    const value = Number(req.body.costPrice);
    if (!Number.isFinite(value) || value < 0)
      return res.status(400).json({ message: "Custo inválido." });
    data.costPrice = value;
  }
  if (req.body?.pausedUntil !== undefined) {
    const value = req.body.pausedUntil ? new Date(req.body.pausedUntil) : null;
    if (value && Number.isNaN(value.getTime()))
      return res.status(400).json({ message: "Data de pausa inválida." });
    data.pausedUntil = value;
  }
  for (const field of ["availableStartTime", "availableEndTime"]) {
    if (req.body?.[field] === undefined) continue;
    const value = cleanText(req.body[field], 5) || null;
    if (value && parseClock(value) == null)
      return res.status(400).json({ message: "Horário inválido. Use HH:MM." });
    data[field] = value;
  }
  if (req.body?.removableIngredients !== undefined)
    data.removableIngredients = Array.isArray(req.body.removableIngredients)
      ? req.body.removableIngredients
          .map((value) => cleanText(value, 80))
          .filter(Boolean)
          .slice(0, 30)
      : [];
  if (
    (data.name !== undefined && !data.name) ||
    (data.description !== undefined && !data.description) ||
    (data.slug !== undefined && !validSlug(data.slug)) ||
    (req.body?.image && !data.image)
  )
    return res
      .status(400)
      .json({ message: "Nome, descrição, slug ou imagem inválidos." });
  const product = await prisma.$transaction(async (tx) => {
    const current = await tx.product.findUnique({
      where: { id: req.params.id },
    });
    if (!current)
      throw Object.assign(new Error("Produto não encontrado."), {
        code: "P2025",
      });
    await validateProductConfiguration(tx, {
      categoryId: data.categoryId ?? current.categoryId,
      subcategoryId:
        data.subcategoryId !== undefined
          ? data.subcategoryId
          : current.subcategoryId,
      flavorIds: Array.isArray(req.body?.flavorIds) ? req.body.flavorIds : null,
      modifierGroupIds: Array.isArray(req.body?.modifierGroupIds)
        ? req.body.modifierGroupIds
        : null,
      sizePrices: Array.isArray(req.body?.sizePrices)
        ? req.body.sizePrices
        : null,
    });
    const updated = await tx.product.update({
      where: { id: req.params.id },
      data,
    });
    if (Array.isArray(req.body?.flavorIds))
      await syncProductFlavors(tx, req.params.id, req.body.flavorIds);
    if (
      Array.isArray(req.body?.modifierGroupIds) ||
      req.body?.categoryId !== undefined
    ) {
      const currentGroups = Array.isArray(req.body?.modifierGroupIds)
        ? req.body.modifierGroupIds
        : (
            await tx.productModifierGroup.findMany({
              where: { productId: req.params.id },
              select: { groupId: true },
              orderBy: { sortOrder: "asc" },
            })
          ).map((row) => row.groupId);
      await syncProductModifierGroups(
        tx,
        req.params.id,
        currentGroups,
        updated.categoryId,
      );
    }
    if (Array.isArray(req.body?.sizePrices))
      await syncProductSizes(tx, req.params.id, req.body.sizePrices);
    return tx.product.findUnique({
      where: { id: req.params.id },
      include: productInclude,
    });
  });
  res.json(serializeProduct(product));
});
app.delete("/api/admin/products/:id", auth, admin, async (req, res) => {
  const p = await prisma.product.update({
    where: { id: req.params.id },
    data: { available: false, deletedAt: new Date() },
  });
  res.json({ ok: true, id: p.id, archived: true });
});
app.post("/api/admin/products/:id/restore", auth, admin, async (req, res) => {
  const p = await prisma.product.update({
    where: { id: req.params.id },
    data: { deletedAt: null, available: true },
    include: productInclude,
  });
  res.json(serializeProduct(p));
});

app.get("/api/admin/promotions", auth, admin, async (req, res) => {
  const rows = await prisma.promotion.findMany({
    include: { product: { include: productInclude } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
  res.json(
    rows.map((row) => ({
      ...serializePromotion(row),
      product: serializeProduct(row.product),
    })),
  );
});
app.post("/api/admin/promotions", auth, admin, async (req, res) => {
  const productId = cleanText(req.body?.productId, 80),
    title = cleanText(req.body?.title, 100),
    subtitle = cleanText(req.body?.subtitle, 220) || null,
    image = safeMediaUrl(req.body?.image) || null;
  const originalPrice = Number(req.body?.originalPrice),
    promoPrice = Number(req.body?.promoPrice);
  const startAt = optionalDate(req.body?.startAt);
  const endAt = optionalDate(req.body?.endAt);
  const sortOrder = boundedInteger(req.body?.sortOrder ?? 0);
  if (
    !productId ||
    !title ||
    (req.body?.image && !image) ||
    !Number.isFinite(originalPrice) ||
    !Number.isFinite(promoPrice) ||
    promoPrice < 0 ||
    originalPrice <= promoPrice ||
    sortOrder == null ||
    startAt === undefined ||
    endAt === undefined ||
    (startAt && endAt && endAt <= startAt)
  )
    return res.status(400).json({
      message:
        "Informe produto, título e valores válidos; o preço promocional deve ser menor.",
    });
  const productExists = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, productSizes: { select: { sizeId: true, price: true } } },
  });
  if (!productExists)
    return res.status(400).json({ message: "Produto não encontrado." });
  const parsedSizePrices = validatePromotionSizePrices(
    req.body?.sizePrices,
    productExists.productSizes,
  );
  if (!parsedSizePrices.ok)
    return res.status(400).json({
      message:
        "Cada valor promocional por tamanho deve ser menor que o preço base daquele tamanho.",
    });
  const row = await prisma.promotion.create({
    data: {
      productId,
      title,
      subtitle,
      image,
      originalPrice,
      promoPrice,
      sizePrices: parsedSizePrices.value,
      active:
        req.body?.active === undefined ? true : booleanValue(req.body.active),
      sortOrder,
      startAt,
      endAt,
    },
    include: { product: { include: productInclude } },
  });
  res.status(201).json({
    ...serializePromotion(row),
    product: serializeProduct(row.product),
  });
});
app.patch("/api/admin/promotions/:id", auth, admin, async (req, res) => {
  const data = {};
  for (const f of ["title", "subtitle"])
    if (req.body?.[f] !== undefined)
      data[f] = cleanText(req.body[f], f === "subtitle" ? 220 : 100) || null;
  if (Object.hasOwn(data, "title") && !data.title)
    return res.status(400).json({ message: "Título da promoção inválido." });
  if (req.body?.image !== undefined)
    data.image = safeMediaUrl(req.body.image) || null;
  if (req.body?.image && !data.image)
    return res.status(400).json({ message: "URL de imagem inválida." });
  for (const f of ["originalPrice", "promoPrice"]) {
    if (req.body?.[f] !== undefined) {
      const v = Number(req.body[f]);
      if (!Number.isFinite(v) || v < 0)
        return res.status(400).json({ message: "Valor promocional inválido." });
      data[f] = v;
    }
  }
  if (req.body?.productId !== undefined)
    data.productId = cleanText(req.body.productId, 80);
  if (req.body?.active !== undefined)
    data.active = booleanValue(req.body.active);
  if (req.body?.sortOrder !== undefined) {
    const sortOrder = boundedInteger(req.body.sortOrder);
    if (sortOrder == null)
      return res.status(400).json({ message: "Ordem da promoção inválida." });
    data.sortOrder = sortOrder;
  }
  for (const f of ["startAt", "endAt"])
    if (req.body?.[f] !== undefined) {
      const value = optionalDate(req.body[f]);
      if (value === undefined)
        return res
          .status(400)
          .json({ message: "Período promocional inválido." });
      data[f] = value;
    }
  const currentPromotion = await prisma.promotion.findUnique({
    where: { id: req.params.id },
  });
  if (!currentPromotion)
    return res.status(404).json({ message: "Promoção não encontrada." });
  const targetProductId = data.productId || currentPromotion.productId;
  const targetProduct = await prisma.product.findUnique({
    where: { id: targetProductId },
    select: { id: true, productSizes: { select: { sizeId: true, price: true } } },
  });
  if (!targetProduct)
    return res.status(400).json({ message: "Produto não encontrado." });
  if (req.body?.sizePrices !== undefined) {
    const parsedSizePrices = validatePromotionSizePrices(
      req.body.sizePrices,
      targetProduct.productSizes,
    );
    if (!parsedSizePrices.ok)
      return res.status(400).json({
        message:
          "Cada valor promocional por tamanho deve ser menor que o preço base daquele tamanho.",
      });
    data.sizePrices = parsedSizePrices.value;
  } else if (data.productId && data.productId !== currentPromotion.productId) {
    data.sizePrices = {};
  }
  const original = Number(data.originalPrice ?? currentPromotion.originalPrice);
  const promo = Number(data.promoPrice ?? currentPromotion.promoPrice);
  if (original <= promo)
    return res.status(400).json({
      message: "O preço promocional deve ser menor que o preço base.",
    });
  const finalStart = Object.hasOwn(data, "startAt")
    ? data.startAt
    : currentPromotion.startAt;
  const finalEnd = Object.hasOwn(data, "endAt")
    ? data.endAt
    : currentPromotion.endAt;
  if (finalStart && finalEnd && finalEnd <= finalStart)
    return res
      .status(400)
      .json({ message: "O fim da promoção deve ser posterior ao início." });
  const row = await prisma.promotion.update({
    where: { id: req.params.id },
    data,
    include: { product: { include: productInclude } },
  });
  res.json({
    ...serializePromotion(row),
    product: serializeProduct(row.product),
  });
});
app.delete("/api/admin/promotions/:id", auth, admin, async (req, res) => {
  await prisma.promotion.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

app.get("/api/admin/delivery-areas", auth, admin, async (req, res) => {
  const rows = await prisma.deliveryArea.findMany({
    orderBy: [{ sortOrder: "asc" }, { neighborhood: "asc" }],
  });
  res.json(rows.map(serializeDeliveryArea));
});
app.post("/api/admin/delivery-areas", auth, admin, async (req, res) => {
  const city = cleanText(req.body?.city, 100),
    neighborhood = cleanText(req.body?.neighborhood, 100) || "*",
    fee = Number(req.body?.fee);
  const rawDistance = req.body?.distanceKm;
  const distanceKm =
    rawDistance === "" || rawDistance == null ? null : Number(rawDistance);
  const minimumOrder = Number(req.body?.minimumOrder ?? 0);
  const freeDeliveryThreshold =
    req.body?.freeDeliveryThreshold === "" ||
    req.body?.freeDeliveryThreshold == null
      ? null
      : Number(req.body.freeDeliveryThreshold);
  const sortOrder = boundedInteger(req.body?.sortOrder ?? 0);
  if (
    !city ||
    !Number.isFinite(fee) ||
    fee < 0 ||
    fee > 500 ||
    (distanceKm != null &&
      (!Number.isFinite(distanceKm) || distanceKm < 0 || distanceKm > 300)) ||
    !Number.isFinite(minimumOrder) ||
    minimumOrder < 0 ||
    (freeDeliveryThreshold != null &&
      (!Number.isFinite(freeDeliveryThreshold) || freeDeliveryThreshold < 0)) ||
    sortOrder == null
  )
    return res
      .status(400)
      .json({ message: "Informe cidade, taxa, distância e mínimos válidos." });
  const row = await prisma.deliveryArea.create({
    data: {
      city,
      neighborhood,
      fee,
      distanceKm,
      minimumOrder,
      freeDeliveryThreshold,
      active:
        req.body?.active === undefined ? true : booleanValue(req.body.active),
      sortOrder,
    },
  });
  res.status(201).json(serializeDeliveryArea(row));
});
app.patch("/api/admin/delivery-areas/:id", auth, admin, async (req, res) => {
  const data = {};
  if (req.body?.city !== undefined) {
    data.city = cleanText(req.body.city, 100);
    if (!data.city)
      return res.status(400).json({ message: "Cidade inválida." });
  }
  if (req.body?.neighborhood !== undefined)
    data.neighborhood = cleanText(req.body.neighborhood, 100) || "*";
  if (req.body?.fee !== undefined) {
    const v = Number(req.body.fee);
    if (!Number.isFinite(v) || v < 0 || v > 500)
      return res.status(400).json({ message: "Taxa inválida." });
    data.fee = v;
  }
  if (req.body?.distanceKm !== undefined) {
    const raw = req.body.distanceKm;
    if (raw === "" || raw == null) data.distanceKm = null;
    else {
      const v = Number(raw);
      if (!Number.isFinite(v) || v < 0 || v > 300)
        return res
          .status(400)
          .json({ message: "Distância do bairro inválida." });
      data.distanceKm = v;
    }
  }
  if (req.body?.minimumOrder !== undefined) {
    const v = Number(req.body.minimumOrder);
    if (!Number.isFinite(v) || v < 0)
      return res.status(400).json({ message: "Pedido mínimo inválido." });
    data.minimumOrder = v;
  }
  if (req.body?.freeDeliveryThreshold !== undefined) {
    const raw = req.body.freeDeliveryThreshold;
    if (raw === "" || raw == null) data.freeDeliveryThreshold = null;
    else {
      const v = Number(raw);
      if (!Number.isFinite(v) || v < 0)
        return res
          .status(400)
          .json({ message: "Valor de entrega grátis inválido." });
      data.freeDeliveryThreshold = v;
    }
  }
  if (req.body?.active !== undefined)
    data.active = booleanValue(req.body.active);
  if (req.body?.sortOrder !== undefined) {
    const sortOrder = boundedInteger(req.body.sortOrder);
    if (sortOrder == null)
      return res.status(400).json({ message: "Ordem da área inválida." });
    data.sortOrder = sortOrder;
  }
  res.json(
    serializeDeliveryArea(
      await prisma.deliveryArea.update({ where: { id: req.params.id }, data }),
    ),
  );
});
app.delete("/api/admin/delivery-areas/:id", auth, admin, async (req, res) => {
  await prisma.deliveryArea.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

app.get("/api/admin/operations", auth, admin, async (req, res) => {
  let s = await getSettings();
  s = await autoCloseStoreIfNeeded(s);
  res.json({
    isOpen: Boolean(s.isOpen),
    deliveryEnabled: Boolean(s.deliveryEnabled),
    pickupEnabled: Boolean(s.pickupEnabled),
    schedulingEnabled: Boolean(s.schedulingEnabled),
  });
});
app.patch("/api/admin/operations", auth, admin, async (req, res) => {
  const data = {};
  for (const field of ["deliveryEnabled", "pickupEnabled", "schedulingEnabled"])
    if (req.body?.[field] !== undefined)
      data[field] = booleanValue(req.body[field]);
  const current = await getSettings();
  if (req.body?.isOpen !== undefined) {
    const nextOpen = booleanValue(req.body.isOpen);
    data.isOpen = nextOpen;
    if (nextOpen) {
      const marker = await nextManualCloseMarker(current);
      data.manualOpenUntilDate = marker?.dateKey || null;
      data.manualOpenUntilMinutes = marker?.minutes ?? null;
    } else {
      data.manualOpenUntilDate = null;
      data.manualOpenUntilMinutes = null;
    }
  }
  const s = rememberSettings(await prisma.businessSettings.update({
    where: { id: "default" },
    data,
  }));
  res.json({
    isOpen: Boolean(s.isOpen),
    deliveryEnabled: Boolean(s.deliveryEnabled),
    pickupEnabled: Boolean(s.pickupEnabled),
    schedulingEnabled: Boolean(s.schedulingEnabled),
  });
});

app.get("/api/admin/staff", auth, admin, ownerOnly, async (req, res) => {
  const rows = await prisma.user.findMany({
    where: { isAdmin: true, id: { not: req.user.id } },
    orderBy: [{ staffActive: "desc" }, { createdAt: "desc" }],
  });
  res.json(rows.map(publicUser));
});
app.post("/api/admin/staff", auth, admin, ownerOnly, async (req, res) => {
  const name = cleanText(req.body?.name, 80),
    email = cleanText(req.body?.email, 160).toLowerCase(),
    phone = normalizePhone(req.body?.phone),
    password = typeof req.body?.password === "string" ? req.body.password : "";
  const staffRole = normalizeStaffRole(req.body?.staffRole);
  const requestedPermissions = [
    ...new Set(
      (Array.isArray(req.body?.permissions) ? req.body.permissions : [])
        .map((x) => cleanText(x, 40))
        .filter((x) => ADMIN_PERMISSION_KEYS.includes(x)),
    ),
  ];
  const permissions = permissionsForStaffRole(staffRole, requestedPermissions);
  if (name.length < 2)
    return res.status(400).json({ message: "Informe o nome do funcionário." });
  if (!validEmail(email))
    return res
      .status(400)
      .json({ message: "Informe um e-mail válido para o funcionário." });
  if (phone && !validPhone(phone))
    return res.status(400).json({
      message: "Informe um telefone válido com DDD ou deixe em branco.",
    });
  if (!validStaffPassword(password))
    return res.status(400).json({
      message:
        "A senha temporária precisa ter pelo menos 12 caracteres, uma letra e um número.",
    });
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, ...(phone ? [{ phone }] : [])] },
  });
  if (existing)
    return res
      .status(409)
      .json({ message: "Já existe uma conta com esse e-mail ou telefone." });
  const row = await prisma.user.create({
    data: {
      name,
      email,
      phone: phone || null,
      passwordHash: await bcrypt.hash(password, 12),
      isAdmin: true,
      staffRole,
      adminPermissions: permissions,
      staffActive: true,
    },
  });
  res.status(201).json(publicUser(row));
});
app.patch("/api/admin/staff/:id", auth, admin, ownerOnly, async (req, res) => {
  if (req.params.id === req.user.id)
    return res.status(409).json({
      message:
        "Use as configurações da própria conta para alterar o administrador principal.",
    });
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target?.isAdmin)
    return res.status(404).json({ message: "Funcionário não encontrado." });
  const data = {};
  if (req.body?.name !== undefined) {
    const name = cleanText(req.body.name, 80);
    if (name.length < 2)
      return res.status(400).json({ message: "Nome inválido." });
    data.name = name;
  }
  if (req.body?.email !== undefined) {
    const email = cleanText(req.body.email, 160).toLowerCase();
    if (!validEmail(email))
      return res.status(400).json({ message: "E-mail inválido." });
    data.email = email;
  }
  if (req.body?.phone !== undefined) {
    const phone = normalizePhone(req.body.phone);
    if (phone && !validPhone(phone))
      return res.status(400).json({ message: "Telefone inválido." });
    data.phone = phone || null;
  }
  if (req.body?.password) {
    if (!validStaffPassword(req.body.password))
      return res.status(400).json({
        message:
          "A nova senha precisa ter pelo menos 12 caracteres, uma letra e um número.",
      });
    data.passwordHash = await bcrypt.hash(req.body.password, 12);
  }
  if (req.body?.staffActive !== undefined)
    data.staffActive = booleanValue(req.body.staffActive);
  if (req.body?.staffRole !== undefined)
    data.staffRole = normalizeStaffRole(req.body.staffRole);
  if (Array.isArray(req.body?.permissions))
    data.adminPermissions = [
      ...new Set(
        req.body.permissions
          .map((x) => cleanText(x, 40))
          .filter((x) => ADMIN_PERMISSION_KEYS.includes(x)),
      ),
    ];
  if (
    req.body?.password ||
    req.body?.staffActive !== undefined ||
    req.body?.staffRole !== undefined ||
    Array.isArray(req.body?.permissions)
  )
    data.sessionVersion = { increment: 1 };
  const resultingRole = data.staffRole ?? target.staffRole ?? "STAFF";
  data.adminPermissions = permissionsForStaffRole(
    resultingRole,
    data.adminPermissions ?? normalizeAdminPermissions(target.adminPermissions) ?? [],
  );
  const row = await prisma.user.update({ where: { id: req.params.id }, data });
  res.json(publicUser(row));
});
app.delete("/api/admin/staff/:id", auth, admin, ownerOnly, async (req, res) => {
  if (req.params.id === req.user.id)
    return res.status(409).json({
      message: "O administrador principal não pode excluir a própria conta.",
    });
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target?.isAdmin)
    return res.status(404).json({ message: "Funcionário não encontrado." });
  await prisma.user.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

// --- Gestão avançada: endereços favoritos, estoque, cozinha, relatórios e logística ---
app.get("/api/me/addresses", auth, async (req, res) => {
  if (req.user?.isAdmin) return res.json([]);
  const rows = await prisma.customerAddress.findMany({
    where: { userId: req.user.id },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
  });
  res.json(rows);
});
app.post("/api/me/addresses", auth, async (req, res) => {
  if (req.user?.isAdmin)
    return res
      .status(403)
      .json({ message: "Endereços favoritos são exclusivos de clientes." });
  const data = {
    label: cleanText(req.body?.label, 50) || "Favorito",
    postalCode: cleanText(req.body?.postalCode, 12),
    street: cleanText(req.body?.street, 120),
    addressNumber: cleanText(req.body?.addressNumber, 16),
    complement: cleanText(req.body?.complement, 100) || null,
    neighborhood: cleanText(req.body?.neighborhood, 100),
    city: cleanText(req.body?.city, 100),
    state: cleanText(req.body?.state, 40),
    referencePoint: cleanText(req.body?.referencePoint, 180) || null,
    isDefault: booleanValue(req.body?.isDefault),
  };
  const missing = missingDeliveryAddressFields(data);
  if (missing.length)
    return res
      .status(400)
      .json({ message: `Preencha: ${missing.join(", ")}.` });
  const row = await prisma.$transaction(async (tx) => {
    if (data.isDefault)
      await tx.customerAddress.updateMany({
        where: { userId: req.user.id },
        data: { isDefault: false },
      });
    return tx.customerAddress.create({
      data: { ...data, userId: req.user.id },
    });
  });
  res.status(201).json(row);
});
app.patch("/api/me/addresses/:id", auth, async (req, res) => {
  if (req.user?.isAdmin)
    return res
      .status(403)
      .json({ message: "Endereços favoritos são exclusivos de clientes." });
  const current = await prisma.customerAddress.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!current)
    return res.status(404).json({ message: "Endereço não encontrado." });
  const data = {};
  const lengths = {
    label: 50,
    postalCode: 12,
    street: 120,
    addressNumber: 16,
    complement: 100,
    neighborhood: 100,
    city: 100,
    state: 40,
    referencePoint: 180,
  };
  for (const f of [
    "label",
    "postalCode",
    "street",
    "addressNumber",
    "complement",
    "neighborhood",
    "city",
    "state",
    "referencePoint",
  ])
    if (req.body?.[f] !== undefined)
      data[f] = cleanText(req.body[f], lengths[f]) || null;
  if (Object.hasOwn(data, "label") && !data.label)
    return res.status(400).json({ message: "Nome do endereço inválido." });
  const missing = missingDeliveryAddressFields({ ...current, ...data });
  if (missing.length)
    return res
      .status(400)
      .json({ message: `Preencha: ${missing.join(", ")}.` });
  if (req.body?.isDefault !== undefined) {
    data.isDefault = booleanValue(req.body.isDefault);
  }
  const row = await prisma.$transaction(async (tx) => {
    if (data.isDefault)
      await tx.customerAddress.updateMany({
        where: { userId: req.user.id, id: { not: current.id } },
        data: { isDefault: false },
      });
    return tx.customerAddress.update({ where: { id: current.id }, data });
  });
  res.json(row);
});
app.delete("/api/me/addresses/:id", auth, async (req, res) => {
  const row = await prisma.customerAddress.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!row)
    return res.status(404).json({ message: "Endereço não encontrado." });
  await prisma.customerAddress.delete({ where: { id: row.id } });
  res.status(204).end();
});

app.get("/api/recommendations", async (req, res) => {
  const ids = String(req.query.productIds || "")
    .split(",")
    .map((x) => cleanText(x, 80))
    .filter(Boolean)
    .slice(0, 20);
  const where = { status: "DELIVERED" };
  const orders = ids.length
    ? await prisma.order.findMany({
        where: { ...where, items: { some: { productId: { in: ids } } } },
        include: { items: true },
        take: 250,
        orderBy: { createdAt: "desc" },
      })
    : [];
  const scores = new Map();
  for (const o of orders)
    for (const item of o.items) {
      if (ids.includes(item.productId)) continue;
      scores.set(
        item.productId,
        (scores.get(item.productId) || 0) + item.quantity,
      );
    }
  let candidateIds = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
    .slice(0, 6);
  const fallback = await prisma.product.findMany({
    where: {
      available: true,
      deletedAt: null,
      category: { active: true },
      id: { notIn: ids },
      OR: [{ stockTracked: false }, { stockQuantity: { gt: 0 } }],
    },
    orderBy: [{ featured: "desc" }, { sortOrder: "asc" }],
    take: 6,
    select: { id: true },
  });
  candidateIds = [
    ...new Set([...candidateIds, ...fallback.map((product) => product.id)]),
  ].slice(0, 6);
  const [products, flavorProducts, settings] = await Promise.all([
    prisma.product.findMany({
      where: {
        id: { in: candidateIds },
        available: true,
        deletedAt: null,
        category: { active: true },
        OR: [{ stockTracked: false }, { stockQuantity: { gt: 0 } }],
      },
      include: productInclude,
    }),
    prisma.product.findMany({
      where: {
        isFlavorOption: true,
        available: true,
        deletedAt: null,
        category: { active: true },
        OR: [{ stockTracked: false }, { stockQuantity: { gt: 0 } }],
      },
      include: productInclude,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    getSettings(),
  ]);
  const now = new Date();
  const timezone = settings.timezone || "America/Maceio";
  const activeFlavorProducts = flavorProducts.filter((product) =>
    isProductAvailableAt(product, now, timezone),
  );
  const map = new Map(
    products
      .filter((product) => isProductAvailableAt(product, now, timezone))
      .map((product) => [
        product.id,
        attachProductFlavorOptions(
          serializePublicProduct(product),
          activeFlavorProducts,
        ),
      ]),
  );
  res.json(candidateIds.map((id) => map.get(id)).filter(Boolean));
});

app.get("/api/admin/inventory", auth, admin, async (req, res) => {
  const [items, products] = await Promise.all([
    prisma.inventoryItem.findMany({
      include: { recipes: { select: { productId: true, quantity: true } } },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    prisma.product.findMany({
      where: { deletedAt: null },
      include: {
        recipeItems: { include: { inventoryItem: true } },
        category: true,
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);
  res.json({
    items: items.map((i) => ({
      ...i,
      quantity: Number(i.quantity),
      minQuantity: Number(i.minQuantity),
      recipes: i.recipes.map((r) => ({ ...r, quantity: Number(r.quantity) })),
    })),
    products: products.map((p) => ({
      ...serializeProduct(p),
      recipeItems: (p.recipeItems || []).map((r) => ({
        inventoryItemId: r.inventoryItemId,
        quantity: Number(r.quantity),
        inventoryItem: {
          ...r.inventoryItem,
          quantity: Number(r.inventoryItem.quantity),
          minQuantity: Number(r.inventoryItem.minQuantity),
        },
      })),
    })),
  });
});
app.post("/api/admin/inventory", auth, admin, async (req, res) => {
  const name = cleanText(req.body?.name, 100),
    unit = cleanText(req.body?.unit, 20) || "un",
    quantity = Number(req.body?.quantity || 0),
    minQuantity = Number(req.body?.minQuantity || 0);
  if (
    !name ||
    !Number.isFinite(quantity) ||
    quantity < 0 ||
    !Number.isFinite(minQuantity) ||
    minQuantity < 0
  )
    return res.status(400).json({ message: "Informe nome e estoque válidos." });
  const row = await prisma.inventoryItem.create({
    data: {
      name,
      unit,
      quantity,
      minQuantity,
      active:
        req.body?.active === undefined ? true : booleanValue(req.body.active),
    },
  });
  res.status(201).json({
    ...row,
    quantity: Number(row.quantity),
    minQuantity: Number(row.minQuantity),
  });
});
app.patch("/api/admin/inventory/:id", auth, admin, async (req, res) => {
  const data = {};
  for (const f of ["name", "unit"])
    if (req.body?.[f] !== undefined) data[f] = cleanText(req.body[f], 100);
  if (
    (Object.hasOwn(data, "name") && !data.name) ||
    (Object.hasOwn(data, "unit") && !data.unit)
  )
    return res
      .status(400)
      .json({ message: "Nome e unidade do estoque são obrigatórios." });
  for (const f of ["quantity", "minQuantity"])
    if (req.body?.[f] !== undefined) {
      const v = Number(req.body[f]);
      if (!Number.isFinite(v) || v < 0)
        return res.status(400).json({ message: "Quantidade inválida." });
      data[f] = v;
    }
  if (req.body?.active !== undefined)
    data.active = booleanValue(req.body.active);
  const row = await prisma.inventoryItem.update({
    where: { id: req.params.id },
    data,
  });
  res.json({
    ...row,
    quantity: Number(row.quantity),
    minQuantity: Number(row.minQuantity),
  });
});
app.delete("/api/admin/inventory/:id", auth, admin, async (req, res) => {
  const used = await prisma.productInventoryItem.count({
    where: { inventoryItemId: req.params.id },
  });
  if (used) {
    await prisma.inventoryItem.update({
      where: { id: req.params.id },
      data: { active: false },
    });
    return res.json({ ok: true, archived: true });
  }
  await prisma.inventoryItem.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
app.put("/api/admin/products/:id/recipe", auth, admin, async (req, res) => {
  if (!Array.isArray(req.body?.items))
    return res
      .status(400)
      .json({ message: "Envie a lista de ingredientes da ficha técnica." });
  const rows = req.body.items;
  if (rows.length > 100)
    return res
      .status(400)
      .json({ message: "A ficha técnica aceita no máximo 100 ingredientes." });
  const cleaned = rows
    .map((r) => ({
      inventoryItemId: cleanText(r.inventoryItemId, 80),
      quantity: Number(r.quantity),
    }))
    .filter(
      (r) => r.inventoryItemId && Number.isFinite(r.quantity) && r.quantity > 0,
    );
  if (
    cleaned.length !== rows.length ||
    new Set(cleaned.map((row) => row.inventoryItemId)).size !== cleaned.length
  )
    return res.status(400).json({
      message:
        "A ficha técnica contém ingrediente duplicado, ausente ou quantidade inválida.",
    });
  const [productExists, inventoryCount] = await Promise.all([
    prisma.product.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    }),
    cleaned.length
      ? prisma.inventoryItem.count({
          where: { id: { in: cleaned.map((row) => row.inventoryItemId) } },
        })
      : Promise.resolve(0),
  ]);
  if (!productExists)
    return res.status(404).json({ message: "Produto não encontrado." });
  if (inventoryCount !== cleaned.length)
    return res
      .status(400)
      .json({ message: "Um dos ingredientes não existe no estoque." });
  await prisma.$transaction(async (tx) => {
    await tx.productInventoryItem.deleteMany({
      where: { productId: req.params.id },
    });
    if (cleaned.length)
      await tx.productInventoryItem.createMany({
        data: cleaned.map((r) => ({ ...r, productId: req.params.id })),
      });
  });
  res.json({ ok: true });
});

app.get("/api/admin/delivery-surcharges", auth, admin, async (req, res) => {
  res.json(
    await prisma.deliverySurchargeRule.findMany({
      orderBy: [{ active: "desc" }, { dayOfWeek: "asc" }, { startTime: "asc" }],
    }),
  );
});
app.post("/api/admin/delivery-surcharges", auth, admin, async (req, res) => {
  const name = cleanText(req.body?.name, 80),
    startTime = cleanText(req.body?.startTime, 5),
    endTime = cleanText(req.body?.endTime, 5),
    amount = Number(req.body?.amount || 0),
    dayOfWeek =
      req.body?.dayOfWeek === "" || req.body?.dayOfWeek == null
        ? null
        : Number(req.body.dayOfWeek);
  if (
    !name ||
    parseClock(startTime) == null ||
    parseClock(endTime) == null ||
    !Number.isFinite(amount) ||
    amount < 0 ||
    (dayOfWeek != null &&
      (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6))
  )
    return res.status(400).json({ message: "Regra de horário inválida." });
  res.status(201).json(
    await prisma.deliverySurchargeRule.create({
      data: {
        name,
        startTime,
        endTime,
        amount,
        dayOfWeek,
        active:
          req.body?.active === undefined ? true : booleanValue(req.body.active),
      },
    }),
  );
});
app.patch(
  "/api/admin/delivery-surcharges/:id",
  auth,
  admin,
  async (req, res) => {
    const data = {};
    if (req.body?.name !== undefined) {
      data.name = cleanText(req.body.name, 80);
      if (!data.name)
        return res.status(400).json({ message: "Nome da regra inválido." });
    }
    for (const f of ["startTime", "endTime"])
      if (req.body?.[f] !== undefined) {
        const v = cleanText(req.body[f], 5);
        if (parseClock(v) == null)
          return res.status(400).json({ message: "Horário inválido." });
        data[f] = v;
      }
    if (req.body?.amount !== undefined) {
      const v = Number(req.body.amount);
      if (!Number.isFinite(v) || v < 0)
        return res.status(400).json({ message: "Taxa inválida." });
      data.amount = v;
    }
    if (req.body?.dayOfWeek !== undefined) {
      data.dayOfWeek =
        req.body.dayOfWeek === "" || req.body.dayOfWeek == null
          ? null
          : Number(req.body.dayOfWeek);
      if (
        data.dayOfWeek != null &&
        (!Number.isInteger(data.dayOfWeek) ||
          data.dayOfWeek < 0 ||
          data.dayOfWeek > 6)
      )
        return res.status(400).json({ message: "Dia da semana inválido." });
    }
    if (req.body?.active !== undefined)
      data.active = booleanValue(req.body.active);
    res.json(
      await prisma.deliverySurchargeRule.update({
        where: { id: req.params.id },
        data,
      }),
    );
  },
);
app.delete(
  "/api/admin/delivery-surcharges/:id",
  auth,
  admin,
  async (req, res) => {
    await prisma.deliverySurchargeRule.delete({ where: { id: req.params.id } });
    res.status(204).end();
  },
);

app.get("/api/admin/kitchen/orders", auth, admin, async (req, res) => {
  await activateDueScheduledOrders();
  const rows = await prisma.order.findMany({
    where: {
      paymentStatus: { in: ["APPROVED", "CASH_PENDING"] },
      status: {
        in: ["RECEIVED", "PREPARING", "READY_FOR_PICKUP", "READY_FOR_TABLE"],
      },
    },
    include: orderInclude,
    orderBy: [{ createdAt: "asc" }],
    take: 100,
  });
  res.json(rows.map(serializeOrder));
});
app.patch(
  "/api/admin/kitchen/orders/:id/advance",
  auth,
  admin,
  async (req, res) => {
    const row = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${req.params.id}))`;
      const current = await tx.order.findFirst({
        where: {
          id: req.params.id,
          paymentStatus: { in: ["APPROVED", "CASH_PENDING"] },
          status: { in: ["RECEIVED", "PREPARING"] },
        },
        select: { id: true, status: true, fulfillmentType: true, acceptedAt: true },
      });
      if (!current)
        throw Object.assign(new Error("Pedido não está mais aguardando a cozinha."), {
          code: "KITCHEN_ORDER_UNAVAILABLE",
        });
      const status =
        current.status === "RECEIVED"
          ? "PREPARING"
          : current.fulfillmentType === "DINE_IN"
            ? "READY_FOR_TABLE"
            : current.fulfillmentType === "PICKUP"
              ? "READY_FOR_PICKUP"
              : "READY_FOR_DELIVERY";
      if (status === "PREPARING") await applyOrderStock(tx, current.id);
      await tx.order.update({
        where: { id: current.id },
        data: {
          status,
          ...(!current.acceptedAt ? { acceptedAt: new Date() } : {}),
          ...(["READY_FOR_TABLE", "READY_FOR_PICKUP", "READY_FOR_DELIVERY"].includes(status)
            ? { readyAt: new Date() }
            : {}),
        },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: current.id,
          status,
          changedByUserId: req.adminUser.id,
          changedByName: req.adminUser.name,
          changedByRole: "COZINHA",
        },
      });
      return tx.order.findUnique({ where: { id: current.id }, include: orderInclude });
    });
    res.json(serializeOrder(row));
  },
);
app.patch(
  "/api/admin/kitchen/orders/:id/seen",
  auth,
  admin,
  async (req, res) => {
    const existing = await prisma.order.findFirst({
      where: {
        id: req.params.id,
        paymentStatus: { in: ["APPROVED", "CASH_PENDING"] },
        status: {
          in: ["RECEIVED", "PREPARING", "READY_FOR_PICKUP", "READY_FOR_TABLE"],
        },
      },
      select: { id: true },
    });
    if (!existing)
      return res
        .status(404)
        .json({ message: "Pedido não encontrado na fila da cozinha." });
    const row = await prisma.order.update({
      where: { id: existing.id },
      data: { kitchenSeenAt: new Date() },
      include: orderInclude,
    });
    res.json(serializeOrder(row));
  },
);
app.patch(
  "/api/admin/kitchen/orders/:id/printed",
  auth,
  admin,
  async (req, res) => {
    const existing = await prisma.order.findFirst({
      where: {
        id: req.params.id,
        paymentStatus: { in: ["APPROVED", "CASH_PENDING"] },
        status: {
          in: ["RECEIVED", "PREPARING", "READY_FOR_PICKUP", "READY_FOR_TABLE"],
        },
      },
      select: { id: true },
    });
    if (!existing)
      return res
        .status(404)
        .json({ message: "Pedido não encontrado na fila da cozinha." });
    const row = await prisma.order.update({
      where: { id: existing.id },
      data: { printedAt: new Date() },
      include: orderInclude,
    });
    res.json(serializeOrder(row));
  },
);
app.post(
  "/api/admin/orders/:id/assign-courier",
  auth,
  admin,
  async (req, res) => {
    const existing = await prisma.order.findFirst({
      where: {
        id: req.params.id,
        fulfillmentType: "DELIVERY",
        paymentStatus: { in: ["APPROVED", "CASH_PENDING"] },
        status: { in: ["READY_FOR_DELIVERY", "OUT_FOR_DELIVERY"] },
      },
      select: { id: true },
    });
    if (!existing)
      return res
        .status(404)
        .json({ message: "Entrega não encontrada ou ainda não está pronta." });
    const courierId = cleanText(req.body?.courierId, 80) || null;
    if (courierId) {
      const courier = await prisma.user.findFirst({
        where: {
          id: courierId,
          isAdmin: true,
          staffRole: "DELIVERY",
          staffActive: true,
        },
      });
      if (!courier)
        return res.status(400).json({ message: "Entregador inválido." });
    }
    const row = await prisma.order.update({
      where: { id: existing.id },
      data: { assignedCourierId: courierId },
      include: orderInclude,
    });
    res.json(serializeOrder(row));
  },
);
app.post(
  "/api/admin/courier/auto-assign/:id",
  auth,
  admin,
  async (req, res) => {
    const existing = await prisma.order.findFirst({
      where: {
        id: req.params.id,
        fulfillmentType: "DELIVERY",
        paymentStatus: { in: ["APPROVED", "CASH_PENDING"] },
        status: { in: ["READY_FOR_DELIVERY", "OUT_FOR_DELIVERY"] },
      },
      select: { id: true },
    });
    if (!existing)
      return res
        .status(404)
        .json({ message: "Entrega não encontrada ou ainda não está pronta." });
    const result = await prisma.$transaction(async (tx) => {
      const courier = await autoAssignCourier(tx, existing.id);
      const order = await tx.order.findUnique({
        where: { id: existing.id },
        include: orderInclude,
      });
      return { courier, order };
    });
    res.json({ courier: result.courier, order: serializeOrder(result.order) });
  },
);

app.get("/api/admin/business-insights", auth, admin, async (req, res) => {
  const settings = await prisma.businessSettings.findUnique({
    where: { id: "default" },
  });
  const timezone = settings?.timezone || "America/Maceio";
  const period = String(req.query?.period || "ALL").toUpperCase();
  const todayKey = zonedDateKey(new Date(), timezone),
    weekKey = startOfWeekKey(todayKey),
    monthKey = todayKey.slice(0, 7),
    yearKey = todayKey.slice(0, 4);
  const allDelivered = await prisma.order.findMany({
    where: {
      status: "DELIVERED",
      paymentStatus: { in: ["APPROVED", "CASH_PENDING"] },
    },
    include: { items: true },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });
  const delivered = allDelivered.filter((o) => {
    const key = zonedDateKey(o.createdAt, timezone);
    if (period === "DAY") return key === todayKey;
    if (period === "WEEK") return key >= weekKey;
    if (period === "MONTH") return key.startsWith(monthKey);
    if (period === "YEAR") return key.startsWith(yearKey);
    return true;
  });
  const sales = new Map();
  let revenue = 0;
  const hours = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    orders: 0,
    revenue: 0,
  }));
  for (const o of delivered) {
    revenue += Number(o.total || 0);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      hour12: false,
      hourCycle: "h23",
    }).formatToParts(new Date(o.createdAt));
    const hour = Number(parts.find((p) => p.type === "hour")?.value || 0);
    hours[hour].orders++;
    hours[hour].revenue += Number(o.total || 0);
    for (const item of o.items) {
      const row = sales.get(item.productId) || {
        productId: item.productId,
        name: item.name.split(" • ")[0],
        quantity: 0,
        revenue: 0,
      };
      row.quantity += item.quantity;
      row.revenue += Number(item.unitPrice || 0) * item.quantity;
      sales.set(item.productId, row);
    }
  }
  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, available: true },
  });
  const ranked = products
    .map(
      (p) =>
        sales.get(p.id) || {
          productId: p.id,
          name: p.name,
          quantity: 0,
          revenue: 0,
        },
    )
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue);
  const pairs = new Map();
  for (const o of delivered) {
    const ids = [...new Set(o.items.map((i) => i.productId))].sort();
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const k = `${ids[i]}::${ids[j]}`;
        pairs.set(k, (pairs.get(k) || 0) + 1);
      }
  }
  const productName = new Map(products.map((p) => [p.id, p.name]));
  const smartCombos = [...pairs.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([key, count]) => {
      const [a, b] = key.split("::");
      return {
        productIds: [a, b],
        names: [productName.get(a) || a, productName.get(b) || b],
        ordersTogether: count,
      };
    });
  res.json({
    period,
    summary: {
      orders: delivered.length,
      revenue: roundMoney(revenue),
      averageTicket: roundMoney(
        delivered.length ? revenue / delivered.length : 0,
      ),
    },
    bestSellers: ranked.slice(0, 10),
    leastSellers: [...ranked]
      .sort((a, b) => a.quantity - b.quantity || a.revenue - b.revenue)
      .slice(0, 10),
    peakHours: hours
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 8)
      .map((h) => ({ ...h, revenue: roundMoney(h.revenue) })),
    smartCombos,
  });
});

app.get("/api/admin/customers/:id/details", auth, admin, async (req, res) => {
  const [settings, user, deliveredMetrics, ordersCount, lastOrder] =
    await Promise.all([
      prisma.businessSettings.findUnique({ where: { id: "default" } }),
      prisma.user.findFirst({
        where: { id: req.params.id, isAdmin: false },
        include: {
          orders: {
            include: orderInclude,
            orderBy: { createdAt: "desc" },
            take: 200,
          },
          favoriteAddresses: {
            orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
          },
        },
      }),
      prisma.order.aggregate({
        where: { userId: req.params.id, status: "DELIVERED" },
        _sum: { total: true },
        _count: { _all: true },
      }),
      prisma.order.count({ where: { userId: req.params.id } }),
      prisma.order.findFirst({
        where: { userId: req.params.id },
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);
  if (!user)
    return res.status(404).json({ message: "Cliente não encontrado." });
  const deliveredCount = Number(deliveredMetrics._count._all || 0);
  const spent = Number(deliveredMetrics._sum.total || 0);
  const last = lastOrder?.createdAt || null;
  const inactiveDays = last
    ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000)
    : 99999;
  res.json({
    ...publicUser(user),
    adminNote: user.adminNote || "",
    customerBlocked: Boolean(user.customerBlocked),
    orders: user.orders.map(serializeOrder),
    favoriteAddresses: user.favoriteAddresses,
    metrics: {
      orders: ordersCount,
      ordersReturned: user.orders.length,
      delivered: deliveredCount,
      spent: roundMoney(spent),
      averageTicket: roundMoney(deliveredCount ? spent / deliveredCount : 0),
      vip:
        deliveredCount >= Number(settings?.vipMinOrders || 8) ||
        spent >= Number(settings?.vipMinSpend || 400),
      inactive: inactiveDays >= Number(settings?.inactiveCustomerDays || 60),
      inactiveDays,
      lastOrderAt: last,
    },
  });
});
app.patch("/api/admin/customers/:id/profile", auth, admin, async (req, res) => {
  const customer = await prisma.user.findFirst({
    where: { id: req.params.id, isAdmin: false },
  });
  if (!customer)
    return res.status(404).json({ message: "Cliente não encontrado." });
  const data = {};
  if (req.body?.adminNote !== undefined)
    data.adminNote = cleanText(req.body.adminNote, 1000) || null;
  if (req.body?.customerBlocked !== undefined) {
    data.customerBlocked = booleanValue(req.body.customerBlocked);
    data.sessionVersion = { increment: 1 };
  }
  const user = await prisma.user.update({ where: { id: customer.id }, data });
  res.json({ ...publicUser(user), adminNote: user.adminNote || "" });
});

app.get("/api/admin/store-hours", auth, admin, async (req, res) => {
  res.json(await ensureStoreHours());
});
app.patch("/api/admin/store-hours/:id", auth, admin, async (req, res) => {
  const data = {};
  if (req.body?.label !== undefined) {
    data.label = cleanText(req.body.label, 40);
    if (!data.label)
      return res.status(400).json({ message: "Nome do dia inválido." });
  }
  for (const f of ["openTime", "closeTime"])
    if (req.body?.[f] !== undefined) {
      const value = cleanText(req.body[f], 5);
      if (parseClock(value) == null)
        return res
          .status(400)
          .json({ message: "Horário inválido. Use o formato HH:MM." });
      data[f] = value;
    }
  if (req.body?.closed !== undefined)
    data.closed = booleanValue(req.body.closed);
  if (req.body?.sortOrder !== undefined) {
    const sortOrder = boundedInteger(req.body.sortOrder);
    if (sortOrder == null)
      return res.status(400).json({ message: "Ordem do horário inválida." });
    data.sortOrder = sortOrder;
  }
  const row = await prisma.storeHour.update({
    where: { id: req.params.id },
    data,
  });
  clearStoreHoursCache();
  res.json(row);
});

app.get("/api/admin/settings", auth, admin, async (req, res) => {
  let s = await getSettings();
  s = await autoCloseStoreIfNeeded(s);
  res.json(serializeSettings(s));
});
app.patch("/api/admin/settings", auth, admin, async (req, res) => {
  const current = await getSettings();
  const data = {};
  for (const f of [
    "storeName",
    "timezone",
    "phone",
    "whatsappPrimary",
    "whatsappSecondary",
    "instagram",
    "address",
    "openingHours",
    "heroTitle",
    "heroSubtitle",
    "heroStampTitle",
    "heroStampText",
    "menuTitle",
    "menuSubtitle",
    "storePostalCode",
    "heroEyebrow",
    "aboutEyebrow",
    "aboutTitle",
    "aboutText",
    "promotionsTitle",
    "promotionsSubtitle",
    "footerText",
  ]) {
    if (req.body?.[f] !== undefined)
      data[f] = cleanText(
        req.body[f],
        f.startsWith("hero") || f.startsWith("menu") ? 280 : 220,
      );
  }
  if (req.body?.instagramUrl !== undefined) {
    const value = safeExternalUrl(req.body.instagramUrl, 600);
    if (req.body.instagramUrl && !value)
      return res
        .status(400)
        .json({ message: "A URL do Instagram deve usar HTTPS." });
    data.instagramUrl = value;
  }
  for (const f of ["logoImage", "heroImage", "aboutImage"]) {
    if (req.body?.[f] !== undefined) {
      const value = safeMediaUrl(req.body[f]);
      if (req.body[f] && !value)
        return res.status(400).json({
          message: "A imagem deve usar HTTPS ou ser enviada pelo painel.",
        });
      data[f] = value || null;
    }
  }
  if (data.timezone !== undefined) {
    try {
      new Intl.DateTimeFormat("pt-BR", { timeZone: data.timezone }).format();
    } catch {
      return res.status(400).json({ message: "Fuso horário inválido." });
    }
  }
  for (const f of [
    "deliveryFee",
    "freeDeliveryThreshold",
    "defaultMinimumOrder",
    "deliveryPricePerKm",
    "deliveryMinimumKm",
    "deliveryMinimumFee",
    "deliveryMaxDistanceKm",
    "vipMinSpend",
  ]) {
    if (req.body?.[f] !== undefined) {
      const v = Number(req.body[f]);
      if (!Number.isFinite(v) || v < 0)
        return res.status(400).json({ message: "Valor de entrega inválido." });
      data[f] = v;
    }
  }
  for (const f of ["storeLatitude", "storeLongitude"]) {
    if (req.body?.[f] !== undefined) {
      const raw = req.body[f];
      if (raw === "" || raw == null) data[f] = null;
      else {
        const v = Number(raw),
          valid =
            f === "storeLatitude" ? v >= -90 && v <= 90 : v >= -180 && v <= 180;
        if (!Number.isFinite(v) || !valid)
          return res.status(400).json({ message: "Coordenada inválida." });
        data[f] = v;
      }
    }
  }
  if (req.body?.deliveryPricingMode !== undefined) {
    if (!["AREA", "DISTANCE"].includes(req.body.deliveryPricingMode))
      return res.status(400).json({ message: "Modo de entrega inválido." });
    data.deliveryPricingMode = req.body.deliveryPricingMode;
  }
  for (const f of ["estimatedDeliveryMin", "estimatedDeliveryMax"]) {
    if (req.body?.[f] !== undefined) {
      const v = Number(req.body[f]);
      if (!Number.isInteger(v) || v < 5 || v > 300)
        return res.status(400).json({ message: "Tempo estimado inválido." });
      data[f] = v;
    }
  }
  if (req.body?.vipMinOrders !== undefined) {
    const v = Number(req.body.vipMinOrders);
    if (!Number.isInteger(v) || v < 1 || v > 1000)
      return res
        .status(400)
        .json({ message: "Quantidade para cliente VIP inválida." });
    data.vipMinOrders = v;
  }
  if (req.body?.inactiveCustomerDays !== undefined) {
    const v = Number(req.body.inactiveCustomerDays);
    if (!Number.isInteger(v) || v < 1 || v > 3650)
      return res
        .status(400)
        .json({ message: "Período de inatividade inválido." });
    data.inactiveCustomerDays = v;
  }
  if (req.body?.lateWarningMinutes !== undefined) {
    const v = Number(req.body.lateWarningMinutes);
    if (!Number.isInteger(v) || v < 1 || v > 180)
      return res.status(400).json({
        message: "O alerta de atraso deve ficar entre 1 e 180 minutos.",
      });
    data.lateWarningMinutes = v;
  }
  if (req.body?.customerDailyOrderLimit !== undefined) {
    const v = Number(req.body.customerDailyOrderLimit);
    if (!Number.isInteger(v) || v < 1 || v > 100)
      return res.status(400).json({
        message:
          "O limite diário por cliente deve ficar entre 1 e 100 pedidos.",
      });
    data.customerDailyOrderLimit = v;
  }
  const etaMin = Number(
    data.estimatedDeliveryMin ?? current.estimatedDeliveryMin ?? 30,
  );
  const etaMax = Number(
    data.estimatedDeliveryMax ?? current.estimatedDeliveryMax ?? 45,
  );
  if (etaMax < etaMin)
    return res.status(400).json({
      message: "O prazo máximo deve ser igual ou maior que o prazo mínimo.",
    });
  if (req.body?.homeProductLimit !== undefined) {
    const v = Number(req.body.homeProductLimit);
    if (!Number.isInteger(v) || v < 4 || v > 8)
      return res.status(400).json({
        message: "O limite da página inicial deve ficar entre 4 e 8 produtos.",
      });
    data.homeProductLimit = v;
  }
  if (req.body?.customPaymentMethods !== undefined) {
    if (!Array.isArray(req.body.customPaymentMethods))
      return res.status(400).json({
        message: "A lista de formas de pagamento personalizadas é inválida.",
      });
    const requested = req.body.customPaymentMethods;
    const normalized = normalizeCustomPaymentMethods(requested);
    if (requested.length > 20 || normalized.length !== requested.length)
      return res.status(400).json({
        message:
          "Use até 20 formas de pagamento, com nomes únicos de 2 a 40 caracteres.",
      });
    data.customPaymentMethods = normalized;
  }
  for (const f of [
    "deliveryEnabled",
    "pickupEnabled",
    "schedulingEnabled",
    "isOpen",
    "cashPaymentEnabled",
    "onlinePaymentEnabled",
    "deliveryHybridEnabled",
    "browserNotificationsEnabled",
    "newOrderSoundEnabled",
    "autoPrintEnabled",
    "whatsappAutoEnabled",
    "smartCourierQueueEnabled",
    "cartRecommendationsEnabled",
    "whatsappSecondaryVisible",
  ])
    if (req.body?.[f] !== undefined) data[f] = booleanValue(req.body[f]);
  for (const f of ["whatsappOrderCreatedTemplate", "whatsappStatusTemplate"])
    if (req.body?.[f] !== undefined) data[f] = cleanText(req.body[f], 500);

  const nextCep = cleanCep(data.storePostalCode ?? current.storePostalCode);
  const oldCep = cleanCep(current.storePostalCode);
  const latitudeChanged =
    data.storeLatitude !== undefined &&
    Number(data.storeLatitude) !== Number(current.storeLatitude);
  const longitudeChanged =
    data.storeLongitude !== undefined &&
    Number(data.storeLongitude) !== Number(current.storeLongitude);
  if (
    (latitudeChanged || longitudeChanged) &&
    req.body?.storeGeoSource === undefined
  )
    data.storeGeoSource = "manual";
  if (nextCep && (latitudeChanged || longitudeChanged))
    data.storeCoordinatesCep = nextCep;
  if (nextCep !== oldCep && !latitudeChanged && !longitudeChanged) {
    data.storeLatitude = null;
    data.storeLongitude = null;
    data.storeCoordinatesCep = null;
  } else if (
    nextCep &&
    cleanCep(current.storeCoordinatesCep) !== nextCep &&
    !latitudeChanged &&
    !longitudeChanged
  ) {
    data.storeCoordinatesCep = null;
  }

  const locationChanged =
    data.address !== undefined ||
    data.storePostalCode !== undefined ||
    data.storeLatitude !== undefined ||
    data.storeLongitude !== undefined ||
    data.storeGeoSource !== undefined;
  const s = rememberSettings(await prisma.businessSettings.upsert({
    where: { id: "default" },
    update: data,
    create: { id: "default", ...data },
  }));
  if (locationChanged)
    await prisma.deliveryGeoCache.deleteMany().catch(() => {});
  res.json(serializeSettings(s));
});

// ===== Central de gestão avançada v2.19 =====
async function writeAdminLog(
  req,
  action,
  entity = "",
  entityId = "",
  details = {},
) {
  try {
    await prisma.adminLog.create({
      data: {
        userId: req.adminUser?.id || null,
        userName: req.adminUser?.name || null,
        role: req.adminUser?.staffRole || "ADMIN",
        action,
        entity,
        entityId,
        details,
      },
    });
  } catch {}
}
async function writeTechnicalLog(event, error, req = null, details = null) {
  try {
    await prisma.technicalLog.create({
      data: {
        level: "ERROR",
        event: cleanText(event, 80) || "APPLICATION_ERROR",
        message: cleanText(error?.message || String(error), 500),
        requestId: cleanText(req?.requestId, 100) || null,
        details:
          details ||
          (req
            ? {
                method: req.method,
                path: cleanText(req.originalUrl, 300),
                code: cleanText(error?.code, 80) || null,
              }
            : undefined),
      },
    });
  } catch {}
}
app.get("/api/admin/advanced/settings", auth, admin, async (req, res) => {
  const settings = await getSettings();
  res.json({
    kitchenCapacityPerSlot: settings.kitchenCapacityPerSlot,
    kitchenSlotMinutes: settings.kitchenSlotMinutes,
    courierMaxActiveOrders: settings.courierMaxActiveOrders,
    customerDailyOrderLimit: settings.customerDailyOrderLimit,
    pwaEnabled: settings.pwaEnabled,
    smartCourierQueueEnabled: settings.smartCourierQueueEnabled,
  });
});
app.patch("/api/admin/advanced/settings", auth, admin, async (req, res) => {
  const data = {};
  for (const k of [
    "kitchenCapacityPerSlot",
    "kitchenSlotMinutes",
    "courierMaxActiveOrders",
    "customerDailyOrderLimit",
  ]) {
    if (req.body?.[k] !== undefined) {
      const value = Number(req.body[k]);
      const max = k === "customerDailyOrderLimit" ? 100 : 10_000;
      if (!Number.isInteger(value) || value < 1 || value > max)
        return res
          .status(400)
          .json({ message: "Configuração numérica inválida." });
      data[k] = value;
    }
  }
  for (const k of ["pwaEnabled", "smartCourierQueueEnabled"])
    if (req.body?.[k] !== undefined) data[k] = booleanValue(req.body[k]);
  const row = rememberSettings(await prisma.businessSettings.upsert({
    where: { id: "default" },
    update: data,
    create: { id: "default", ...data },
  }));
  await writeAdminLog(
    req,
    "UPDATE_ADVANCED_SETTINGS",
    "BusinessSettings",
    "default",
    data,
  );
  res.json(serializeSettings(row));
});
app.get("/api/admin/coupons", auth, admin, async (req, res) =>
  res.json(await prisma.coupon.findMany({ orderBy: { createdAt: "desc" } })),
);
function couponDataFromRequest(body, partial = false) {
  const data = {};
  if (!partial || body?.code !== undefined)
    data.code = cleanText(body?.code, 40).toUpperCase();
  if (!partial || body?.description !== undefined)
    data.description = cleanText(body?.description, 160) || null;
  if (!partial || body?.type !== undefined)
    data.type = body?.type === "FIXED" ? "FIXED" : "PERCENT";
  for (const field of ["value", "minimumOrder", "maxDiscount"]) {
    if (!partial || body?.[field] !== undefined) {
      const raw = body?.[field];
      data[field] =
        raw === "" || raw == null
          ? field === "maxDiscount"
            ? null
            : 0
          : Number(raw);
    }
  }
  for (const field of ["maxUses", "perCustomerLimit"]) {
    if (!partial || body?.[field] !== undefined) {
      const raw = body?.[field];
      data[field] =
        raw === "" || raw == null
          ? field === "maxUses"
            ? null
            : 1
          : Number(raw);
    }
  }
  if (!partial || body?.active !== undefined)
    data.active = body?.active === undefined ? true : booleanValue(body.active);
  if (!partial || body?.allowGuest !== undefined)
    data.allowGuest =
      body?.allowGuest === undefined ? false : booleanValue(body.allowGuest);
  for (const field of ["startAt", "endAt"])
    if (!partial || body?.[field] !== undefined)
      data[field] = body?.[field] ? new Date(body[field]) : null;
  return data;
}
function validateCouponData(data, current = {}) {
  const merged = { ...current, ...data };
  if (!merged.code || !/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(merged.code))
    return "Use um código de cupom com letras, números, hífen ou sublinhado.";
  if (!Number.isFinite(Number(merged.value)) || Number(merged.value) <= 0)
    return "O desconto do cupom deve ser maior que zero.";
  if (merged.type === "PERCENT" && Number(merged.value) > 100)
    return "O desconto percentual não pode passar de 100%.";
  if (
    !Number.isFinite(Number(merged.minimumOrder)) ||
    Number(merged.minimumOrder) < 0
  )
    return "O pedido mínimo do cupom é inválido.";
  if (
    merged.maxDiscount != null &&
    (!Number.isFinite(Number(merged.maxDiscount)) ||
      Number(merged.maxDiscount) <= 0)
  )
    return "O desconto máximo do cupom é inválido.";
  if (
    merged.maxUses != null &&
    (!Number.isInteger(Number(merged.maxUses)) || Number(merged.maxUses) < 1)
  )
    return "O limite total de usos é inválido.";
  if (
    !Number.isInteger(Number(merged.perCustomerLimit)) ||
    Number(merged.perCustomerLimit) < 1
  )
    return "O limite por cliente é inválido.";
  if (
    (merged.startAt && Number.isNaN(new Date(merged.startAt).getTime())) ||
    (merged.endAt && Number.isNaN(new Date(merged.endAt).getTime()))
  )
    return "A vigência do cupom é inválida.";
  if (
    merged.startAt &&
    merged.endAt &&
    new Date(merged.endAt) <= new Date(merged.startAt)
  )
    return "O término do cupom deve ser posterior ao início.";
  return null;
}
app.post("/api/admin/coupons", auth, admin, async (req, res) => {
  const data = couponDataFromRequest(req.body);
  const error = validateCouponData(data);
  if (error) return res.status(400).json({ message: error });
  const row = await prisma.coupon.create({ data });
  await writeAdminLog(req, "CREATE_COUPON", "Coupon", row.id, {
    code: row.code,
  });
  res.status(201).json(row);
});
app.patch("/api/admin/coupons/:id", auth, admin, async (req, res) => {
  const current = await prisma.coupon.findUnique({
    where: { id: req.params.id },
  });
  if (!current)
    return res.status(404).json({ message: "Cupom não encontrado." });
  const data = couponDataFromRequest(req.body, true);
  const error = validateCouponData(data, current);
  if (error) return res.status(400).json({ message: error });
  const row = await prisma.coupon.update({ where: { id: current.id }, data });
  await writeAdminLog(req, "UPDATE_COUPON", "Coupon", row.id, data);
  res.json(row);
});
app.delete("/api/admin/coupons/:id", auth, admin, async (req, res) => {
  await prisma.coupon.delete({ where: { id: req.params.id } });
  await writeAdminLog(req, "DELETE_COUPON", "Coupon", req.params.id);
  res.json({ ok: true });
});
app.post(
  "/api/coupons/validate",
  couponRateLimit,
  optionalAuth,
  async (req, res) => {
    const code = cleanText(req.body?.code, 40).toUpperCase(),
      subtotal = Number(req.body?.subtotal),
      customerPhone = normalizePhone(req.body?.customerPhone),
      now = new Date();
    if (!Number.isFinite(subtotal) || subtotal < 0)
      return res.status(400).json({ message: "Subtotal inválido." });
    const c = await prisma.coupon.findUnique({ where: { code } });
    if (
      !c ||
      !c.active ||
      (c.startAt && c.startAt > now) ||
      (c.endAt && c.endAt < now) ||
      (c.maxUses != null && c.uses >= c.maxUses)
    )
      return res.status(404).json({ message: "Cupom inválido ou expirado." });
    if (!req.user?.id && !c.allowGuest)
      return res.status(403).json({
        code: "COUPON_ACCOUNT_REQUIRED",
        message: "Este cupom é exclusivo para clientes com conta.",
      });
    if (subtotal < Number(c.minimumOrder))
      return res.status(400).json({
        message: `Pedido mínimo de R$ ${Number(c.minimumOrder).toFixed(2).replace(".", ",")}.`,
      });
    const identity = [];
    if (req.user?.id) identity.push({ userId: req.user.id });
    if (validPhone(customerPhone)) identity.push({ customerPhone });
    if (identity.length) {
      const uses = await prisma.order.count({
        where: {
          couponCode: c.code,
          status: { not: "CANCELED" },
          paymentStatus: { not: "REJECTED" },
          OR: identity,
        },
      });
      if (uses >= Math.max(1, Number(c.perCustomerLimit || 1)))
        return res.status(409).json({
          message: "Este cupom já atingiu o limite de uso para este cliente.",
        });
    }
    let discount =
      c.type === "FIXED" ? Number(c.value) : (subtotal * Number(c.value)) / 100;
    if (c.maxDiscount != null)
      discount = Math.min(discount, Number(c.maxDiscount));
    discount = Math.min(discount, subtotal);
    res.json({
      code: c.code,
      discount: roundMoney(discount),
      description: c.description,
      type: c.type,
      value: Number(c.value),
      minimumOrder: Number(c.minimumOrder),
      perCustomerLimit: Number(c.perCustomerLimit || 1),
      allowGuest: Boolean(c.allowGuest),
      startAt: c.startAt,
      endAt: c.endAt,
    });
  },
);
async function serializeGoalWithProgress(goal) {
  const delivered = await prisma.order.aggregate({
    where: {
      status: "DELIVERED",
      deliveredAt: { gte: goal.startsAt, lte: goal.endsAt },
    },
    _sum: { total: true },
    _count: { _all: true },
  });
  const revenue = roundMoney(Number(delivered._sum.total || 0));
  const orders = Number(delivered._count._all || 0);
  const averageTicket = orders ? roundMoney(revenue / orders) : 0;
  const metric = goal.metric || "REVENUE";
  const actual =
    metric === "ORDERS"
      ? orders
      : metric === "AVERAGE_TICKET"
        ? averageTicket
        : revenue;
  const target = Number(goal.target || 0);
  const progressPercent =
    target > 0 ? Math.min(999, roundMoney((actual / target) * 100)) : 0;
  const now = Date.now();
  const remainingDays = Math.max(
    0,
    Math.ceil((new Date(goal.endsAt).getTime() - now) / 86400000),
  );
  return {
    ...goal,
    target,
    actual,
    revenue,
    orders,
    averageTicket,
    progressPercent,
    remainingDays,
    completed: actual >= target,
    expired: new Date(goal.endsAt).getTime() < now,
  };
}
app.get("/api/admin/goals", auth, admin, async (req, res) => {
  const rows = await prisma.businessGoal.findMany({
    orderBy: { startsAt: "desc" },
    take: 50,
  });
  res.json(await Promise.all(rows.map(serializeGoalWithProgress)));
});
app.post("/api/admin/goals", auth, admin, async (req, res) => {
  const name = cleanText(req.body?.name, 100),
    metric = ["REVENUE", "ORDERS", "AVERAGE_TICKET"].includes(req.body?.metric)
      ? req.body.metric
      : "REVENUE",
    period = cleanText(req.body?.period, 20) || "CUSTOM",
    target = Number(req.body?.target),
    startsAt = new Date(req.body?.startsAt),
    endsAt = new Date(req.body?.endsAt);
  if (
    !name ||
    !Number.isFinite(target) ||
    target <= 0 ||
    (metric === "ORDERS" && !Number.isInteger(target)) ||
    Number.isNaN(startsAt.getTime()) ||
    Number.isNaN(endsAt.getTime()) ||
    endsAt <= startsAt
  )
    return res
      .status(400)
      .json({ message: "Informe uma meta, valor e período válidos." });
  const row = await prisma.businessGoal.create({
    data: {
      name,
      metric,
      period,
      target,
      startsAt,
      endsAt,
      active:
        req.body?.active === undefined ? true : booleanValue(req.body.active),
    },
  });
  await writeAdminLog(req, "CREATE_GOAL", "BusinessGoal", row.id);
  res.status(201).json(await serializeGoalWithProgress(row));
});
app.delete("/api/admin/goals/:id", auth, admin, async (req, res) => {
  await prisma.businessGoal.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
app.get("/api/admin/logs", auth, admin, async (req, res) =>
  res.json(
    await prisma.adminLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 250,
    }),
  ),
);
app.get("/api/admin/health", auth, admin, async (req, res) => {
  let db = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    db = false;
  }
  res.json({
    api: true,
    database: db,
    mercadoPago: MERCADOPAGO_PUBLIC_READY,
    passwordEmail: RESEND_READY,
    whatsapp: Boolean(WHATSAPP_WEBHOOK_URL),
    timestamp: new Date(),
    uptimeSeconds: Math.round(process.uptime()),
  });
});
async function cashSessionWithSummary(session) {
  const until = session.closedAt || new Date();
  const aggregate = await prisma.order.aggregate({
    where: {
      paymentMethod: "CASH",
      status: "DELIVERED",
      deliveredAt: { gte: session.openedAt, lte: until },
    },
    _sum: { total: true },
    _count: { _all: true },
  });
  const cashSales = roundMoney(Number(aggregate._sum.total || 0));
  const openingAmount = Number(session.openingAmount || 0);
  const expectedClosing = roundMoney(openingAmount + cashSales);
  const closingAmount =
    session.closingAmount == null ? null : Number(session.closingAmount);
  return {
    ...session,
    openingAmount,
    closingAmount,
    cashSales,
    cashOrders: Number(aggregate._count?._all || 0),
    expectedClosing,
    difference:
      closingAmount == null
        ? null
        : roundMoney(closingAmount - expectedClosing),
  };
}
app.get("/api/admin/cash", auth, admin, async (req, res) => {
  const where =
    req.adminPermissions == null ? {} : { userId: req.adminUser.id };
  const sessions = await prisma.cashSession.findMany({
    where,
    orderBy: { openedAt: "desc" },
    take: 50,
  });
  res.json(await Promise.all(sessions.map(cashSessionWithSummary)));
});
app.post("/api/admin/cash/open", auth, admin, async (req, res) => {
  const openingAmount = Number(req.body?.openingAmount ?? 0);
  if (
    !Number.isFinite(openingAmount) ||
    openingAmount < 0 ||
    openingAmount > 10_000_000
  )
    return res.status(400).json({ message: "Valor de abertura inválido." });
  const open = await prisma.cashSession.findUnique({
    where: { openKey: req.adminUser.id },
  });
  if (open)
    return res
      .status(409)
      .json({ message: "Este funcionário já possui um caixa aberto." });
  const row = await prisma.cashSession.create({
    data: {
      userId: req.adminUser.id,
      openKey: req.adminUser.id,
      userName: req.adminUser.name,
      openingAmount,
    },
  });
  await writeAdminLog(req, "OPEN_CASH", "CashSession", row.id);
  res.status(201).json(row);
});
app.post("/api/admin/cash/:id/close", auth, admin, async (req, res) => {
  const closingAmount = Number(req.body?.closingAmount);
  if (
    !Number.isFinite(closingAmount) ||
    closingAmount < 0 ||
    closingAmount > 10_000_000
  )
    return res.status(400).json({ message: "Valor de fechamento inválido." });
  const where = {
    id: req.params.id,
    closedAt: null,
    ...(req.adminPermissions == null ? {} : { userId: req.adminUser.id }),
  };
  const session = await prisma.cashSession.findFirst({ where });
  if (!session)
    return res.status(404).json({
      message:
        "Caixa aberto não encontrado ou pertencente a outro funcionário.",
    });
  const row = await prisma.cashSession.update({
    where: { id: session.id },
    data: {
      closedAt: new Date(),
      openKey: null,
      closingAmount,
      notes: cleanText(req.body?.notes, 300) || null,
    },
  });
  await writeAdminLog(req, "CLOSE_CASH", "CashSession", row.id);
  res.json(await cashSessionWithSummary(row));
});
app.get("/api/admin/operations-intelligence", auth, admin, async (req, res) => {
  const since = new Date(Date.now() - 30 * 86400000);
  const [delivered, liveOrders, couriers, settings] = await Promise.all([
    prisma.order.findMany({
      where: { status: "DELIVERED", createdAt: { gte: since } },
      include: { items: true },
    }),
    prisma.order.findMany({
      where: {
        status: {
          in: [
            "RECEIVED",
            "PREPARING",
            "READY_FOR_DELIVERY",
            "OUT_FOR_DELIVERY",
          ],
        },
      },
      select: { status: true, assignedCourierId: true },
    }),
    prisma.user.findMany({
      where: { isAdmin: true, staffRole: "DELIVERY", staffActive: true },
      select: { id: true, name: true },
    }),
    getSettings(),
  ]);
  const prep = delivered
    .filter((o) => o.acceptedAt && o.readyAt)
    .map((o) => (new Date(o.readyAt) - new Date(o.acceptedAt)) / 60000)
    .filter(Number.isFinite);
  const delivery = delivered
    .filter((o) => o.outForDeliveryAt && o.deliveredAt)
    .map(
      (o) => (new Date(o.deliveredAt) - new Date(o.outForDeliveryAt)) / 60000,
    )
    .filter(Number.isFinite);
  const revenue = delivered.reduce((a, o) => a + Number(o.total), 0),
    freight = delivered.reduce((a, o) => a + Number(o.deliveryFee), 0);
  const maxPerCourier = Math.max(
    1,
    Number(settings.courierMaxActiveOrders || 3),
  );
  const courierLoad = couriers.map((c) => ({
    ...c,
    active: liveOrders.filter(
      (o) => o.status === "OUT_FOR_DELIVERY" && o.assignedCourierId === c.id,
    ).length,
    max: maxPerCourier,
  }));
  res.json({
    averagePrepMinutes: prep.length
      ? Math.round(prep.reduce((a, b) => a + b, 0) / prep.length)
      : 0,
    averageDeliveryMinutes: delivery.length
      ? Math.round(delivery.reduce((a, b) => a + b, 0) / delivery.length)
      : 0,
    revenue: roundMoney(revenue),
    freight: roundMoney(freight),
    net: roundMoney(revenue - freight),
    orders: delivered.length,
    live: {
      received: liveOrders.filter((o) => o.status === "RECEIVED").length,
      preparing: liveOrders.filter((o) => o.status === "PREPARING").length,
      readyForDelivery: liveOrders.filter(
        (o) => o.status === "READY_FOR_DELIVERY",
      ).length,
      outForDelivery: liveOrders.filter((o) => o.status === "OUT_FOR_DELIVERY")
        .length,
      couriers: courierLoad,
      kitchenCapacityPerSlot: Number(settings.kitchenCapacityPerSlot || 12),
      kitchenSlotMinutes: Number(settings.kitchenSlotMinutes || 30),
    },
  });
});
app.get("/api/admin/map/deliveries", auth, admin, async (req, res) => {
  const rows = await prisma.order.findMany({
    where: {
      status: "OUT_FOR_DELIVERY",
      latitude: { not: null },
      longitude: { not: null },
    },
    select: {
      id: true,
      trackingCode: true,
      customerName: true,
      latitude: true,
      longitude: true,
      assignedCourier: { select: { name: true } },
      createdAt: true,
    },
  });
  res.json(
    rows.map((r) => ({
      ...r,
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
    })),
  );
});
app.get("/api/admin/customer-segments", auth, admin, async (req, res) => {
  const [settings, users, deliveredMetrics, latestDelivered] =
    await Promise.all([
      getSettings(),
      prisma.user.findMany({
        where: { isAdmin: false },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          birthday: true,
          loyaltyPoints: true,
          cashbackBalance: true,
        },
        orderBy: { createdAt: "desc" },
        take: 2_000,
      }),
      prisma.order.groupBy({
        by: ["userId"],
        where: { userId: { not: null }, status: "DELIVERED" },
        _count: { _all: true },
        _sum: { total: true },
      }),
      prisma.$queryRaw`
        SELECT DISTINCT ON ("userId") "userId", "createdAt"
        FROM "Order"
        WHERE "userId" IS NOT NULL AND "status" = 'DELIVERED'
        ORDER BY "userId", "createdAt" DESC
      `,
    ]);
  const metricsByUser = new Map(
    deliveredMetrics.map((row) => [row.userId, row]),
  );
  const latestByUser = new Map(
    latestDelivered.map((row) => [row.userId, row.createdAt]),
  );
  const now = Date.now();
  res.json(
    users.map((user) => {
      const metrics = metricsByUser.get(user.id);
      const orders = Number(metrics?._count?._all || 0);
      const spent = Number(metrics?._sum?.total || 0);
      const last = latestByUser.get(user.id) || null;
      return {
        ...user,
        cashbackBalance: Number(user.cashbackBalance),
        orders,
        spent: roundMoney(spent),
        vip:
          orders >= Number(settings.vipMinOrders || 8) ||
          spent >= Number(settings.vipMinSpend || 400),
        inactive:
          !last ||
          now - new Date(last).getTime() >
            Number(settings.inactiveCustomerDays || 60) * 86400000,
      };
    }),
  );
});
app.post(
  "/api/orders/:trackingCode/review",
  reviewRateLimit,
  async (req, res) => {
    const trackingCode = cleanText(req.params.trackingCode, 100);
    const order = await prisma.order.findUnique({ where: { trackingCode } });
    if (!order || order.status !== "DELIVERED")
      return res
        .status(400)
        .json({ message: "A avaliação é liberada após a entrega." });
    const rating = Number(req.body?.rating),
      deliveryRating =
        req.body?.deliveryRating == null || req.body?.deliveryRating === ""
          ? null
          : Number(req.body.deliveryRating);
    if (
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 5 ||
      (deliveryRating != null &&
        (!Number.isInteger(deliveryRating) ||
          deliveryRating < 1 ||
          deliveryRating > 5))
    )
      return res
        .status(400)
        .json({ message: "A nota deve ser um número inteiro de 1 a 5." });
    const row = await prisma.review.upsert({
      where: { orderId: order.id },
      update: {
        rating,
        deliveryRating,
        comment: cleanText(req.body?.comment, 500) || null,
      },
      create: {
        orderId: order.id,
        customerName: order.customerName,
        rating,
        deliveryRating,
        comment: cleanText(req.body?.comment, 500) || null,
      },
    });
    res.json(row);
  },
);

app.use((req, res) =>
  res.status(404).json({ message: "Rota não encontrada." }),
);
app.use((err, req, res, next) => {
  const logServerError = () =>
    console.error(
      isProduction
        ? {
            requestId: req.requestId,
            message: err?.message,
            code: err?.code,
            path: req.originalUrl,
          }
        : err,
    );
  if (err?.type === "entity.parse.failed")
    return res
      .status(400)
      .json({ message: "O corpo JSON da solicitação é inválido." });
  if (err?.type === "entity.too.large")
    return res
      .status(413)
      .json({ message: "A solicitação excede o tamanho permitido." });
  if (String(err?.message || "").includes("Origem não permitida"))
    return res.status(403).json({ message: "Origem não permitida." });
  if (err instanceof multer.MulterError)
    return res.status(400).json({
      message:
        err.code === "LIMIT_FILE_SIZE"
          ? "A imagem deve ter no máximo 1,8 MB."
          : "Falha no upload da imagem.",
    });
  if (String(err?.message || "").includes("Formato de imagem"))
    return res.status(400).json({ message: err.message });
  if (err?.code === "P2002")
    return res.status(409).json({
      message: "Já existe um registro com esse nome ou identificador.",
    });
  if (["P2003", "P2014"].includes(err?.code))
    return res.status(409).json({
      message:
        "A operação não pode ser concluída porque o registro está relacionado a outros dados.",
    });
  if (err?.code === "P2025")
    return res.status(404).json({ message: "Registro não encontrado." });
  if (isDatabaseAvailabilityError(err)) {
    console.warn(
      `[database:${err.code}] ${req.method} ${req.originalUrl} temporariamente indisponível (request ${req.requestId || "sem-id"}).`,
    );
    return res.status(503).json({
      code: "DATABASE_UNAVAILABLE",
      message:
        "O banco de dados está temporariamente ocupado ou indisponível. Tente novamente em instantes.",
    });
  }
  if (err?.code === "DELIVERY_ALREADY_CLAIMED")
    return res.status(409).json({ code: err.code, message: err.message });
  if (err?.code === "COURIER_LIMIT")
    return res.status(409).json({ code: err.code, message: err.message });
  if (err?.code === "COUPON_UNAVAILABLE")
    return res.status(409).json({ code: err.code, message: err.message });
  if (err?.code === "DAILY_ORDER_LIMIT")
    return res.status(429).json({ code: err.code, message: err.message });
  if (err?.code === "SLOT_FULL")
    return res.status(409).json({ code: err.code, message: err.message });
  if (err?.code === "TABLE_SESSION_CLOSED")
    return res.status(409).json({ code: err.code, message: err.message });
  if (
    [
      "TABLE_NOT_AVAILABLE",
      "TABLE_ORDER_UNAVAILABLE",
      "TABLE_SESSION_HAS_ORDERS",
      "TABLE_PAYMENT_INVALID",
      "TABLE_ORDERS_PENDING",
      "DIGITAL_TABLE_INVALID",
      "KITCHEN_ORDER_UNAVAILABLE",
    ].includes(err?.code)
  )
    return res.status(409).json({ code: err.code, message: err.message });
  if (err?.code === "PRODUCT_UNAVAILABLE")
    return res.status(409).json({ code: err.code, message: err.message });
  if (err?.code === "INVALID_CATALOG_CONFIGURATION")
    return res.status(400).json({ code: err.code, message: err.message });
  if (["OUT_OF_STOCK", "INGREDIENT_OUT_OF_STOCK"].includes(err?.code))
    return res.status(409).json({ code: err.code, message: err.message });
  logServerError();
  void writeTechnicalLog("UNHANDLED_REQUEST_ERROR", err, req);
  res.status(500).json({ message: "Erro interno do servidor." });
});

const server = app.listen(PORT, () =>
  console.log(`Master Pizzaria API rodando na porta ${PORT}`),
);
let automationInProgress = false;
let lastRetentionRunAt = 0;
const RETENTION_INTERVAL_MS = 5 * 60 * 1000;

async function archiveExpiredTableSessions(cutoff) {
  let archived = 0;
  for (let page = 0; page < 4; page += 1) {
    const sessions = await prisma.tableSession.findMany({
      where: {
        status: { in: ["CLOSED", "CANCELED"] },
        closedAt: { lt: cutoff },
      },
      include: { table: true },
      orderBy: { closedAt: "asc" },
      take: 250,
    });
    if (!sessions.length) break;
    const ids = sessions.map((session) => session.id);
    await prisma.$transaction([
      prisma.tableClosureRecord.createMany({
        data: sessions.map((session) => ({
          sourceSessionId: session.id,
          tableId: session.tableId,
          tableNumber: session.table.number,
          tableName: session.table.name,
          customerName: session.customerName,
          status: session.status,
          paymentMethod: session.paymentMethod,
          paymentMethodLabel: session.paymentMethodLabel,
          subtotal: session.subtotal,
          total: session.total,
          amountPaid: session.amountPaid,
          changeAmount: session.changeAmount,
          openedById: session.openedById,
          openedByName: session.openedByName,
          closedById: session.closedById,
          closedByName: session.closedByName,
          openedAt: session.openedAt,
          closedAt: session.closedAt,
        })),
        skipDuplicates: true,
      }),
      prisma.order.updateMany({
        where: { tableSessionId: { in: ids } },
        data: { tableSessionId: null },
      }),
      prisma.tableSession.deleteMany({ where: { id: { in: ids } } }),
    ]);
    archived += sessions.length;
    if (sessions.length < 250) break;
  }
  return archived;
}

async function deleteExpiredOrders(cutoff) {
  let deleted = 0;
  for (let page = 0; page < 4; page += 1) {
    const rows = await prisma.order.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: 250,
    });
    if (!rows.length) break;
    const ids = rows.map((row) => row.id);
    await prisma.$transaction([
      prisma.review.deleteMany({ where: { orderId: { in: ids } } }),
      prisma.whatsAppOutbox.deleteMany({ where: { orderId: { in: ids } } }),
      prisma.inventoryMovement.deleteMany({ where: { orderId: { in: ids } } }),
      prisma.order.deleteMany({ where: { id: { in: ids } } }),
    ]);
    deleted += rows.length;
    if (rows.length < 250) break;
  }
  return deleted;
}

async function runDataRetention(now = new Date()) {
  const cutoffs = retentionCutoffs(now);
  const summary = {
    tableSessions: await archiveExpiredTableSessions(cutoffs.tableSessions),
  };
  const orderPersonalFields = [
    "postalCode",
    "street",
    "addressNumber",
    "complement",
    "neighborhood",
    "city",
    "state",
    "latitude",
    "longitude",
    "referencePoint",
  ];
  summary.anonymizedOrders = (
    await prisma.order.updateMany({
      where: {
        createdAt: { lt: cutoffs.personalData },
        OR: [
          { customerPhone: { not: "" } },
          ...orderPersonalFields.map((field) => ({ [field]: { not: null } })),
        ],
      },
      data: {
        customerPhone: "",
        postalCode: null,
        street: null,
        addressNumber: null,
        complement: null,
        neighborhood: null,
        city: null,
        state: null,
        latitude: null,
        longitude: null,
        referencePoint: null,
      },
    })
  ).count;
  summary.deletedAddresses = (
    await prisma.customerAddress.deleteMany({
      where: { updatedAt: { lt: cutoffs.personalData } },
    })
  ).count;
  summary.anonymizedCustomers = (
    await prisma.user.updateMany({
      where: {
        isAdmin: false,
        OR: [
          { lastLoginAt: { lt: cutoffs.personalData } },
          { lastLoginAt: null, updatedAt: { lt: cutoffs.personalData } },
        ],
        AND: [
          {
            OR: [
              { phone: { not: null } },
              { postalCode: { not: null } },
              { street: { not: null } },
              { addressNumber: { not: null } },
              { complement: { not: null } },
              { neighborhood: { not: null } },
              { city: { not: null } },
              { state: { not: null } },
              { referencePoint: { not: null } },
            ],
          },
        ],
      },
      data: {
        phone: null,
        postalCode: null,
        street: null,
        addressNumber: null,
        complement: null,
        neighborhood: null,
        city: null,
        state: null,
        referencePoint: null,
      },
    })
  ).count;
  summary.expiredResetTokens = (
    await prisma.passwordResetToken.deleteMany({
      where: { createdAt: { lt: cutoffs.abandonedSessions } },
    })
  ).count;
  summary.technicalLogs = (
    await prisma.technicalLog.deleteMany({
      where: { createdAt: { lt: cutoffs.technicalLogs } },
    })
  ).count;
  summary.integrationLogs = (
    await prisma.whatsAppOutbox.deleteMany({
      where: { createdAt: { lt: cutoffs.technicalLogs } },
    })
  ).count;
  summary.tableClosures = (
    await prisma.tableClosureRecord.deleteMany({
      where: { closedAt: { lt: cutoffs.financialData } },
    })
  ).count;
  summary.cashClosures = (
    await prisma.cashSession.deleteMany({
      where: { closedAt: { lt: cutoffs.financialData } },
    })
  ).count;
  summary.orders = await deleteExpiredOrders(cutoffs.financialData);
  return summary;
}

async function runAutomationCycle() {
  if (automationInProgress) return;
  automationInProgress = true;
  try {
    await autoCloseStoreIfNeeded();
    await activateDueScheduledOrders();
    if (Date.now() - lastRetentionRunAt >= RETENTION_INTERVAL_MS) {
      lastRetentionRunAt = Date.now();
      await runDataRetention().catch((error) => {
        void writeTechnicalLog("DATA_RETENTION_ERROR", error);
      });
    }
  } finally {
    automationInProgress = false;
  }
}
const automationTimer = setInterval(
  () => runAutomationCycle().catch(() => {}),
  20_000,
);
automationTimer.unref?.();
async function shutdown() {
  clearInterval(automationTimer);
  clearInterval(rateLimitCleanupTimer);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
