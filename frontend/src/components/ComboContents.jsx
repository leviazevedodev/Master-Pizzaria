import React from "react";
import "../styles/combo-contents.css";

export default function ComboContents({ items, multiplier = 1, className = "" }) {
  if (!Array.isArray(items) || !items.length) return null;
  return (
    <ul className={`combo-contents ${className}`} aria-label="Itens do combo">
      {items.map((item, index) => (
        <li key={`${item.productId}-${item.sizeId || ""}-${index}`}>
          {Number(item.quantity || 1) * multiplier}× {item.name || item.product?.name}
          {item.sizeName ? ` • ${item.sizeName}` : ""}
        </li>
      ))}
    </ul>
  );
}
