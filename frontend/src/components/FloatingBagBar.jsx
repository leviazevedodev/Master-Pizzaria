import React from "react";
import { ShoppingBag } from "lucide-react";
import { Link } from "react-router-dom";
import { money } from "../lib/format";

export default function FloatingBagBar({
  count,
  total,
  to = "/carrinho",
  label = "Ver sacola",
}) {
  if (!count) return null;
  return (
    <Link
      to={to}
      className="floating-bag-bar"
      aria-label={`Abrir sacola com ${count} itens`}
    >
      <span className="floating-bag-icon">
        <ShoppingBag />
        <b>{count}</b>
      </span>
      <strong>{label}</strong>
      <span className="floating-bag-total">{money(total)}</span>
    </Link>
  );
}
