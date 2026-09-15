import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  Copy,
  CreditCard,
  Crosshair,
  LoaderCircle,
  MapPin,
  QrCode,
  RefreshCw,
  Route,
  ShieldCheck,
  Store,
  UserRound,
  WalletCards,
} from "lucide-react";
import { Link } from "react-router-dom";
import { CardPayment, initMercadoPago } from "@mercadopago/sdk-react";
import { api, authHeaders } from "../lib/api";
import { formatCep, formatPhone, money } from "../lib/format";
import { readStoredStringArray, writeStoredJson } from "../lib/storage";
import MotoIcon from "../components/MotoIcon";

function saveGuestOrder(code) {
  if (!code) return;
  const current = readStoredStringArray(
    localStorage,
    "master-pizza-guest-orders",
  );
  writeStoredJson(
    localStorage,
    "master-pizza-guest-orders",
    [code, ...current.filter((value) => value !== code)].slice(0, 20),
  );
}
function dateKeyUTC(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function storeNow(timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "America/Maceio",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    dayOfWeek: map[get("weekday")],
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}
function buildTimes(rule, dateValue, timezone, deliveryMaxMinutes = 45) {
  if (!rule || rule.closed) return [];
  const [oh, om] = String(rule.openTime || "18:00")
    .split(":")
    .map(Number);
  const [ch, cm] = String(rule.closeTime || "23:00")
    .split(":")
    .map(Number);
  const maxDelivery = Math.max(5, Number(deliveryMaxMinutes || 45));
  const start = oh * 60 + om + maxDelivery,
    end = ch * 60 + cm,
    out = [];
  const now = storeNow(timezone);
  const minAllowed =
    dateValue === now.dateKey ? now.minutes + maxDelivery : start;
  for (let m = start; m <= end; m += 30) {
    if (m < minAllowed) continue;
    out.push(
      `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`,
    );
  }
  return out;
}
function buildOpenDates(storeHours, timezone, deliveryMaxMinutes) {
  const result = [];
  const now = storeNow(timezone);
  const [y, m, d] = now.dateKey.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  for (let i = 0; i <= 30 && result.length < 14; i++) {
    const day = new Date(base);
    day.setUTCDate(base.getUTCDate() + i);
    const value = dateKeyUTC(day);
    const rule = storeHours.find(
      (h) => Number(h.dayOfWeek) === day.getUTCDay(),
    );
    if (!rule || rule.closed) continue;
    if (buildTimes(rule, value, timezone, deliveryMaxMinutes).length === 0)
      continue;
    const label =
      i === 0
        ? `Hoje • ${day.toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "long", day: "2-digit", month: "2-digit" })}`
        : day.toLocaleDateString("pt-BR", {
            timeZone: "UTC",
            weekday: "long",
            day: "2-digit",
            month: "2-digit",
          });
    result.push({ value, label, rule });
  }
  return result;
}
function etaText(settings) {
  const min = Number(settings.estimatedDeliveryMin || 30),
    max = Number(settings.estimatedDeliveryMax || 45);
  return min === max ? `${min} min` : `${min}–${max} min`;
}

export default function CheckoutPage({
  cart,
  setCart,
  settings,
  storeHours = [],
  session,
}) {
  const customPaymentMethods = [];
  const onlineAvailable = Boolean(
    settings.onlinePaymentEnabled && settings.onlinePaymentConfigured,
  );
  const cashAvailable = settings.cashPaymentEnabled !== false;
  const defaultPayment = cashAvailable
    ? "CASH"
    : onlineAvailable
      ? "PIX"
      : customPaymentMethods[0]
        ? `CUSTOM:${customPaymentMethods[0].id}`
        : "";
  const u = session?.user || {};
  const [form, setForm] = useState({
    customerName: u.name || "",
    customerPhone: u.phone ? formatPhone(u.phone) : "",
    customerEmail: u.email || "",
    fulfillmentType: "DELIVERY",
    deliveryAreaId: "",
    postalCode: u.postalCode ? formatCep(u.postalCode) : "",
    street: u.street || "",
    addressNumber: u.addressNumber || "",
    complement: u.complement || "",
    neighborhood: u.neighborhood || "",
    city: u.city || "",
    state: u.state || "",
    referencePoint: u.referencePoint || "",
    paymentMethod: defaultPayment,
    changeFor: "",
    scheduleDate: "",
    scheduleTime: "",
  });
  const [loading, setLoading] = useState(false),
    [success, setSuccess] = useState(null),
    [pendingPayment, setPendingPayment] = useState(null),
    [error, setError] = useState(""),
    [cepStatus, setCepStatus] = useState({
      loading: false,
      found: false,
      message: "",
    }),
    [quote, setQuote] = useState(null),
    [quoteLoading, setQuoteLoading] = useState(false),
    [scheduleWanted, setScheduleWanted] = useState(!settings.isOpen),
    [locating, setLocating] = useState(false);
  const [couponCode, setCouponCode] = useState(""),
    [coupon, setCoupon] = useState(null),
    [couponLoading, setCouponLoading] = useState(false);
  const [favoriteAddresses, setFavoriteAddresses] = useState([]),
    [selectedFavorite, setSelectedFavorite] = useState(""),
    [saveFavoriteAddress, setSaveFavoriteAddress] = useState(false),
    [favoriteAddressLabel, setFavoriteAddressLabel] = useState("Casa");
  useEffect(() => {
    const available = [
      ...(cashAvailable ? ["CASH"] : []),
      ...(onlineAvailable ? ["PIX", "CARD"] : []),
      ...customPaymentMethods.map((method) => `CUSTOM:${method.id}`),
    ];
    if (!available.includes(form.paymentMethod))
      setForm((current) => ({
        ...current,
        paymentMethod: available[0] || "",
        changeFor: "",
      }));
  }, [
    cashAvailable,
    onlineAvailable,
    settings.customPaymentMethods,
    form.paymentMethod,
  ]);
  useEffect(() => {
    if (onlineAvailable && settings.mercadoPagoPublicKey)
      initMercadoPago(settings.mercadoPagoPublicKey, { locale: "pt-BR" });
  }, [onlineAvailable, settings.mercadoPagoPublicKey]);
  const subtotal = cart.reduce(
    (sum, item) => sum + Number(item.price) * item.quantity,
    0,
  );
  const discount = Number(coupon?.discount || 0);
  const deliveryAddressComplete =
    form.fulfillmentType !== "DELIVERY" ||
    [
      "postalCode",
      "state",
      "city",
      "neighborhood",
      "street",
      "addressNumber",
    ].every((key) => String(form[key] || "").trim());
  const customerInfoComplete =
    String(form.customerName || "").trim().length >= 2 &&
    /^\d{10,11}$/.test(String(form.customerPhone || "").replace(/\D/g, "")) &&
    (!["CARD", "PIX"].includes(form.paymentMethod) ||
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(form.customerEmail || "").trim()));
  const maxDelivery = Number(settings.estimatedDeliveryMax || 45);
  const openDates = useMemo(
    () =>
      settings.schedulingEnabled !== false
        ? buildOpenDates(storeHours, settings.timezone, maxDelivery)
        : [],
    [storeHours, settings.timezone, maxDelivery, settings.schedulingEnabled],
  );
  const selectedScheduleDay = useMemo(
    () => openDates.find((d) => d.value === form.scheduleDate),
    [openDates, form.scheduleDate],
  );
  const scheduleTimes = useMemo(
    () =>
      buildTimes(
        selectedScheduleDay?.rule,
        form.scheduleDate,
        settings.timezone,
        maxDelivery,
      ),
    [selectedScheduleDay, form.scheduleDate, settings.timezone, maxDelivery],
  );
  const set = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (settings.schedulingEnabled === false) {
      setScheduleWanted(false);
      setForm((current) => ({
        ...current,
        scheduleDate: "",
        scheduleTime: "",
      }));
      return;
    }
    if (settings.isOpen) return;
    setScheduleWanted(true);
    if (form.scheduleDate) return;
    if (openDates[0]) {
      const times = buildTimes(
        openDates[0].rule,
        openDates[0].value,
        settings.timezone,
        maxDelivery,
      );
      setForm((current) => ({
        ...current,
        scheduleDate: openDates[0].value,
        scheduleTime: times[0] || "",
      }));
    }
  }, [
    settings.isOpen,
    settings.schedulingEnabled,
    settings.timezone,
    openDates,
    form.scheduleDate,
    maxDelivery,
  ]);
  useEffect(() => {
    if (
      form.scheduleDate &&
      scheduleTimes.length &&
      !scheduleTimes.includes(form.scheduleTime)
    )
      set("scheduleTime", scheduleTimes[0]);
  }, [form.scheduleDate, scheduleTimes]);
  useEffect(() => {
    if (!session?.token) return;
    Promise.all([
      api.get("/auth/me", authHeaders(session.token)),
      api
        .get("/me/addresses", authHeaders(session.token))
        .catch(() => ({ data: [] })),
    ])
      .then(([me, favs]) => {
        const user = me.data.user || {},
          rows = favs.data || [];
        setFavoriteAddresses(rows);
        const preferred = rows.find((a) => a.isDefault);
        if (preferred) setSelectedFavorite(preferred.id);
        setForm((current) => ({
          ...current,
          customerName: current.customerName || user.name || "",
          customerPhone: current.customerPhone || formatPhone(user.phone || ""),
          customerEmail: current.customerEmail || user.email || "",
          postalCode:
            current.postalCode ||
            formatCep(user.postalCode || preferred?.postalCode || ""),
          street: current.street || user.street || preferred?.street || "",
          addressNumber:
            current.addressNumber ||
            user.addressNumber ||
            preferred?.addressNumber ||
            "",
          complement:
            current.complement ||
            user.complement ||
            preferred?.complement ||
            "",
          neighborhood:
            current.neighborhood ||
            user.neighborhood ||
            preferred?.neighborhood ||
            "",
          city: current.city || user.city || preferred?.city || "",
          state: current.state || user.state || preferred?.state || "",
          referencePoint:
            current.referencePoint ||
            user.referencePoint ||
            preferred?.referencePoint ||
            "",
        }));
      })
      .catch(() => {});
  }, [session?.token]);
  useEffect(() => {
    const trackingCode = pendingPayment?.order?.trackingCode;
    const paymentId = pendingPayment?.paymentId;
    if (!trackingCode) return undefined;
    let active = true;
    const check = async () => {
      try {
        const { data } = paymentId
          ? await api.post("/payments/mercadopago/sync", {
              paymentId,
              trackingCode,
            })
          : await api.get(
              `/orders/payment-status/${encodeURIComponent(trackingCode)}`,
            );
        if (!active) return;
        if (data.paymentStatus === "APPROVED") {
          setCart([]);
          setPendingPayment(null);
          setSuccess({ ...pendingPayment.order, ...data });
        } else if (
          ["REJECTED", "CANCELED", "REFUNDED"].includes(data.paymentStatus)
        ) {
          setPendingPayment(null);
          setError(
            "O pagamento não foi aprovado. Revise os dados e gere uma nova tentativa.",
          );
        }
      } catch {}
    };
    const timer = window.setInterval(check, 5_000);
    check();
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [pendingPayment?.order?.trackingCode, pendingPayment?.paymentId]);
  useEffect(() => {
    if (form.fulfillmentType !== "DELIVERY") return undefined;
    const cep = form.postalCode.replace(/\D/g, "");
    if (cep.length !== 8) {
      if (cepStatus.message)
        setCepStatus({ loading: false, found: false, message: "" });
      return undefined;
    }
    const timer = window.setTimeout(() => lookupCep(cep), 420);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.postalCode, form.fulfillmentType]);
  useEffect(() => {
    if (form.fulfillmentType !== "DELIVERY") {
      setQuote({ ok: true, fee: 0, mode: "PICKUP" });
      return;
    }
    const validCep = form.postalCode.replace(/\D/g, "").length === 8;
    const manualFixed = Boolean(form.city && form.neighborhood);
    if (!validCep && !manualFixed) {
      setQuote(null);
      return;
    }
    const timer = window.setTimeout(async () => {
      setQuoteLoading(true);
      try {
        const scheduledAt =
          form.scheduleDate && form.scheduleTime
            ? new Date(
                `${form.scheduleDate}T${form.scheduleTime}:00`,
              ).toISOString()
            : null;
        const { data } = await api.post("/delivery/quote", {
          postalCode: form.postalCode,
          city: form.city,
          state: form.state,
          neighborhood: form.neighborhood,
          deliveryAreaId: form.deliveryAreaId,
          subtotal,
          scheduledAt,
        });
        setQuote(data);
        if (data.area?.id)
          setForm((current) => ({ ...current, deliveryAreaId: data.area.id }));
      } catch (err) {
        setQuote(
          err.response?.data || {
            ok: false,
            message: "Não foi possível calcular a entrega.",
          },
        );
      } finally {
        setQuoteLoading(false);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [
    form.fulfillmentType,
    form.postalCode,
    form.city,
    form.state,
    form.neighborhood,
    form.deliveryAreaId,
    form.scheduleDate,
    form.scheduleTime,
    subtotal,
  ]);

  function applyFavorite(id) {
    setSelectedFavorite(id);
    const row = favoriteAddresses.find((a) => a.id === id);
    if (!row) return;
    setForm((current) => ({
      ...current,
      postalCode: formatCep(row.postalCode || ""),
      street: row.street || "",
      addressNumber: row.addressNumber || "",
      complement: row.complement || "",
      neighborhood: row.neighborhood || "",
      city: row.city || "",
      state: row.state || "",
      referencePoint: row.referencePoint || "",
      deliveryAreaId: "",
    }));
  }

  async function lookupCep(forcedCep) {
    const cep = String(forcedCep || form.postalCode).replace(/\D/g, "");
    if (cep.length !== 8)
      return setCepStatus({
        loading: false,
        found: false,
        message: "Digite os 8 números do CEP.",
      });
    setCepStatus({
      loading: true,
      found: false,
      message: "Consultando CEP...",
    });
    setError("");
    try {
      const { data } = await api.get(`/address/cep/${cep}`);
      setForm((current) => ({
        ...current,
        postalCode: formatCep(data.postalCode || cep),
        street: data.street || current.street,
        neighborhood: data.neighborhood || current.neighborhood,
        city: data.city || current.city,
        state: data.state || current.state,
        deliveryAreaId: "",
      }));
      setCepStatus({
        loading: false,
        found: true,
        message:
          "CEP localizado. Confira cidade, bairro e rua antes de concluir.",
      });
    } catch (err) {
      setCepStatus({
        loading: false,
        found: false,
        message:
          err.response?.data?.message ||
          "CEP não localizado. Você pode preencher o endereço manualmente.",
      });
    }
  }
  async function locateDevice() {
    if (!window.isSecureContext) {
      setError("");
      setCepStatus({
        loading: false,
        found: false,
        message:
          "Para usar sua localização no iPhone, abra a versão publicada do site em HTTPS. Endereços locais como http://192.168... são bloqueados pelo iOS sem exibir a pergunta de permissão. Você ainda pode preencher o endereço manualmente.",
      });
      return;
    }
    if (!navigator.geolocation) {
      setCepStatus({
        loading: false,
        found: false,
        message:
          "Este navegador não disponibiliza localização. Preencha o endereço manualmente.",
      });
      return;
    }
    setLocating(true);
    setError("");
    setCepStatus({
      loading: true,
      found: false,
      message: "Solicitando sua localização ao aparelho...",
    });
    try {
      // Chama a geolocalização diretamente. No Safari/iPhone isso é o que dispara o pedido de permissão quando o site ainda não tem uma decisão salva.
      const getPosition = (options) =>
        new Promise((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, options),
        );
      let position;
      try {
        position = await getPosition({
          enableHighAccuracy: true,
          timeout: 18000,
          maximumAge: 0,
        });
      } catch (firstError) {
        if (firstError?.code === 1) throw firstError;
        position = await getPosition({
          enableHighAccuracy: false,
          timeout: 15000,
          maximumAge: 120000,
        });
      }
      const { latitude, longitude } = position.coords;
      const { data } = await api.get(
        `/address/reverse?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`,
      );
      setForm((current) => ({
        ...current,
        postalCode: data.postalCode
          ? formatCep(data.postalCode)
          : current.postalCode,
        state: data.state || current.state,
        city: data.city || current.city,
        neighborhood: data.neighborhood || current.neighborhood,
        street: data.street || current.street,
        deliveryAreaId: "",
      }));
      setCepStatus({
        loading: false,
        found: true,
        message:
          "Localização encontrada. Confira os dados e complete rua/avenida e número antes de finalizar.",
      });
    } catch (err) {
      const denied = err?.code === 1;
      const unavailable = err?.code === 2;
      setCepStatus({
        loading: false,
        found: false,
        message: denied
          ? "O iPhone/navegador informou que a localização está bloqueada. Se a pergunta não apareceu, a permissão já foi negada anteriormente ou os Serviços de Localização estão desativados. Libere a localização para este navegador/site nas configurações do aparelho e toque novamente. O preenchimento manual continua disponível."
          : unavailable
            ? "O aparelho não conseguiu determinar sua localização agora. Verifique se os Serviços de Localização estão ligados e tente novamente, ou preencha manualmente."
            : "A localização demorou demais para responder. Tente novamente ou preencha o endereço manualmente.",
      });
    } finally {
      setLocating(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!cart.length) return setError("Sua sacola está vazia.");
    if (String(form.customerName || "").trim().length < 2)
      return setError("Informe seu nome antes de confirmar o pedido.");
    if (
      !/^\d{10,11}$/.test(String(form.customerPhone || "").replace(/\D/g, ""))
    )
      return setError(
        "Informe um telefone/WhatsApp válido com DDD antes de confirmar o pedido.",
      );
    if (!form.paymentMethod)
      return setError(
        "A loja não disponibilizou uma forma de pagamento neste momento.",
      );
    if (
      ["CARD", "PIX"].includes(form.paymentMethod) &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        String(form.customerEmail || "").trim(),
      )
    )
      return setError(
        "Informe um e-mail válido para confirmar o pagamento online.",
      );
    const estimatedDelivery =
      form.fulfillmentType === "PICKUP" ? 0 : Number(quote?.ok ? quote.fee : 0);
    const estimatedTotal = Math.max(
      0,
      subtotal + estimatedDelivery - discount,
    );
    if (
      ["CARD", "PIX"].includes(form.paymentMethod) &&
      estimatedTotal < 0.5
    )
      return setError(
        "O Mercado Pago aceita pagamentos online a partir de R$ 0,50. Acrescente itens ou escolha dinheiro.",
      );
    if (form.fulfillmentType === "DELIVERY") {
      const required = [
        ["postalCode", "CEP"],
        ["state", "estado"],
        ["city", "cidade"],
        ["neighborhood", "bairro"],
        ["street", "rua/avenida"],
        ["addressNumber", "número"],
      ];
      const missing = required
        .filter(([key]) => !String(form[key] || "").trim())
        .map(([, label]) => label);
      if (missing.length)
        return setError(
          `Preencha o endereço completo antes de comprar: ${missing.join(", ")}.`,
        );
      if (!quote?.ok || quoteLoading)
        return setError("Aguarde o cálculo da entrega antes de finalizar.");
    }
    if (!settings.isOpen && settings.schedulingEnabled === false)
      return setError(
        "A loja está fechada e não está aceitando agendamentos no momento.",
      );
    if (
      (!settings.isOpen || scheduleWanted) &&
      (!form.scheduleDate || !form.scheduleTime)
    )
      return setError(
        "Escolha o dia e o horário previsto de entrega para o agendamento.",
      );
    setLoading(true);
    try {
      const scheduledAt =
        scheduleWanted && form.scheduleDate && form.scheduleTime
          ? new Date(
              `${form.scheduleDate}T${form.scheduleTime}:00`,
            ).toISOString()
          : null;
      const { data } = await api.post(
        "/orders",
        {
          ...form,
          couponCode: coupon?.code || "",
          scheduledAt,
          saveFavoriteAddress: Boolean(session?.token && saveFavoriteAddress),
          favoriteAddressLabel,
          makeDefaultAddress: false,
          items: cart.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            sizeId: item.sizeId || null,
            flavorIds: item.flavorIds || [],
            optionIds: item.optionIds || [],
            notes: item.notes || "",
          })),
        },
        authHeaders(session?.token),
      );
      saveGuestOrder(data.trackingCode);
      if (data.requiresPayment && data.payment) {
        if (data.paymentStatus === "APPROVED") {
          setCart([]);
          setSuccess(data);
          return;
        }
        setPendingPayment({ ...data.payment, order: data });
        return;
      }
      setCart([]);
      setSuccess(data);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Não foi possível concluir o pedido. Confira os dados e tente novamente.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (pendingPayment)
    return (
      <EmbeddedPaymentStep
        payment={pendingPayment}
        payerEmail={form.customerEmail}
        onApproved={(data) => {
          setCart([]);
          setPendingPayment(null);
          setSuccess({ ...pendingPayment.order, ...data });
        }}
        onRetry={async () => {
          const trackingCode = pendingPayment.order.trackingCode;
          await api.post(
            `/orders/${encodeURIComponent(trackingCode)}/cancel`,
            { reason: "Pagamento reiniciado pelo cliente." },
            authHeaders(session?.token),
          );
          setPendingPayment(null);
        }}
      />
    );

  if (success)
    return (
      <div className="page-shell">
        <main className="container success-page">
          <div className="success-check">
            <Check size={34} />
          </div>
          <span className="eyebrow dark">
            {success.status === "SCHEDULED"
              ? "Pedido agendado"
              : "Pedido recebido"}
          </span>
          <h1>
            {success.status === "SCHEDULED"
              ? "Agendamento confirmado."
              : "Pedido confirmado."}
          </h1>
          <p>
            {success.status === "SCHEDULED"
              ? `Entrega agendada para ${new Date(success.scheduledAt).toLocaleString("pt-BR")}. A loja começa o preparo automaticamente quando entrar no prazo necessário.`
              : session?.user
                ? "Ele já foi salvo em Seus pedidos."
                : "O código abaixo também ficou salvo neste navegador."}
          </p>
          <div className="tracking-code">
            <small>Código de acompanhamento</small>
            <b>{success.trackingCode}</b>
          </div>
          <div className="success-summary">
            <span>
              Total <b>{money(success.total)}</b>
            </span>
            <span>
              Operação{" "}
              <b>
                {success.fulfillmentType === "PICKUP" ? "Retirada" : "Entrega"}
              </b>
            </span>
          </div>
          <div className="success-actions">
            <Link
              className="primary-btn"
              to={`/pedido/${success.trackingCode}`}
            >
              Ver andamento
            </Link>
            <Link className="ghost-dark-btn" to="/seus-pedidos">
              Seus pedidos
            </Link>
          </div>
        </main>
      </div>
    );

  const delivery =
    form.fulfillmentType === "PICKUP" ? 0 : Number(quote?.ok ? quote.fee : 0);
  const checkoutTotal = Math.max(0, subtotal + delivery - discount);
  const onlineBelowMinimum =
    ["CARD", "PIX"].includes(form.paymentMethod) && checkoutTotal < 0.5;
  return (
    <div className="page-shell">
      <div className="container page-top">
        <Link to="/carrinho">
          <ArrowLeft size={16} /> Voltar à sacola
        </Link>
      </div>
      <main className="container checkout-wrap">
        <div className="checkout-heading">
          <span className="eyebrow dark">Finalizar pedido</span>
          <h1 className="page-title">
            Como você quer <em>receber?</em>
          </h1>
          <p>
            Informe o CEP para preencher o endereço automaticamente. O prazo
            configurado pela loja é de aproximadamente{" "}
            <b>{etaText(settings)}</b>.
          </p>
        </div>
        {!settings.isOpen && (
          <section className="store-closed-schedule">
            <CalendarClock />
            <div>
              <b>A loja está fechada agora.</b>
              <p>
                {settings.schedulingEnabled !== false ? (
                  <>
                    Você pode agendar para o próximo horário de entrega
                    disponível. O primeiro horário do dia já soma o prazo máximo
                    de <strong>{maxDelivery} min</strong> ao horário de
                    abertura.
                  </>
                ) : (
                  <>
                    Os agendamentos estão temporariamente desativados. Você
                    ainda pode acompanhar pedidos já feitos em “Seus pedidos”.
                  </>
                )}
              </p>
            </div>
          </section>
        )}
        {!session?.user && (
          <div className="checkout-account-callout">
            <div>
              <UserRound />
              <span>
                <b>Quer salvar este pedido na sua conta?</b>
                <small>
                  Não é obrigatório. Mesmo sem login, o código ficará em “Seus
                  pedidos” neste navegador.
                </small>
              </span>
            </div>
            <Link to="/entrar?next=/checkout">Entrar / criar conta</Link>
          </div>
        )}
        <form className="checkout-layout" onSubmit={submit}>
          <section className="form-card">
            {settings.schedulingEnabled !== false && settings.isOpen && (
              <button
                type="button"
                className={
                  scheduleWanted ? "schedule-choice active" : "schedule-choice"
                }
                onClick={() => {
                  setScheduleWanted((v) => !v);
                  if (scheduleWanted)
                    setForm((c) => ({
                      ...c,
                      scheduleDate: "",
                      scheduleTime: "",
                    }));
                }}
              >
                <CalendarClock />
                <span>
                  <b>{scheduleWanted ? "Pedido agendado" : "Quero agendar"}</b>
                  <small>
                    Escolha o horário previsto para receber. O sistema reserva
                    tempo suficiente para preparo e entrega.
                  </small>
                </span>
              </button>
            )}
            {settings.schedulingEnabled !== false &&
              (!settings.isOpen || scheduleWanted) && (
                <>
                  <h3>
                    <CalendarClock />{" "}
                    {!settings.isOpen
                      ? "Agendamento obrigatório"
                      : "Agendar entrega"}
                  </h3>
                  <div className="form-grid">
                    <label>
                      Dia
                      <select
                        required
                        value={form.scheduleDate}
                        onChange={(e) =>
                          setForm((c) => ({
                            ...c,
                            scheduleDate: e.target.value,
                            scheduleTime: "",
                          }))
                        }
                      >
                        <option value="">Escolha um dia</option>
                        {openDates.map((d) => (
                          <option key={d.value} value={d.value}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Horário previsto de entrega
                      <select
                        required
                        value={form.scheduleTime}
                        onChange={(e) => set("scheduleTime", e.target.value)}
                      >
                        <option value="">Escolha o horário</option>
                        {scheduleTimes.map((time) => (
                          <option key={time} value={time}>
                            {time}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <p className="field-note">
                    O primeiro horário é abertura + prazo máximo ({maxDelivery}{" "}
                    min). Ex.: abre 18:00 e prazo máximo 120 min → primeiro
                    agendamento 20:00.
                  </p>
                </>
              )}
            <h3>
              <MotoIcon /> Tipo de operação
            </h3>
            <div className="operation-options">
              {settings.deliveryEnabled !== false && (
                <button
                  type="button"
                  className={
                    form.fulfillmentType === "DELIVERY"
                      ? "operation-option active"
                      : "operation-option"
                  }
                  onClick={() => set("fulfillmentType", "DELIVERY")}
                >
                  <MotoIcon />
                  <span>
                    <b>Entrega</b>
                    <small>Receba no endereço informado</small>
                  </span>
                  <i>{form.fulfillmentType === "DELIVERY" ? "✓" : ""}</i>
                </button>
              )}
              {settings.pickupEnabled !== false && (
                <button
                  type="button"
                  className={
                    form.fulfillmentType === "PICKUP"
                      ? "operation-option active"
                      : "operation-option"
                  }
                  onClick={() => set("fulfillmentType", "PICKUP")}
                >
                  <Store />
                  <span>
                    <b>Retirada</b>
                    <small>Retire na loja</small>
                  </span>
                  <i>{form.fulfillmentType === "PICKUP" ? "✓" : ""}</i>
                </button>
              )}
            </div>
            <h3>
              <UserRound /> Seus dados
            </h3>
            <p className="checkout-required-note">
              Nome e telefone são obrigatórios para identificar o pedido e
              permitir contato da loja.
            </p>
            <div className="form-grid">
              <label>
                Nome completo <em>*</em>
                <input
                  required
                  minLength="2"
                  maxLength="80"
                  value={form.customerName}
                  onChange={(e) => set("customerName", e.target.value)}
                  placeholder="Seu nome"
                />
              </label>
              <label>
                Telefone / WhatsApp <em>*</em>
                <input
                  required
                  value={form.customerPhone}
                  onChange={(e) =>
                    set("customerPhone", formatPhone(e.target.value))
                  }
                  placeholder="(79) 99999-9999"
                />
              </label>
              {["CARD", "PIX"].includes(form.paymentMethod) && (
                <label className="span-2">
                  E-mail para confirmação do pagamento <em>*</em>
                  <input
                    required
                    type="email"
                    maxLength="180"
                    value={form.customerEmail}
                    onChange={(e) => set("customerEmail", e.target.value)}
                    placeholder="voce@exemplo.com"
                    autoComplete="email"
                  />
                </label>
              )}
            </div>
            {form.fulfillmentType === "DELIVERY" ? (
              <>
                <h3>
                  <MapPin /> Endereço de entrega
                </h3>
                {session?.token && favoriteAddresses.length > 0 && (
                  <div className="checkout-favorite-picker">
                    <label>
                      Endereço favorito
                      <select
                        value={selectedFavorite}
                        onChange={(e) => applyFavorite(e.target.value)}
                      >
                        <option value="">Preencher manualmente</option>
                        {favoriteAddresses.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.label} • {a.neighborhood}
                          </option>
                        ))}
                      </select>
                    </label>
                    <small>
                      Selecionar um favorito preenche os campos abaixo; você
                      ainda pode editar tudo.
                    </small>
                  </div>
                )}
                <div className="cep-lookup-row automatic location-enabled">
                  <label>
                    CEP
                    <input
                      required
                      value={form.postalCode}
                      onChange={(e) =>
                        set("postalCode", formatCep(e.target.value))
                      }
                      placeholder="00000-000"
                      inputMode="numeric"
                      autoComplete="postal-code"
                    />
                  </label>
                  <button
                    type="button"
                    className="location-button"
                    onClick={locateDevice}
                    disabled={locating}
                  >
                    <Crosshair size={17} />
                    {locating ? "Localizando..." : "Usar minha localização"}
                  </button>
                  <div className="auto-cep-state">
                    {cepStatus.loading ? (
                      <>
                        <LoaderCircle className="spin" size={17} />{" "}
                        Consultando...
                      </>
                    ) : (
                      <>
                        <MapPin size={17} /> O CEP é verificado automaticamente
                      </>
                    )}
                  </div>
                </div>
                {cepStatus.message && (
                  <div
                    className={`cep-feedback ${cepStatus.found ? "success" : "warning"}`}
                  >
                    {cepStatus.message}
                  </div>
                )}
                <div className="form-grid address-grid">
                  <label>
                    Estado
                    <input
                      required
                      maxLength="40"
                      value={form.state}
                      onChange={(e) => set("state", e.target.value)}
                      placeholder="SE"
                    />
                  </label>
                  <label>
                    Cidade
                    <input
                      required
                      maxLength="100"
                      value={form.city}
                      onChange={(e) => {
                        set("city", e.target.value);
                        set("deliveryAreaId", "");
                      }}
                      placeholder="Sua cidade"
                    />
                  </label>
                  <label className="span-2">
                    Bairro
                    <input
                      required
                      value={form.neighborhood}
                      onChange={(e) => {
                        set("neighborhood", e.target.value);
                        set("deliveryAreaId", "");
                      }}
                      placeholder="Seu bairro"
                    />
                  </label>
                  <label className="span-2">
                    Rua / avenida
                    <input
                      required
                      maxLength="120"
                      value={form.street}
                      onChange={(e) => set("street", e.target.value)}
                      placeholder="Nome da rua"
                    />
                  </label>
                  <label>
                    Número
                    <input
                      required
                      maxLength="12"
                      value={form.addressNumber}
                      onChange={(e) => set("addressNumber", e.target.value)}
                      placeholder="123"
                    />
                  </label>
                  <label>
                    Complemento <small>(opcional)</small>
                    <input
                      maxLength="100"
                      value={form.complement}
                      onChange={(e) => set("complement", e.target.value)}
                      placeholder="Apto, bloco, casa ou referência complementar"
                    />
                  </label>
                </div>
                {session?.token && (
                  <div className="save-favorite-check">
                    <label className="switch-label">
                      <input
                        type="checkbox"
                        checked={saveFavoriteAddress}
                        onChange={(e) =>
                          setSaveFavoriteAddress(e.target.checked)
                        }
                      />{" "}
                      Salvar este endereço como favorito
                    </label>
                    {saveFavoriteAddress && (
                      <input
                        value={favoriteAddressLabel}
                        onChange={(e) =>
                          setFavoriteAddressLabel(e.target.value)
                        }
                        placeholder="Ex.: Casa, Trabalho..."
                      />
                    )}
                  </div>
                )}
                <div
                  className={`delivery-quote-box ${quote?.ok ? "ready" : quote ? "error" : ""}`}
                >
                  {quoteLoading ? (
                    <>
                      <LoaderCircle className="spin" />
                      <span>
                        <b>Calculando entrega...</b>
                        <small>Aguarde um instante.</small>
                      </span>
                    </>
                  ) : quote?.ok ? (
                    <>
                      <Route />
                      <span>
                        <b>
                          Entrega:{" "}
                          {quote.fee === 0 ? "Grátis" : money(quote.fee)}
                        </b>
                        <small>
                          {quote.mode === "FIXED"
                            ? `Tarifa fixa: ${quote.area?.neighborhood || "área especial"}`
                            : quote.mode === "AUTO_NEIGHBORHOOD_DISTANCE"
                              ? `${quote.neighborhood || form.neighborhood} • distância calculada automaticamente: ${Number(quote.distanceKm || 0).toFixed(1)} km`
                              : quote.distanceKm
                                ? `${quote.area?.neighborhood || form.neighborhood} • distância: ${Number(quote.distanceKm).toFixed(1)} km`
                                : "Entrega confirmada"}
                        </small>
                        {quote.mode === "AUTO_NEIGHBORHOOD_DISTANCE" && (
                          <small className="osm-attribution">
                            Distância estimada com dados © OpenStreetMap
                            contributors.
                          </small>
                        )}
                        {Number(quote.surcharge || 0) > 0 && (
                          <small>
                            Taxa adicional do horário: {money(quote.surcharge)}
                          </small>
                        )}
                        {Number(quote.minimumOrder || 0) > 0 && (
                          <small>
                            Pedido mínimo da região: {money(quote.minimumOrder)}
                          </small>
                        )}
                        {Number(quote.freeDeliveryThreshold || 0) > 0 && (
                          <small>
                            Entrega grátis a partir de{" "}
                            {money(quote.freeDeliveryThreshold)}
                          </small>
                        )}
                      </span>
                    </>
                  ) : quote ? (
                    <>
                      <MapPin />
                      <span>
                        <b>Entrega ainda não confirmada</b>
                        <small>{quote.message}</small>
                      </span>
                    </>
                  ) : (
                    <>
                      <MapPin />
                      <span>
                        <b>Informe o CEP</b>
                        <small>
                          O CEP identifica seu bairro e o sistema calcula
                          automaticamente a distância da loja para essa região.
                          Exceções fixas cadastradas pela loja continuam tendo
                          prioridade.
                        </small>
                      </span>
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="pickup-address">
                <Store />
                <div>
                  <small>Retirada em</small>
                  <b>{settings.address}</b>
                  <p>Acompanhe o andamento em Seus pedidos.</p>
                </div>
              </div>
            )}
            {form.fulfillmentType === "DELIVERY" && (
              <label className="checkout-notes">
                Ponto de referência
                <textarea
                  maxLength="180"
                  value={form.referencePoint}
                  onChange={(e) => set("referencePoint", e.target.value)}
                  placeholder="Ex.: casa ao lado da farmácia, portão azul..."
                />
              </label>
            )}
            <h3>🎟️ Cupom de desconto</h3>
            <div className="coupon-checkout">
              <input
                value={couponCode}
                onChange={(e) => {
                  setCouponCode(e.target.value.toUpperCase());
                  setCoupon(null);
                }}
                placeholder="Digite seu cupom"
              />
              <button
                type="button"
                className="ghost-dark-btn"
                disabled={couponLoading || !couponCode.trim()}
                onClick={async () => {
                  setCouponLoading(true);
                  setError("");
                  try {
                    const { data } = await api.post(
                      "/coupons/validate",
                      {
                        code: couponCode,
                        subtotal,
                        customerPhone: form.customerPhone,
                      },
                      authHeaders(session?.token),
                    );
                    setCoupon(data);
                  } catch (err) {
                    setCoupon(null);
                    setError(err.response?.data?.message || "Cupom inválido.");
                  } finally {
                    setCouponLoading(false);
                  }
                }}
              >
                {couponLoading ? "Validando..." : "Aplicar"}
              </button>
              {coupon && (
                <small className="coupon-ok">
                  ✓ {coupon.description || coupon.code}: -
                  {money(coupon.discount)}
                </small>
              )}
            </div>
            <h3>
              <CreditCard /> Forma de pagamento
            </h3>
            <div className="payment-options expanded">
              {cashAvailable && (
                <button
                  type="button"
                  className={`payment-option ${form.paymentMethod === "CASH" ? "active" : ""}`}
                  onClick={() => set("paymentMethod", "CASH")}
                >
                  <WalletCards size={19} />
                  <span>
                    <b>Dinheiro</b>
                    <small>Pedido é liberado sem pagamento online</small>
                  </span>
                  <i>{form.paymentMethod === "CASH" ? "✓" : ""}</i>
                </button>
              )}
              {onlineAvailable && (
                <>
                  <button
                    type="button"
                    className={`payment-option ${form.paymentMethod === "PIX" ? "active" : ""}`}
                    onClick={() => set("paymentMethod", "PIX")}
                  >
                    <QrCode size={19} />
                    <span>
                      <b>Pix online</b>
                      <small>QR Code e copia e cola nesta página</small>
                    </span>
                    <i>{form.paymentMethod === "PIX" ? "✓" : ""}</i>
                  </button>
                  <button
                    type="button"
                    className={`payment-option ${form.paymentMethod === "CARD" ? "active" : ""}`}
                    onClick={() => set("paymentMethod", "CARD")}
                  >
                    <CreditCard size={19} />
                    <span>
                      <b>Crédito ou débito</b>
                      <small>Formulário protegido dentro da pizzaria</small>
                    </span>
                    <i>{form.paymentMethod === "CARD" ? "✓" : ""}</i>
                  </button>
                </>
              )}
              {customPaymentMethods.map((method) => {
                const value = `CUSTOM:${method.id}`;
                return (
                  <button
                    key={method.id}
                    type="button"
                    className={`payment-option ${form.paymentMethod === value ? "active" : ""}`}
                    onClick={() => {
                      set("paymentMethod", value);
                      set("changeFor", "");
                    }}
                  >
                    <CreditCard size={19} />
                    <span>
                      <b>{method.label}</b>
                      <small>Pagamento combinado com a loja</small>
                    </span>
                    <i>{form.paymentMethod === value ? "✓" : ""}</i>
                  </button>
                );
              })}
            </div>
            {settings.onlinePaymentEnabled &&
              !settings.onlinePaymentConfigured && (
                <div className="cep-feedback warning">
                  Pagamento online está habilitado, mas faltam Public Key,
                  Access Token, assinatura do webhook e/ou URLs HTTPS públicas.
                </div>
              )}
            {onlineBelowMinimum && (
              <div className="cep-feedback warning">
                O Mercado Pago aceita Pix e cartão a partir de R$ 0,50.
              </div>
            )}
            {form.paymentMethod === "CASH" && (
              <label className="cash-field">
                Troco para
                <input
                  value={form.changeFor}
                  onChange={(e) => set("changeFor", e.target.value)}
                  placeholder="Ex.: R$ 100,00"
                />
              </label>
            )}
            {["CARD", "PIX"].includes(form.paymentMethod) && (
              <div className="online-payment-note">
                <ShieldCheck />
                <span>
                  <b>Pagamento transparente e protegido</b>
                  <small>
                    Tudo acontece nesta página. Os dados sensíveis do cartão são
                    tokenizados pelo Mercado Pago e não passam pelo servidor da
                    pizzaria. O pedido só entra na operação após a aprovação.
                  </small>
                </span>
              </div>
            )}
            {error && <div className="form-error">{error}</div>}
          </section>
          <aside className="summary-card checkout-summary">
            <span className="summary-kicker">Resumo</span>
            <h3>
              {cart.length} {cart.length === 1 ? "item" : "itens"}
            </h3>
            <div className="summary-items">
              {cart.map((item) => (
                <p key={item.cartKey || item.productId}>
                  <span>
                    {item.quantity}× {item.name}
                  </span>
                  <b>{money(item.price * item.quantity)}</b>
                </p>
              ))}
            </div>
            <hr />
            <div>
              <span>Subtotal</span>
              <b>{money(subtotal)}</b>
            </div>
            <div>
              <span>
                {form.fulfillmentType === "PICKUP" ? "Retirada" : "Entrega"}
              </span>
              <b>
                {form.fulfillmentType === "DELIVERY" && !quote?.ok
                  ? "A calcular"
                  : delivery === 0
                    ? "Grátis"
                    : money(delivery)}
              </b>
            </div>
            {discount > 0 && (
              <div>
                <span>Desconto</span>
                <b>-{money(discount)}</b>
              </div>
            )}
            <div className="summary-total">
              <span>Total</span>
              <b>
                {form.fulfillmentType === "DELIVERY" && !quote?.ok
                  ? money(Math.max(0, subtotal - discount))
                  : money(Math.max(0, subtotal + delivery - discount))}
              </b>
            </div>
            <div className="summary-area">
              <Clock3Fallback />
              <span>Prazo estimado: {etaText(settings)}</span>
            </div>
            {form.scheduleDate && form.scheduleTime && (
              <div className="summary-area">
                <CalendarClock size={14} />
                <span>
                  Entrega agendada para{" "}
                  {new Date(
                    `${form.scheduleDate}T${form.scheduleTime}:00`,
                  ).toLocaleString("pt-BR")}
                </span>
              </div>
            )}
            <button
              disabled={
                loading ||
                !cart.length ||
                !customerInfoComplete ||
                !form.paymentMethod ||
                onlineBelowMinimum ||
                (!settings.isOpen && settings.schedulingEnabled === false) ||
                (form.fulfillmentType === "DELIVERY" &&
                  (!quote?.ok || !deliveryAddressComplete))
              }
              className="primary-btn full"
            >
              {loading
                ? "Processando..."
                : !settings.isOpen && settings.schedulingEnabled === false
                  ? "Loja fechada"
                  : !settings.isOpen || scheduleWanted
                    ? ["CARD", "PIX"].includes(form.paymentMethod)
                      ? "Agendar e pagar aqui"
                      : "Agendar pedido"
                    : ["CARD", "PIX"].includes(form.paymentMethod)
                      ? "Continuar para pagamento"
                      : "Confirmar pedido"}{" "}
              <Check size={17} />
            </button>
            <small>
              Produtos, promoções, sabores e frete são validados novamente pelo
              backend.
            </small>
          </aside>
        </form>
      </main>
    </div>
  );
}

function Clock3Fallback() {
  return <CalendarClock size={14} />;
}

const CARD_PAYMENT_CUSTOMIZATION = Object.freeze({
  paymentMethods: {
    maxInstallments: 12,
    types: { included: ["credit_card", "debit_card"] },
  },
});

function EmbeddedPaymentStep({ payment, payerEmail, onApproved, onRetry }) {
  const [paymentError, setPaymentError] = useState("");
  const [paymentMessage, setPaymentMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const onApprovedRef = useRef(onApproved);
  const cardRequestRef = useRef(null);
  const order = payment.order;
  const isPix = payment.type === "PIX";
  const qrImage = payment.qrCodeBase64
    ? `data:image/png;base64,${String(payment.qrCodeBase64).replace(/\s/g, "")}`
    : "";
  const cardInitialization = useMemo(
    () => ({
      amount: Number(payment.amount),
      payer: { email: payerEmail },
    }),
    [payment.amount, payerEmail],
  );

  useEffect(() => {
    onApprovedRef.current = onApproved;
  }, [onApproved]);

  async function copyPix() {
    try {
      await navigator.clipboard.writeText(payment.qrCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setPaymentError(
        "Não foi possível copiar automaticamente. Selecione o código abaixo e copie.",
      );
    }
  }

  const submitCard = useCallback((formData) => {
    if (cardRequestRef.current) return cardRequestRef.current;
    setPaymentError("");
    setPaymentMessage("Processando o cartão com segurança...");
    const request = (async () => {
      try {
        const { data } = await api.post("/payments/mercadopago/card", {
          ...formData,
          trackingCode: order.trackingCode,
          payer: {
            ...(formData.payer || {}),
            email: formData.payer?.email || payerEmail,
          },
        });
        if (data.paymentStatus === "APPROVED") {
          onApprovedRef.current?.(data);
          return;
        }
        if (["REJECTED", "CANCELED", "REFUNDED"].includes(data.paymentStatus))
          throw new Error(
            "Pagamento recusado. Confira os dados ou tente outro cartão.",
          );
        setPaymentMessage(
          "Pagamento em análise. Esta tela será atualizada automaticamente.",
        );
      } catch (error) {
        const message =
          error.response?.data?.message ||
          error.message ||
          "Não foi possível processar o cartão.";
        setPaymentMessage("");
        setPaymentError(message);
        throw error;
      }
    })().finally(() => {
      if (cardRequestRef.current === request) cardRequestRef.current = null;
    });
    cardRequestRef.current = request;
    return request;
  }, [order.trackingCode, payerEmail]);

  async function restartPayment() {
    if (retrying) return;
    setRetrying(true);
    setPaymentError("");
    try {
      await onRetry();
    } catch (error) {
      setPaymentError(
        error.response?.data?.message ||
          "Não foi possível encerrar a tentativa anterior. Aguarde e tente novamente.",
      );
    } finally {
      setRetrying(false);
    }
  }

  const handleCardReady = useCallback(() => setPaymentMessage(""), []);
  const handleCardError = useCallback((brickError) => {
    const detail = brickError?.message || brickError?.cause;
    setPaymentError(
      detail
        ? `Não foi possível carregar o cartão: ${String(detail)}`
        : "Não foi possível carregar o formulário do cartão.",
    );
  }, []);

  return (
    <div className="page-shell embedded-payment-page">
      <main className="container embedded-payment-shell">
        <div className="embedded-payment-heading">
          <span className="eyebrow dark">Pagamento seguro</span>
          <h1>{isPix ? "Pague com Pix" : "Pague com cartão"}</h1>
          <p>
            Pedido <b>#{order.shortCode}</b> • Total <b>{money(order.total)}</b>
          </p>
        </div>

        <section className="embedded-payment-card">
          {isPix ? (
            <div className="pix-payment-grid">
              <div className="pix-code-card">
                {qrImage ? (
                  <img src={qrImage} alt="QR Code Pix do pedido" />
                ) : (
                  <QrCode size={92} />
                )}
              </div>
              <div className="pix-payment-copy">
                <span className="payment-secure-badge">
                  <ShieldCheck size={16} /> Gerado pelo Mercado Pago
                </span>
                <h2>Escaneie ou use o Pix copia e cola</h2>
                <p>
                  Abra o aplicativo do seu banco, escolha Pix e escaneie o QR
                  Code. A confirmação aparece aqui automaticamente.
                </p>
                <textarea
                  readOnly
                  value={payment.qrCode || "QR Code em processamento"}
                  aria-label="Código Pix copia e cola"
                  onFocus={(event) => event.currentTarget.select()}
                />
                <button
                  type="button"
                  className="primary-btn"
                  disabled={!payment.qrCode}
                  onClick={copyPix}
                >
                  {copied ? <Check size={17} /> : <Copy size={17} />}
                  {copied ? "Código copiado" : "Copiar código Pix"}
                </button>
                {payment.expiresAt && (
                  <small>
                    Válido até {new Date(payment.expiresAt).toLocaleString("pt-BR")}.
                  </small>
                )}
              </div>
            </div>
          ) : (
            <div className="card-brick-wrap">
              <div className="payment-security-copy">
                <ShieldCheck />
                <div>
                  <b>Crédito e débito sem sair da pizzaria</b>
                  <small>
                    O componente oficial do Mercado Pago criptografa os dados.
                    A Master Pizzaria recebe somente um token temporário.
                  </small>
                </div>
              </div>
              <CardPayment
                key={`${order.trackingCode}-${payment.amount}`}
                initialization={cardInitialization}
                customization={CARD_PAYMENT_CUSTOMIZATION}
                onSubmit={submitCard}
                onReady={handleCardReady}
                onError={handleCardError}
              />
            </div>
          )}

          {(paymentMessage || isPix) && (
            <div className="payment-live-status" aria-live="polite">
              <RefreshCw className="spin" size={17} />
              {paymentMessage || "Aguardando a confirmação do pagamento..."}
            </div>
          )}
          {paymentError && <div className="form-error">{paymentError}</div>}
        </section>

        <div className="embedded-payment-actions">
          <Link
            className="ghost-dark-btn"
            to={`/pedido/${order.trackingCode}`}
          >
            Acompanhar pedido
          </Link>
          {!isPix && paymentError && (
            <button
              type="button"
              className="text-button"
              disabled={retrying}
              onClick={restartPayment}
            >
              {retrying ? "Encerrando tentativa..." : "Voltar e tentar novamente"}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
