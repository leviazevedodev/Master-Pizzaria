import axios from "axios";

const configuredApi = String(import.meta.env.VITE_API_URL || "").trim();
// Em desenvolvimento, sempre usa a mesma origem do Vite. Isso evita que celulares tentem acessar localhost/porta 3333 diretamente.
export const API_URL = import.meta.env.DEV ? "/api" : configuredApi || "/api";
export const API_ORIGIN = API_URL.startsWith("http")
  ? API_URL.replace(/\/api\/?$/, "")
  : window.location.origin;

export const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const code = error?.response?.data?.code;
    if (status === 401 && ["INVALID_SESSION", "AUTH_REQUIRED"].includes(code)) {
      try {
        localStorage.removeItem("master-pizza-session");
        sessionStorage.removeItem("master-pizza-session");
        sessionStorage.setItem(
          "master-pizza-auth-message",
          "Sua sessão expirou. Entre novamente para continuar no painel.",
        );
      } catch {}
      window.dispatchEvent(new CustomEvent("master-pizza-session-expired"));
    }
    return Promise.reject(error);
  },
);

export function authHeaders(token) {
  return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
}

export function mediaUrl(value) {
  if (!value) return "";
  if (value.startsWith("/api/"))
    return API_URL.startsWith("http") ? `${API_ORIGIN}${value}` : value;
  return value;
}

export const adminHeaders = authHeaders;

export function trustedPaymentUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      /(^|\.)mercadopago\.(com|com\.br|com\.ar|com\.mx|com\.co|com\.pe|com\.uy|cl)$/.test(
        url.hostname.toLowerCase(),
      )
      ? url.href
      : "";
  } catch {
    return "";
  }
}
