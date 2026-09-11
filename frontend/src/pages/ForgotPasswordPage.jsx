import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  MessageCircle,
  Phone,
  ShieldCheck,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../lib/api";

export default function ForgotPasswordPage({ settings }) {
  const location = useLocation();
  const [token] = useState(
    () =>
      new URLSearchParams(window.location.hash.slice(1)).get("token") ||
      new URLSearchParams(window.location.search).get("token") ||
      "",
  );
  useEffect(() => {
    if (
      token &&
      (window.location.hash || window.location.search.includes("token="))
    )
      window.history.replaceState({}, "", location.pathname);
  }, [location.pathname, token]);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const supportNumber = String(settings?.whatsappPrimary || "").trim();
  const supportPhone = String(settings?.phone || "").trim();
  const supportText = encodeURIComponent(
    "Olá! Preciso de ajuda para recuperar o acesso à minha conta da Master Pizzaria.",
  );

  async function requestReset(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/forgot-password", { identifier });
      setMessage(
        data.emailConfigured
          ? "Se a conta existir, enviaremos um link para o e-mail cadastrado. O link expira em 30 minutos."
          : supportNumber || supportPhone
            ? "Solicitação registrada. O envio automático por e-mail ainda não está configurado nesta instalação; use um dos canais de suporte abaixo."
            : "Solicitação registrada. O envio automático por e-mail ainda não está configurado nesta instalação.",
      );
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Não foi possível iniciar a recuperação agora.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (password !== confirm) return setError("As senhas precisam ser iguais.");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/reset-password", {
        token,
        password,
      });
      setMessage(data.message || "Senha alterada com sucesso.");
      setPassword("");
      setConfirm("");
    } catch (err) {
      setError(
        err.response?.data?.message || "Não foi possível redefinir a senha.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page reset-page">
      <div className="auth-shell container">
        <section className="auth-brand-panel">
          <Link className="back-link light-link" to="/entrar">
            <ArrowLeft size={15} /> Voltar ao login
          </Link>
          <img src="/images/master-pizzaria-logo.png" alt="Master Pizzaria" />
          <span className="eyebrow">Recuperação de acesso</span>
          <h1>Volte para sua conta com segurança.</h1>
          <p>
            O link automático por e-mail usa token temporário e expira em 30
            minutos. Senhas antigas nunca são enviadas ou exibidas.
          </p>
          <div className="auth-benefits">
            <span>
              <ShieldCheck />
              <b>Token de uso único</b>
              <small>Não reutilizamos links de recuperação.</small>
            </span>
            <span>
              <Mail />
              <b>Recuperação por e-mail</b>
              <small>
                Pode funcionar com provedor de e-mail em plano gratuito.
              </small>
            </span>
            {supportNumber && (
              <span>
                <MessageCircle />
                <b>Suporte humano</b>
                <small>Se necessário, fale com a loja pelo WhatsApp.</small>
              </span>
            )}
          </div>
        </section>
        <section className="auth-card">
          {token ? (
            <form className="auth-form" onSubmit={resetPassword}>
              <div className="auth-title">
                <span className="eyebrow dark">Nova senha</span>
                <h2>Crie uma nova senha.</h2>
                <p>Use pelo menos 8 caracteres, uma letra e um número.</p>
              </div>
              <label>
                Nova senha
                <div className="input-with-icon">
                  <LockKeyhole size={18} />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength="8"
                  />
                  <button
                    type="button"
                    className="password-visibility"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? "Ocultar senhas" : "Mostrar senhas"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>
              <label>
                Confirmar nova senha
                <div className="input-with-icon">
                  <LockKeyhole size={18} />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    minLength="8"
                  />
                </div>
              </label>
              {error && (
                <div className="auth-error">
                  <b>{error}</b>
                </div>
              )}
              {message && (
                <div className="auth-success">
                  <CheckCircle2 />
                  <b>{message}</b>
                </div>
              )}
              <button className="primary-btn full" disabled={loading}>
                {loading ? "Alterando..." : "Alterar senha"}
              </button>
              {message && (
                <Link className="ghost-dark-btn full" to="/entrar">
                  Ir para o login
                </Link>
              )}
            </form>
          ) : (
            <form className="auth-form" onSubmit={requestReset}>
              <div className="auth-title">
                <span className="eyebrow dark">Esqueceu a senha?</span>
                <h2>Recupere sua conta.</h2>
                <p>
                  Informe o e-mail ou telefone cadastrado. Por segurança, a
                  resposta não confirma se uma conta existe.
                </p>
              </div>
              <label>
                E-mail ou telefone
                <div className="input-with-icon">
                  <Mail size={18} />
                  <input
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="email@exemplo.com ou (79) 99999-9999"
                    required
                  />
                </div>
              </label>
              {error && (
                <div className="auth-error">
                  <b>{error}</b>
                </div>
              )}
              {message && (
                <div className="auth-success">
                  <CheckCircle2 />
                  <b>{message}</b>
                </div>
              )}
              <button className="primary-btn full" disabled={loading}>
                {loading ? "Enviando..." : "Enviar instruções por e-mail"}
              </button>
              {(supportNumber || supportPhone) && (
                <div className="recovery-support">
                  <small>Prefere falar com a loja?</small>
                  {supportNumber && (
                    <a
                      href={`https://wa.me/${supportNumber.replace(/\D/g, "")}?text=${supportText}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MessageCircle size={17} /> Pedir ajuda pelo WhatsApp
                    </a>
                  )}
                  {supportPhone && (
                    <a href={`tel:${supportPhone.replace(/\D/g, "")}`}>
                      <Phone size={17} /> Ligar para a loja
                    </a>
                  )}
                </div>
              )}
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
