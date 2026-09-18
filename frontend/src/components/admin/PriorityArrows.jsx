import React from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

export default function PriorityArrows({ value, onUp, onDown }) {
  return (
    <div className="priority-controls compact-priority">
      <small>Prioridade {value}</small>
      <span>
        <button type="button" onClick={onUp} title="Subir" aria-label="Subir prioridade">
          <ArrowUp size={14} />
        </button>
        <button type="button" onClick={onDown} title="Descer" aria-label="Descer prioridade">
          <ArrowDown size={14} />
        </button>
      </span>
    </div>
  );
}
