import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  LockKeyhole,
  Mail,
  Phone,
  ShieldCheck,
  UserPlus,
  UserRound,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { formatPhone } from "../lib/format";

export default function AuthPage({
  session,
  onSession,
  initialMode = "login",
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState(initialMode);
  const [loginForm, setLoginForm] = useState({ identifier: "", password: "" });
  const [registerForm, setRegisterForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sessionNotice] = useState(() => {
    try {
      const msg = sessionStorage.getItem("master-pizza-auth-message") || "";
      sessionStorage.removeItem("master-pizza-auth-message");
      return msg;
    } catch {
      return "";
    }
  });

  const next = useMemo(() => {
    const requested = new URLSearchParams(location.search).get("next") || "";
    return requested.startsWith("/") && !requested.startsWith("//")
      ? requested
      : "";
  }, [location.search]);
  const registrationSpotlight =
    mode === "login" &&
    ["IDENTIFIER_NOT_FOUND", "INVALID_IDENTIFIER"].includes(error?.code);

  useEffect(() => {
    if (!session?.user) return;
    navigate(session.user.isAdmin ? "/gestao" : next || "/minha-conta", {
      replace: true,
    });
  }, [session, navigate, next]);

  function switchMode(nextMode) {
    setMode(nextMode);
    setError(null);
  }

  async function login(event) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", loginForm);
      onSession({ token: data.token, user: data.user });
      navigate(data.user.isAdmin ? "/gestao" : next || "/minha-conta", {
        replace: true,
      });
    } catch (err) {
      setError({
        code: err.response?.data?.code || "LOGIN_ERROR",
        field: err.response?.data?.field,
        message:
          err.response?.data?.message || "Não foi possível entrar agora.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function register(event) {
    event.preventDefault();
    setError(null);
    if (registerForm.password !== registerForm.confirmPassword) {
      setError({
        code: "PASSWORD_MISMATCH",
        field: "confirmPassword",
        message: "As duas senhas precisam ser iguais.",
      });
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post("/auth/register", {
        name: registerForm.name,
        email: registerForm.email,
        phone: registerForm.phone,
        password: registerForm.password,
      });
      onSession({ token: data.token, user: data.user });
      navigate(next || "/minha-conta", { replace: true });
    } catch (err) {
      setError({
        code: err.response?.data?.code || "REGISTER_ERROR",
        field: err.response?.data?.field,
        message:
          err.response?.data?.message ||
          "Não foi possível criar sua conta agora.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-shell container">
        <section className="auth-brand-panel">
          <Link className="back-link light-link" to="/">
            <ArrowLeft size={15} /> Voltar ao cardápio
          </Link>
          <img src="/images/master-pizza-logo.jpg" alt="Master Pizza" />
          <span className="eyebrow">Conta Master</span>
          <h1>Seu pedido fica ainda mais fácil na próxima vez.</h1>
          <p>
            Entre para guardar o histórico dos seus pedidos, acompanhar compras
            e repetir seus favoritos em poucos cliques.
          </p>
          <div className="auth-benefits">
            <span>
              <CheckCircle2 />
              <b>Histórico de pedidos</b>
              <small>Veja o que você pediu e quando.</small>
            </span>
            <span>
              <ArrowRight />
              <b>Pedir novamente</b>
              <small>Leve os mesmos itens direto para a sacola.</small>
            </span>
            <span>
              <ShieldCheck />
              <b>Acesso protegido</b>
              <small>Sua senha é armazenada de forma criptografada.</small>
            </span>
          </div>
        </section>

        <section className="auth-card">
          <div className="auth-tabs">
            <button
              className={mode === "login" ? "active" : ""}
              onClick={() => switchMode("login")}
            >
              Entrar
            </button>
            <button
              className={mode === "register" ? "active" : ""}
              onClick={() => switchMode("register")}
            >
              Criar conta
            </button>
          </div>

          {mode === "login" ? (
            <form onSubmit={login} className="auth-form" noValidate>
              <div className="auth-title">
                <span className="eyebrow dark">Bem-vindo de volta</span>
                <h2>Acesse sua conta.</h2>
                <p>
                  Use o seu e-mail <strong>ou</strong> número de telefone
                  cadastrado.
                </p>
              </div>
              {sessionNotice && (
                <div className="auth-session-notice">
                  <ShieldCheck size={17} />
                  <span>
                    <b>Sessão encerrada</b>
                    <small>{sessionNotice}</small>
                  </span>
                </div>
              )}
              <label
                className={error?.field === "identifier" ? "field-error" : ""}
              >
                E-mail ou telefone
                <div className="input-with-icon">
                  <UserRound size={18} />
                  <input
                    autoComplete="username"
                    value={loginForm.identifier}
                    onChange={(e) =>
                      setLoginForm({ ...loginForm, identifier: e.target.value })
                    }
                    placeholder="email@exemplo.com ou (79) 99999-9999"
                    required
                  />
                </div>
              </label>
              <label
                className={error?.field === "password" ? "field-error" : ""}
              >
                Senha
                <div className="input-with-icon">
                  <LockKeyhole size={18} />
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={loginForm.password}
                    onChange={(e) =>
                      setLoginForm({ ...loginForm, password: e.target.value })
                    }
                    placeholder="Sua senha"
                    required
                  />
                </div>
              </label>
              {error && (
                <div className="auth-error">
                  <b>{error.message}</b>
                  {error.code === "IDENTIFIER_NOT_FOUND" && (
                    <span>
                      Você pode criar sua conta agora em menos de um minuto.
                    </span>
                  )}
                </div>
              )}
              <div className="forgot-row">
                <Link to="/esqueci-a-senha">Esqueceu a senha?</Link>
              </div>
              <button
                disabled={loading}
                className="primary-btn full auth-submit"
              >
                {loading ? "Entrando..." : "Entrar na conta"}{" "}
                <ArrowRight size={17} />
              </button>

              <div
                className={`signup-spotlight ${registrationSpotlight ? "strong" : ""}`}
              >
                <div className="signup-icon">
                  <UserPlus />
                </div>
                <div>
                  <small>Ainda não tem conta?</small>
                  <b>Cadastre-se e salve seus pedidos.</b>
                  <p>É rápido, gratuito e facilita suas próximas compras.</p>
                </div>
                <button type="button" onClick={() => switchMode("register")}>
                  Criar minha conta <ArrowRight size={15} />
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={register} className="auth-form" noValidate>
              <div className="auth-title">
                <span className="eyebrow dark">Cadastro rápido</span>
                <h2>Crie sua conta.</h2>
                <p>
                  Seus pedidos feitos enquanto estiver conectado aparecerão no
                  seu histórico.
                </p>
              </div>
              <label className={error?.field === "name" ? "field-error" : ""}>
                Nome completo
                <div className="input-with-icon">
                  <UserRound size={18} />
                  <input
                    autoComplete="name"
                    value={registerForm.name}
                    onChange={(e) =>
                      setRegisterForm({ ...registerForm, name: e.target.value })
                    }
                    placeholder="Seu nome"
                    required
                  />
                </div>
              </label>
              <div className="auth-form-grid">
                <label
                  className={error?.field === "email" ? "field-error" : ""}
                >
                  E-mail
                  <div className="input-with-icon">
                    <Mail size={18} />
                    <input
                      type="email"
                      autoComplete="email"
                      value={registerForm.email}
                      onChange={(e) =>
                        setRegisterForm({
                          ...registerForm,
                          email: e.target.value,
                        })
                      }
                      placeholder="email@exemplo.com"
                      required
                    />
                  </div>
                </label>
                <label
                  className={error?.field === "phone" ? "field-error" : ""}
                >
                  Telefone
                  <div className="input-with-icon">
                    <Phone size={18} />
                    <input
                      autoComplete="tel"
                      value={registerForm.phone}
                      onChange={(e) =>
                        setRegisterForm({
                          ...registerForm,
                          phone: formatPhone(e.target.value),
                        })
                      }
                      placeholder="(79) 99999-9999"
                      required
                    />
                  </div>
                </label>
              </div>
              <div className="auth-form-grid">
                <label
                  className={error?.field === "password" ? "field-error" : ""}
                >
                  Senha
                  <div className="input-with-icon">
                    <LockKeyhole size={18} />
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={registerForm.password}
                      onChange={(e) =>
                        setRegisterForm({
                          ...registerForm,
                          password: e.target.value,
                        })
                      }
                      placeholder="Mínimo 12 caracteres"
                      minLength="12"
                      required
                    />
                  </div>
                </label>
                <label
                  className={
                    error?.field === "confirmPassword" ? "field-error" : ""
                  }
                >
                  Confirmar senha
                  <div className="input-with-icon">
                    <LockKeyhole size={18} />
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={registerForm.confirmPassword}
                      onChange={(e) =>
                        setRegisterForm({
                          ...registerForm,
                          confirmPassword: e.target.value,
                        })
                      }
                      placeholder="Repita a senha"
                      required
                    />
                  </div>
                </label>
              </div>
              <small className="password-hint">
                Use pelo menos 12 caracteres, incluindo uma letra e um número.
              </small>
              {error && (
                <div className="auth-error">
                  <b>{error.message}</b>
                </div>
              )}
              <button
                disabled={loading}
                className="primary-btn full auth-submit"
              >
                {loading ? "Criando conta..." : "Criar conta grátis"}{" "}
                <UserPlus size={17} />
              </button>
              <button
                type="button"
                className="auth-text-button"
                onClick={() => switchMode("login")}
              >
                Já tenho uma conta — entrar
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
