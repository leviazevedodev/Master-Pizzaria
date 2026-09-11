import React, { useMemo, useState } from "react";
import {
  ArrowRight,
  ChefHat,
  Clock3,
  CreditCard,
  Flame,
  Instagram,
  MapPin,
  MessageCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  Tag,
} from "lucide-react";
import { Link } from "react-router-dom";
import ProductCard from "../components/ProductCard";
import MotoIcon from "../components/MotoIcon";
import Footer from "../components/Footer";
import { mediaUrl } from "../lib/api";
import { money } from "../lib/format";

export default function HomePage({
  products,
  categories,
  subcategories,
  promotions = [],
  settings,
  storeHours = [],
  onAdd,
}) {
  const [category, setCategory] = useState("todos");
  const [search, setSearch] = useState("");
  const [subcategory, setSubcategory] = useState("todos");
  const activeSubs = useMemo(
    () =>
      category === "todos"
        ? []
        : subcategories.filter(
            (item) =>
              item.category?.slug === category ||
              item.categoryId ===
                categories.find((cat) => cat.slug === category)?.id,
          ),
    [category, subcategories, categories],
  );
  const filtered = useMemo(
    () =>
      products.filter((product) => {
        const matchesCategory =
          category === "todos" || product.category?.slug === category;
        const matchesSub =
          subcategory === "todos" || product.subcategory?.slug === subcategory;
        const term = search.trim().toLowerCase();
        return (
          matchesCategory &&
          matchesSub &&
          (!term ||
            `${product.name} ${product.description}`
              .toLowerCase()
              .includes(term))
        );
      }),
    [products, category, subcategory, search],
  );
  const homeLimit = Math.min(
    8,
    Math.max(4, Number(settings.homeProductLimit || 8)),
  );
  const visibleProducts = filtered.slice(0, homeLimit);
  const heroProduct = products.find((item) => item.featured) || products[0];
  const heroImage =
    mediaUrl(settings.heroImage) || mediaUrl(heroProduct?.image);
  const aboutImage =
    mediaUrl(settings.aboutImage) ||
    "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1400&q=88";
  const eta = `${settings.estimatedDeliveryMin}-${settings.estimatedDeliveryMax} min`;
  const whatsapp1 = String(settings.whatsappPrimary || "").trim();
  const whatsapp2 =
    settings.whatsappSecondaryVisible === false
      ? ""
      : String(settings.whatsappSecondary || "").trim();
  const instagramUrl = String(settings.instagramUrl || "").trim();
  const instagramName = String(settings.instagram || "").trim();
  const hasSocial = Boolean(
    whatsapp1 || whatsapp2 || instagramUrl || instagramName,
  );
  const payments = [
    settings.cashPaymentEnabled && "Dinheiro",
    settings.onlinePaymentEnabled &&
      settings.onlinePaymentConfigured &&
      "Pagamento online (Pix/cartão)",
    ...(settings.customPaymentMethods || [])
      .filter((method) => method.active !== false && method.siteEnabled !== false)
      .map((method) => method.label),
  ].filter(Boolean);
  function chooseCategory(slug) {
    setCategory(slug);
    setSubcategory("todos");
  }

  return (
    <>
      <section className="hero" id="inicio">
        <div className="hero-noise" />
        <div className="container hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">
              <Flame size={16} />{" "}
              {settings.heroEyebrow || "Artesanal • feita na hora"}
            </span>
            <h1>{settings.heroTitle}</h1>
            <p>{settings.heroSubtitle}</p>
            <div className="hero-actions">
              <a className="primary-btn large" href="#cardapio">
                Pedir agora <ArrowRight size={18} />
              </a>
              <a className="ghost-btn" href="#sobre">
                Conhecer a Master
              </a>
            </div>
            <div className="hero-perks">
              <span>
                <MotoIcon size={18} />
                <b>{eta}</b>
                <small>entrega estimada</small>
              </span>
              <span>
                <ShieldCheck size={18} />
                <b>Pedido seguro</b>
                <small>valores validados no servidor</small>
              </span>
              <span>
                <Store size={18} />
                <b>
                  {settings.isOpen ? "Pedidos agora" : "Agendamento disponível"}
                </b>
                <small>
                  {settings.isOpen
                    ? "entrega ou retirada"
                    : "escolha outro dia no checkout"}
                </small>
              </span>
            </div>
          </div>
          <div className="hero-visual">
            <div className="hero-photo-wrap">
              {heroImage && (
                <img
                  src={heroImage}
                  alt={heroProduct?.name || settings.storeName}
                />
              )}
              <div className="hero-photo-shade" />
              <div className="hero-label">
                <span>🔥</span>
                <div>
                  <small>Destaque da casa</small>
                  <b>{heroProduct?.name || settings.storeName}</b>
                </div>
              </div>
            </div>
            {(String(settings.heroStampTitle || "").trim() ||
              String(settings.heroStampText || "").trim()) && (
              <div className="hero-stamp">
                <Sparkles size={18} />
                {String(settings.heroStampTitle || "").trim() && (
                  <b>{settings.heroStampTitle}</b>
                )}
                {String(settings.heroStampText || "").trim() && (
                  <small>{settings.heroStampText}</small>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
      <section className="trust-strip">
        <div className="container">
          <span>
            <ChefHat />
            Ingredientes selecionados
          </span>
          <span>
            <Flame />
            Forno bem quente
          </span>
          <span>
            <MotoIcon />
            Entrega organizada
          </span>
          <span>
            <ShieldCheck />
            Compra transparente
          </span>
        </div>
      </section>

      <main>
        {promotions.length > 0 && (
          <section className="promotions-section container" id="promocoes">
            <div className="section-heading">
              <div>
                <span className="eyebrow dark">Promoções</span>
                <h2>{settings.promotionsTitle || "Ofertas em destaque"}</h2>
                <p>{settings.promotionsSubtitle}</p>
              </div>
            </div>
            <div className="promotion-grid">
              {promotions.map((promo) => (
                <article className="promotion-card" key={promo.id}>
                  <div className="promotion-image">
                    <img
                      src={
                        mediaUrl(promo.image) || mediaUrl(promo.product?.image)
                      }
                      alt={promo.title}
                    />
                    <span>
                      <Tag size={14} /> Oferta
                    </span>
                  </div>
                  <div className="promotion-content">
                    <small>{promo.product?.category?.name || "Promoção"}</small>
                    <h3>{promo.title}</h3>
                    {promo.subtitle && <p>{promo.subtitle}</p>}
                    <div className="promotion-price">
                      <del>{money(promo.originalPrice)}</del>
                      <strong>{money(promo.promoPrice)}</strong>
                    </div>
                    <button
                      className="primary-btn"
                      onClick={() => onAdd(promo.product)}
                    >
                      Adicionar <ArrowRight size={16} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="menu-section container" id="cardapio">
          <div className="section-heading">
            <div>
              <span className="eyebrow dark">Cardápio Master</span>
              <h2>{settings.menuTitle || "Escolha o seu próximo favorito."}</h2>
              <p>{settings.menuSubtitle}</p>
            </div>
            <label className="search-box">
              <Search size={18} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar produto ou ingrediente"
              />
            </label>
          </div>
          <div className="category-tabs">
            <button
              className={category === "todos" ? "active" : ""}
              onClick={() => chooseCategory("todos")}
            >
              Todos
            </button>
            {categories.map((item) => (
              <button
                key={item.id}
                className={category === item.slug ? "active" : ""}
                onClick={() => chooseCategory(item.slug)}
              >
                {item.name}
              </button>
            ))}
          </div>
          {activeSubs.length > 0 && (
            <div className="subcategory-tabs">
              <button
                className={subcategory === "todos" ? "active" : ""}
                onClick={() => setSubcategory("todos")}
              >
                Todos da categoria
              </button>
              {activeSubs.map((item) => (
                <button
                  key={item.id}
                  className={subcategory === item.slug ? "active" : ""}
                  onClick={() => setSubcategory(item.slug)}
                >
                  {item.name}
                </button>
              ))}
            </div>
          )}
          <div className="product-grid">
            {visibleProducts.map((product) => (
              <ProductCard key={product.id} product={product} onAdd={onAdd} />
            ))}
          </div>
          {filtered.length === 0 && (
            <div className="empty-state">
              <Search />
              <h3>Nada por aqui</h3>
              <p>Tente outro nome ou selecione outra categoria.</p>
            </div>
          )}
          {filtered.length > homeLimit && (
            <div className="view-all-wrap">
              <p>
                Mostrando {homeLimit} de {filtered.length} produtos.
              </p>
              <Link
                className="ghost-dark-btn view-all-btn"
                to={`/cardapio${category !== "todos" ? `?categoria=${category}` : ""}`}
              >
                Ver mais produtos do catálogo <ArrowRight size={17} />
              </Link>
            </div>
          )}
        </section>

        <section className="about-section container" id="sobre">
          <div className="about-visual">
            <img src={aboutImage} alt="Master Pizza" loading="lazy" />
            <span className="about-chip">Feita na hora</span>
          </div>
          <div className="about-copy">
            <span className="eyebrow dark">
              {settings.aboutEyebrow || "Sobre a Master"}
            </span>
            <h2>{settings.aboutTitle}</h2>
            <p>{settings.aboutText}</p>
            <div className="feature-list">
              <div>
                <b>01</b>
                <span>
                  <strong>Entrega ou retirada</strong>
                  <small>
                    Escolha a operação que combina melhor com o momento.
                  </small>
                </span>
              </div>
              <div>
                <b>02</b>
                <span>
                  <strong>Seus pedidos sem complicação</strong>
                  <small>
                    Com conta ou com o código da compra, você acompanha o
                    andamento.
                  </small>
                </span>
              </div>
              <div>
                <b>03</b>
                <span>
                  <strong>Agendamento</strong>
                  <small>
                    Quando a loja estiver fechada, escolha outro dia e horário
                    de funcionamento.
                  </small>
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="store-details-section" id="informacoes">
          <div className="container">
            <div className="store-details-head">
              <span className="eyebrow dark">Informações da loja</span>
              <h2>
                Tudo que você precisa <em>saber antes de pedir.</em>
              </h2>
              <p>
                Contato, operação, formas de pagamento e endereço em um só
                lugar.
              </p>
            </div>
            <div className="store-info-grid">
              <article className="store-info-card operations-card">
                <div className="info-icon">
                  <Store />
                </div>
                <small>Tipos de operação</small>
                <h3>Como receber</h3>
                <ul>
                  {settings.deliveryEnabled && (
                    <li>
                      <MotoIcon /> Entrega
                    </li>
                  )}
                  {settings.pickupEnabled && (
                    <li>
                      <Store /> Retirada
                    </li>
                  )}
                </ul>
              </article>
              <article className="store-info-card">
                <div className="info-icon">
                  <CreditCard />
                </div>
                <small>Formas de pagamento</small>
                <h3>Na finalização</h3>
                <ul>
                  {payments.length ? (
                    payments.map((name) => (
                      <li key={name}>
                        <span className="dot" />
                        {name}
                      </li>
                    ))
                  ) : (
                    <li>Nenhuma forma ativa no momento</li>
                  )}
                </ul>
              </article>
              <article className="store-info-card address-card">
                <div className="info-icon">
                  <MapPin />
                </div>
                <small>Endereço</small>
                <h3>{settings.storeName}</h3>
                <p>{settings.address}</p>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(settings.address)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Ver localização <ArrowRight size={15} />
                </a>
              </article>
              {hasSocial && (
                <article className="store-info-card social-card">
                  <div className="info-icon">
                    <MessageCircle />
                  </div>
                  <small>Fale com a gente</small>
                  <h3>Redes sociais</h3>
                  <div className="social-actions">
                    {whatsapp1 && (
                      <a
                        href={`https://wa.me/${whatsapp1.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <MessageCircle /> WhatsApp
                      </a>
                    )}
                    {whatsapp2 && (
                      <a
                        href={`https://wa.me/${whatsapp2.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <MessageCircle /> WhatsApp 2
                      </a>
                    )}
                    {(instagramUrl || instagramName) && (
                      <a
                        href={
                          instagramUrl ||
                          `https://www.instagram.com/${instagramName.replace(/^@/, "")}`
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Instagram /> Instagram{" "}
                        {instagramName && <span>{instagramName}</span>}
                      </a>
                    )}
                  </div>
                </article>
              )}
              <article className="store-info-card hours-public-card">
                <div className="info-icon">
                  <Clock3 />
                </div>
                <small>Funcionamento</small>
                <h3>Horários da semana</h3>
                <div className="public-hours-list">
                  {storeHours.length ? (
                    storeHours.map((hour) => (
                      <div key={hour.id || hour.dayOfWeek}>
                        <span>{hour.label}</span>
                        <b>
                          {hour.closed
                            ? "Fechado"
                            : `${hour.openTime}–${hour.closeTime}`}
                        </b>
                      </div>
                    ))
                  ) : (
                    <p>{settings.openingHours}</p>
                  )}
                </div>
              </article>
            </div>
          </div>
        </section>
      </main>
      <Footer settings={settings} />
    </>
  );
}
