import React from "react";
import { Plus, Star } from "lucide-react";
import { money } from "../lib/format";
import { mediaUrl } from "../lib/api";

const FALLBACK =
  "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=1200&q=82";

export default function ProductCard({ product, onAdd }) {
  const hasFlavors =
    product.allowFlavorSplit && product.availableFlavors?.length > 0;
  const hasSizes = (product.availableSizes?.length || 0) > 0;
  const promoDiscount = product.compareAtPrice
    ? Math.max(0, Number(product.compareAtPrice) - Number(product.price))
    : 0;
  const displayPrice = hasSizes
    ? Math.min(
        ...product.availableSizes.map((size) => {
          const promotional = Number(size.promoPrice);
          return size.promoPrice != null && Number.isFinite(promotional)
            ? promotional
            : Math.max(0, Number(size.price || product.price) - promoDiscount);
        }),
      )
    : Number(product.price);
  const soldOut = product.stockAvailable === false;
  return (
    <article className="product-card">
      <div className={`product-photo ${soldOut ? "sold-out" : ""}`}>
        <img
          src={mediaUrl(product.image) || FALLBACK}
          alt={product.name}
          loading="lazy"
          onError={(e) => {
            e.currentTarget.src = FALLBACK;
          }}
        />
        <div className="product-overlay" />
        {product.badge && (
          <span className="product-badge">
            <Star size={13} fill="currentColor" /> {product.badge}
          </span>
        )}
        {product.compareAtPrice && <span className="sale-badge">Oferta</span>}
        {soldOut && <span className="stock-out-badge">Esgotado</span>}
      </div>
      <div className="product-content">
        <span className="product-category">
          {product.category?.name || "Especial"}
          {product.subcategory?.name ? ` • ${product.subcategory.name}` : ""}
        </span>
        <h3>{product.name}</h3>
        <p>{product.description}</p>
        <div className="product-bottom">
          <div>
            <small>
              {hasFlavors || hasSizes
                ? "A partir de"
                : product.compareAtPrice
                  ? "Promoção"
                  : "Preço"}
            </small>
            {product.compareAtPrice && (
              <del className="product-old-price">
                {money(product.compareAtPrice)}
              </del>
            )}
            <strong>{money(displayPrice)}</strong>
          </div>
          <button
            className="add-button"
            disabled={soldOut}
            onClick={() => !soldOut && onAdd(product)}
            aria-label={
              soldOut
                ? `${product.name} esgotado`
                : `Adicionar ${product.name} à sacola`
            }
          >
            <Plus size={20} />
            <span>{soldOut ? "Esgotado" : "Adicionar"}</span>
          </button>
        </div>
      </div>
    </article>
  );
}
