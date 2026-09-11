import React from "react";
import { Check, X } from "lucide-react";

export default function Toast({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="toast">
      <span>
        <Check size={16} />
      </span>
      <b>{message}</b>
      <button onClick={onClose} aria-label="Fechar">
        <X size={15} />
      </button>
    </div>
  );
}
