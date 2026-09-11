import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Clock3, Menu, Phone, ShoppingBag, UserRound, X } from "lucide-react";
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

  return (
    <header className="topbar">
      <div className="container nav">
        <div className="brand-status-wrap">
          <Link
            className="brand"
            to="/"
            onClick={close}
            aria-label="Master Pizzaria - início"
          >
            <img
              src={
                mediaUrl(settings?.logoImage) || "/images/master-pizzaria-logo.png"
              }
              alt="Master Pizzaria"
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
    </header>
  );
}
