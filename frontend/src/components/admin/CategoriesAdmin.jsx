import React from "react";
import { Plus, Tags, Trash2 } from "lucide-react";
import PriorityArrows from "./PriorityArrows";
import { slugify } from "../../lib/slugify";

export default function CategoriesAdmin({
  categories,
  subcategories,
  categoryForm,
  setCategoryForm,
  subForm,
  setSubForm,
  createCategory,
  updateCategory,
  removeCategory,
  createSub,
  updateSub,
  removeSub,
  reorderCategory,
  reorderSub,
}) {
  return (
    <div className="categories-unified-admin">
      <div className="admin-two-column">
        <section className="admin-panel">
          <div className="panel-title">
            <div>
              <span>Estrutura do cardápio</span>
              <h2>Categorias e subcategorias</h2>
              <p>
                As subcategorias ficam dentro da categoria e só aparecem no site
                quando existirem.
              </p>
            </div>
            <b>{categories.length}</b>
          </div>
          <div className="category-tree-list">
            {categories.map((category) => (
              <article className="category-tree-card" key={category.id}>
                <div className="category-tree-head">
                  <div>
                    <b>{category.name}</b>
                    <small>
                      /{category.slug} • {category.productsCount || 0} produtos
                    </small>
                  </div>
                  <PriorityArrows
                    value={category.sortOrder}
                    onUp={() => reorderCategory(category, -1)}
                    onDown={() => reorderCategory(category, 1)}
                  />
                  <button
                    className={
                      category.active ? "area-toggle active" : "area-toggle"
                    }
                    onClick={() =>
                      updateCategory(category, { active: !category.active })
                    }
                  >
                    {category.active ? "Visível" : "Oculta"}
                  </button>
                  <button
                    className="subtle-danger"
                    onClick={() => removeCategory(category)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="subcategory-inline-list">
                  {subcategories
                    .filter((sub) => sub.categoryId === category.id)
                    .map((sub) => (
                      <div key={sub.id}>
                        <span>
                          <b>{sub.name}</b>
                          <small>
                            Prioridade {sub.sortOrder} •{" "}
                            {sub.productsCount || 0} produtos
                          </small>
                        </span>
                        <PriorityArrows
                          value={sub.sortOrder}
                          onUp={() => reorderSub(sub, -1)}
                          onDown={() => reorderSub(sub, 1)}
                        />
                        <button
                          className={
                            sub.active
                              ? "mini-visibility active"
                              : "mini-visibility"
                          }
                          onClick={() =>
                            updateSub(sub, { active: !sub.active })
                          }
                        >
                          {sub.active ? "Visível" : "Oculta"}
                        </button>
                        <button
                          className="subtle-danger"
                          onClick={() => removeSub(sub)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                </div>
              </article>
            ))}
          </div>
        </section>
        <div className="admin-stack">
          <form className="admin-panel compact-form" onSubmit={createCategory}>
            <div className="panel-title">
              <div>
                <span>Nova categoria</span>
                <h2>Adicionar categoria</h2>
              </div>
              <Tags />
            </div>
            <label>
              Nome
              <input
                required
                value={categoryForm.name}
                onChange={(e) =>
                  setCategoryForm({
                    ...categoryForm,
                    name: e.target.value,
                    slug: slugify(e.target.value),
                  })
                }
                placeholder="Ex.: Pizzas"
              />
            </label>
            <label>
              Slug
              <input
                required
                value={categoryForm.slug}
                onChange={(e) =>
                  setCategoryForm({ ...categoryForm, slug: e.target.value })
                }
              />
            </label>
            <small className="priority-create-note">
              A categoria será adicionada no fim. Depois use as setas para mudar
              a posição.
            </small>
            <button className="primary-btn full">
              <Plus size={16} /> Adicionar categoria
            </button>
          </form>
          <form className="admin-panel compact-form" onSubmit={createSub}>
            <div className="panel-title">
              <div>
                <span>Dentro da categoria</span>
                <h2>Adicionar subcategoria</h2>
              </div>
              <Tags />
            </div>
            <label>
              Categoria
              <select
                required
                value={subForm.categoryId}
                onChange={(e) =>
                  setSubForm({ ...subForm, categoryId: e.target.value })
                }
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nome
              <input
                required
                value={subForm.name}
                onChange={(e) =>
                  setSubForm({
                    ...subForm,
                    name: e.target.value,
                    slug: slugify(e.target.value),
                  })
                }
                placeholder="Ex.: Pizza grande"
              />
            </label>
            <label>
              Slug
              <input
                required
                value={subForm.slug}
                onChange={(e) =>
                  setSubForm({ ...subForm, slug: e.target.value })
                }
              />
            </label>
            <small className="priority-create-note">
              A subcategoria será adicionada no fim da categoria selecionada.
            </small>
            <button className="primary-btn full">
              <Plus size={16} /> Adicionar subcategoria
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

