import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { money } from "../lib/format";
import { api, mediaUrl } from "../lib/api";
import ComboContents from "../components/ComboContents";

export default function CartPage({
  cart,
  changeQty,
  clearCart,
  settings,
  onAdd,
}) {
  const navigate = useNavigate();
  const [recommendations, setRecommendations] = useState([]);
  useEffect(() => {
    if (settings?.cartRecommendationsEnabled === false || !cart.length) {
      setRecommendations([]);
      return;
    }
    const ids = [
      ...new Set(cart.map((item) => item.productId).filter(Boolean)),
    ];
    api
      .get(`/recommendations?productIds=${encodeURIComponent(ids.join(","))}`)
      .then(({ data }) => setRecommendations(data || []))
      .catch(() => setRecommendations([]));
  }, [
    cart.map((item) => item.productId).join(","),
    settings?.cartRecommendationsEnabled,
  ]);
  const subtotal = cart.reduce(
    (sum, item) => sum + Number(item.price) * item.quantity,
    0,
  );
  return (
    <div className="page-shell">
      <div className="container page-top">
        <Link to="/">
          <ArrowLeft size={16} /> Voltar ao cardápio
        </Link>
      </div>
      <main className="container cart-layout">
        <section>
          <span className="eyebrow dark">Sua sacola</span>
          <h1 className="page-title">
            Sacola <em>{settings?.storeName || "da pizzaria"}.</em>
          </h1>
          {cart.length === 0 ? (
            <div className="empty-cart">
              <ShoppingBag />
              <h2>Sua sacola está vazia</h2>
              <p>Escolha uma pizza e ela aparece aqui.</p>
              <Link className="primary-btn" to="/cardapio">
                Ver cardápio <ArrowRight size={17} />
              </Link>
            </div>
          ) : (
            <div className="cart-list">
              {cart.map((item) => (
                <article
                  className="cart-row"
                  key={item.cartKey || item.productId}
                >
                  <img src={mediaUrl(item.image)} alt="" />
                  <div className="cart-info">
                    <b>{item.name}</b>
                    <ComboContents
                      items={item.comboItems}
                      multiplier={item.quantity}
                    />
                    {item.flavors?.length > 0 && (
                      <small className="cart-flavors">
                        <strong>Sabores:</strong>{" "}
                        {item.flavors.map((f) => f.name).join(" • ")}
                      </small>
                    )}
                    {item.options?.length > 0 && (
                      <small className="cart-options">
                        <strong>Adicionais:</strong>{" "}
                        {item.options
                          .map((o) => `${o.groupName}: ${o.name}`)
                          .join(" • ")}
                      </small>
                    )}
                    {item.notes && (
                      <small className="cart-item-note">
                        <strong>Detalhe:</strong> {item.notes}
                      </small>
                    )}
                    <small>{money(item.price)} cada</small>
                  </div>
                  <div className="qty">
                    <button
                      onClick={() =>
                        changeQty(item.cartKey || item.productId, -1)
                      }
                      aria-label="Diminuir"
                    >
                      <Minus size={15} />
                    </button>
                    <b>{item.quantity}</b>
                    <button
                      onClick={() =>
                        changeQty(item.cartKey || item.productId, 1)
                      }
                      aria-label="Aumentar"
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                  <strong>{money(item.price * item.quantity)}</strong>
                </article>
              ))}
              <button className="text-button danger" onClick={clearCart}>
                <Trash2 size={14} /> Limpar sacola
              </button>
            </div>
          )}
          {cart.length > 0 && recommendations.length > 0 && (
            <section className="cart-recommendations">
              <div>
                <span className="eyebrow dark">Complete seu pedido</span>
                <h2>Combina bem com sua sacola.</h2>
                <p>
                  Sugestões baseadas em produtos que costumam ser comprados
                  juntos.
                </p>
              </div>
              <div className="cart-recommend-grid">
                {recommendations.map((p) => (
                  <article key={p.id}>
                    <img src={mediaUrl(p.image)} alt="" />
                    <span>
                      <b>{p.name}</b>
                      <small>{money(p.price)}</small>
                    </span>
                    <button onClick={() => onAdd?.(p)}>
                      <Plus size={15} /> Adicionar
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}
        </section>
        {cart.length > 0 && (
          <aside className="summary-card">
            <span className="summary-kicker">Resumo</span>
            <h3>Sua sacola</h3>
            <div>
              <span>Subtotal</span>
              <b>{money(subtotal)}</b>
            </div>
            <div>
              <span>Entrega</span>
              <b>Definida no checkout</b>
            </div>
            <hr />
            <div className="summary-total">
              <span>Subtotal atual</span>
              <b>{money(subtotal)}</b>
            </div>
            <div className="cart-delivery-note">
              No próximo passo você escolhe <strong>Entrega</strong> ou{" "}
              <strong>Retirada</strong>. A taxa depende do bairro selecionado.
            </div>
            <button
              className="primary-btn full"
              onClick={() => navigate("/checkout")}
            >
              Continuar <ArrowRight size={17} />
            </button>
          </aside>
        )}
      </main>
    </div>
  );
}
