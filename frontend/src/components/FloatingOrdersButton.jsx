import React from "react";
import { ClipboardList } from "lucide-react";
import { Link } from "react-router-dom";

export default function FloatingOrdersButton() {
  return (
    <Link
      className="floating-orders-button"
      to="/seus-pedidos"
      aria-label="Abrir Seus pedidos"
      title="Seus pedidos"
    >
      <ClipboardList size={24} />
      <span>Pedidos</span>
    </Link>
  );
}
