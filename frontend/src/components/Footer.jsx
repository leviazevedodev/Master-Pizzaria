import React from "react";
import { mediaUrl } from "../lib/api";
import { Facebook, Instagram, MapPin, MessageCircle, Phone } from "lucide-react";

export default function Footer({ settings }) {
  const phone = String(settings.phone || "").trim(),
    w1 = String(settings.whatsappPrimary || "").trim(),
    w2 =
      settings.whatsappSecondaryVisible === false
        ? ""
        : String(settings.whatsappSecondary || "").trim();
  const instagramName = String(settings.instagram || "").trim(),
    instagramUrl = String(settings.instagramUrl || "").trim();
  const facebookName = String(settings.facebookName || "").trim(),
    facebookUrl = String(settings.facebookUrl || "").trim();
  const hasContact = Boolean(phone || w1 || w2);
  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <img
            src={
              mediaUrl(settings?.logoImage) || "/images/store-placeholder.svg"
            }
            alt={settings.storeName || "Pizzaria"}
          />
          {settings.footerText && <p>{settings.footerText}</p>}
        </div>
        {hasContact && (
          <div>
            <h4>Contato</h4>
            {phone && (
              <a href={`tel:${phone.replace(/\D/g, "")}`}>
                <Phone size={14} />
                {phone}
              </a>
            )}
            {w1 && (
              <a
                href={`https://wa.me/${w1.replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle size={14} />
                WhatsApp
              </a>
            )}
            {w2 && (
              <a
                href={`https://wa.me/${w2.replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle size={14} />
                WhatsApp 2
              </a>
            )}
          </div>
        )}
        <div>
          <h4>Loja</h4>
          {settings.address && (
            <p>
              <MapPin size={14} />
              {settings.address}
            </p>
          )}
          {(instagramName || instagramUrl) && (
            <a
              href={
                instagramUrl ||
                `https://www.instagram.com/${instagramName.replace(/^@/, "")}`
              }
              target="_blank"
              rel="noreferrer"
            >
              <Instagram size={14} />
              {instagramName || "Instagram"}
            </a>
          )}
          {facebookUrl && (
            <a href={facebookUrl} target="_blank" rel="noreferrer">
              <Facebook size={14} />
              {facebookName || "Facebook"}
            </a>
          )}
        </div>
        <div>
          <h4>Atendimento</h4>
          {settings.openingHours && <p>{settings.openingHours}</p>}
          <span
            className={`status-pill ${settings.isOpen ? "open" : "closed"}`}
          >
            {settings.isOpen ? "Aceitando pedidos" : "Somente agendamento"}
          </span>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>
          © {new Date().getFullYear()} {settings.storeName || "Pizzaria"}.
        </span>
        <span>Entrega e retirada</span>
      </div>
    </footer>
  );
}
