import React from "react";
import { Layers3, Plus, Trash2 } from "lucide-react";
import PriorityArrows from "./PriorityArrows";
import { slugify } from "../../lib/slugify";

export default function SizesAdmin({ rows, form, setForm, create, update, remove, reorder }) {
  return (
    <div className="admin-two-column">
      <section className="admin-panel">
        <div className="panel-title">
          <div>
            <span>Configuração de pizzas</span>
            <h2>Tamanhos</h2>
            <p>
              Crie os tamanhos uma vez e depois defina um preço diferente para
              cada produto.
            </p>
          </div>
          <b>{rows.length}</b>
        </div>
        <div className="category-admin-list">
          {rows.map((row) => (
            <article
              key={row.id}
              className={`size-admin-row ${!row.active ? "paused" : ""}`}
            >
              <div>
                <b>{row.name}</b>
                <small>
                  {row.diameterCm ? `${row.diameterCm} cm • ` : ""}
                  {row.slug} • até {row.maxFlavors || 4}{" "}
                  {(row.maxFlavors || 4) === 1 ? "sabor" : "sabores"}
                </small>
              </div>
              <label className="size-max-flavors-control">
                <span>Máximo</span>
                <select
                  value={row.maxFlavors || 4}
                  onChange={(event) =>
                    update(row, { maxFlavors: Number(event.target.value) })
                  }
                >
                  {[1, 2, 3, 4].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <PriorityArrows
                value={row.sortOrder}
                onUp={() => reorder(row, -1)}
                onDown={() => reorder(row, 1)}
              />
              <button
                className={row.active ? "area-toggle active" : "area-toggle"}
                onClick={() => update(row, { active: !row.active })}
              >
                {row.active ? "Ativo" : "Pausado"}
              </button>
              <button className="subtle-danger" onClick={() => remove(row)}>
                <Trash2 size={15} />
              </button>
            </article>
          ))}
        </div>
      </section>
      <form className="admin-panel compact-form" onSubmit={create}>
        <div className="panel-title">
          <div>
            <span>Novo tamanho</span>
            <h2>Criar tamanho de pizza</h2>
          </div>
          <Layers3 />
        </div>
        <label>
          Nome
          <input
            required
            value={form.name}
            onChange={(e) =>
              setForm({
                ...form,
                name: e.target.value,
                slug: form.slug || slugify(e.target.value),
              })
            }
            placeholder="Ex.: Grande"
          />
        </label>
        <label>
          Slug
          <input
            required
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            placeholder="grande"
          />
        </label>
        <label>
          Diâmetro em cm
          <input
            type="number"
            min="1"
            value={form.diameterCm}
            onChange={(e) => setForm({ ...form, diameterCm: e.target.value })}
            placeholder="35"
          />
        </label>
        <label>
          Máximo de sabores neste tamanho
          <select
            value={form.maxFlavors || 4}
            onChange={(e) =>
              setForm({ ...form, maxFlavors: Number(e.target.value) })
            }
          >
            {[1, 2, 3, 4].map((value) => (
              <option key={value} value={value}>
                {value} {value === 1 ? "sabor" : "sabores"}
              </option>
            ))}
          </select>
        </label>
        <button className="primary-btn full">
          <Plus size={16} /> Criar tamanho
        </button>
      </form>
    </div>
  );
}
