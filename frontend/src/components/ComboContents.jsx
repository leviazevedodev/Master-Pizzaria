import React from "react";
import "../styles/combo-contents.css";
import {
  comboSnapshotDetailLines,
  comboSnapshotItemLabel,
} from "../lib/comboSnapshot";

export default function ComboContents({ items, multiplier = 1, className = "" }) {
  if (!Array.isArray(items) || !items.length) return null;
  return (
    <ul className={`combo-contents ${className}`} aria-label="Itens do combo">
      {items.map((item, index) => (
        <li
          key={`${item.slotId || item.productId}-${item.sizeId || ""}-${index}`}
        >
          <span>{comboSnapshotItemLabel(item, multiplier)}</span>
          {comboSnapshotDetailLines(item).map((detail) => (
            <small key={detail}>{detail}</small>
          ))}
        </li>
      ))}
    </ul>
  );
}
