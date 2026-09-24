import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Clock3,
  Download,
  Ellipsis,
  Menu,
  Phone,
  Share,
  ShoppingBag,
  SquarePlus,
  UserRound,
  X,
} from "lucide-react";
import { mediaUrl } from "../lib/api";

export default function Header({
  cartCount,
  settings,
  storeHours = [],
  session,
  cartPath = "/carrinho",
  menuPath = "/cardapio",
}) {
  const [open, setOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showIosInstall, setShowIosInstall] = useState(false);
  const [installed, setInstalled] = useState(() =>
    Boolean(
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
        window.navigator.standalone,
    ),
  );
  const close = () => setOpen(false);
  const accountPath = session?.user?.isAdmin
    ? "/gestao"
    : session?.user
      ? "/minha-conta"
      : "/entrar";
  const today = useMemo(
    () =>
      storeHours.find((item) => Number(item.dayOfWeek) === new Date().getDay()),
    [storeHours],
  );
  const todayText = today
    ? today.closed
      ? `${today.label}: fechado`
      : `${today.label}: ${today.openTime}–${today.closeTime}`
    : settings?.openingHours;
  const isOpen = Boolean(settings?.isOpen);
  const storeName = String(settings?.storeName || "").trim() || "Pizzaria";
  const storeLogo =
    mediaUrl(settings?.logoImage) || "/images/store-placeholder.svg";
  const isIos = useMemo(() => {
    const agent = window.navigator.userAgent || "";
    return (
      /iphone|ipad|ipod/i.test(agent) ||
      (window.navigator.platform === "MacIntel" &&
        window.navigator.maxTouchPoints > 1)
    );
  }, []);
  const showInstallAction =
    settings?.pwaEnabled !== false &&
    !installed &&
    Boolean(isIos || installPrompt);

  useEffect(() => {
    const captureInstall = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      setInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", captureInstall);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", captureInstall);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  async function installApp() {
    if (isIos) {
      setShowIosInstall(true);
      return;
    }
    if (!installPrompt) {
      return;
    }
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice?.outcome === "accepted") setInstalled(true);
    } finally {
      setInstallPrompt(null);
    }
  }

  return (
    <header
      className={`topbar ${showInstallAction ? "has-install-action" : ""}`}
    >
      <div className="container nav">
        <div className="brand-status-wrap">
          <Link
            className="brand"
            to="/"
            onClick={close}
            aria-label={`${storeName} - início`}
          >
            <img
              src={storeLogo}
              alt={storeName}
            />
          </Link>
          <div
            className={`store-live-status ${isOpen ? "open" : "closed"}`}
            title={todayText || "Horário da loja"}
          >
            <span className="live-dot" />
            <div>
              <b>{isOpen ? "Aberto" : "Fechado"}</b>
              <small>
                <Clock3 size={12} />
                {isOpen
                  ? todayText || "Consulte o horário"
                  : settings?.schedulingEnabled !== false
                    ? "Fechado • agendamento disponível"
                    : "Fechado no momento"}
              </small>
            </div>
          </div>
        </div>
        <nav className={`nav-links ${open ? "open" : ""}`}>
          <Link to="/" onClick={close}>
            Início
          </Link>
          <Link to={menuPath} onClick={close}>
            Cardápio
          </Link>
          <Link to="/seus-pedidos" onClick={close}>
            Seus pedidos
          </Link>
          <Link to="/#sobre" onClick={close}>
            Sobre
          </Link>
        </nav>
        <div className="nav-actions">
          {showInstallAction && (
              <button
                type="button"
                className="install-app-button"
                onClick={installApp}
                title={`Instalar ${storeName}`}
                aria-label={`Instalar ${storeName}`}
              >
                <Download size={17} />
              </button>
            )}
          {String(settings?.phone || "").trim() && (
            <a
              className="phone-link"
              href={`tel:${String(settings.phone).replace(/\D/g, "")}`}
            >
              <Phone size={16} />
              <span>{settings.phone}</span>
            </a>
          )}
          <Link
            className="account-button"
            to={accountPath}
            title={
              session?.user
                ? `Conta de ${session.user.name}`
                : "Entrar ou criar conta"
            }
          >
            <UserRound size={18} />
            <span>
              {session?.user
                ? session.user.isAdmin
                  ? "Gestão"
                  : "Minha conta"
                : "Entrar"}
            </span>
          </Link>
          <Link className="cart-button" to={cartPath}>
            <ShoppingBag size={19} />
            <span>Sacola</span>
            {cartCount > 0 && <b>{cartCount}</b>}
          </Link>
          <button
            className="mobile-toggle"
            onClick={() => setOpen((value) => !value)}
            aria-label="Abrir menu"
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </div>
      {showIosInstall && (
        <div
          className="pwa-install-backdrop"
          role="presentation"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setShowIosInstall(false)
          }
        >
          <section
            className="pwa-install-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pwa-install-title"
          >
            <button
              type="button"
              className="pwa-install-close"
              onClick={() => setShowIosInstall(false)}
              aria-label="Fechar tutorial de instalação"
            >
              <X size={20} />
            </button>
            <img src={storeLogo} alt="" />
            <span>Instalar aplicativo</span>
            <h2 id="pwa-install-title">Instalar {storeName}</h2>
            <p>
              Adicione <strong>{storeName}</strong> à sua Tela de Início.
            </p>
            <ol>
              <li>
                <Ellipsis size={21} />
                <span>
                  Toque nos <strong>três pontos</strong> no Safari.
                </span>
              </li>
              <li>
                <Share size={21} />
                <span>
                  Toque em <strong>Compartilhar</strong>.
                </span>
              </li>
              <li>
                <SquarePlus size={21} />
                <span>
                  Escolha <strong>Adicionar à Tela de Início</strong>.
                </span>
              </li>
              <li>
                <Download size={21} />
                <span>
                  Toque em <strong>Adicionar</strong>.
                </span>
              </li>
            </ol>
            <button
              type="button"
              className="primary-btn"
              onClick={() => setShowIosInstall(false)}
            >
              Entendi
            </button>
          </section>
        </div>
      )}
    </header>
  );
}
