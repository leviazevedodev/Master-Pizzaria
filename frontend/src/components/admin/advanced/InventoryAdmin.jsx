import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  Box,
  PackageSearch,
  Plus,
  Save,
  Search,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import { api, authHeaders, mediaUrl } from "../../../lib/api";

export function InventoryAdmin({
  session,
  products = [],
  notify = () => {},
  fail = () => {},
}) {
  const headers = authHeaders(session.token);
  const [data, setData] = useState({ items: [], products: [] });
  const [form, setForm] = useState({
    name: "",
    unit: "un",
    quantity: 0,
    minQuantity: 0,
  });
  const [selectedProduct, setSelectedProduct] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [recipe, setRecipe] = useState({});
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/inventory", headers);
      setData(data);
      setSelectedProduct((current) => current || data.products?.[0]?.id || "");
    } catch (err) {
      fail(err, "Não foi possível carregar o estoque.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    const product = data.products.find((p) => p.id === selectedProduct);
    setRecipe(
      Object.fromEntries(
        (product?.recipeItems || []).map((r) => [
          r.inventoryItemId,
          String(r.quantity),
        ]),
      ),
    );
  }, [selectedProduct, data.products]);
  async function create(e) {
    e.preventDefault();
    try {
      await api.post(
        "/admin/inventory",
        {
          ...form,
          quantity: Number(form.quantity),
          minQuantity: Number(form.minQuantity),
        },
        headers,
      );
      setForm({ name: "", unit: "un", quantity: 0, minQuantity: 0 });
      notify("Item de estoque criado.");
      await load();
    } catch (err) {
      fail(err, "Não foi possível criar o item.");
    }
  }
  async function update(item, patch) {
    try {
      await api.patch(`/admin/inventory/${item.id}`, patch, headers);
      await load();
    } catch (err) {
      fail(err, "Não foi possível atualizar o estoque.");
    }
  }
  async function remove(item) {
    if (!confirm(`Remover “${item.name}” do estoque?`)) return;
    try {
      await api.delete(`/admin/inventory/${item.id}`, headers);
      await load();
    } catch (err) {
      fail(err, "Não foi possível remover o item.");
    }
  }
  async function saveRecipe() {
    try {
      const items = Object.entries(recipe)
        .map(([inventoryItemId, quantity]) => ({
          inventoryItemId,
          quantity: Number(quantity),
        }))
        .filter((r) => r.quantity > 0);
      await api.put(
        `/admin/products/${selectedProduct}/recipe`,
        { items },
        headers,
      );
      notify("Ficha técnica do produto salva.");
      await load();
    } catch (err) {
      fail(err, "Não foi possível salvar a ficha técnica.");
    }
  }
  const selected = data.products.find((p) => p.id === selectedProduct);
  const low = data.items.filter(
    (i) => Number(i.quantity) <= Number(i.minQuantity),
  );
  const visibleProducts = data.products.filter((p) =>
    `${p.name} ${p.category?.name || ""}`
      .toLowerCase()
      .includes(productSearch.trim().toLowerCase()),
  );
  return (
    <div className="advanced-stock-page">
      <section className="admin-panel advanced-summary">
        <div>
          <span className="eyebrow dark">Estoque real</span>
          <h2>Ingredientes e insumos</h2>
          <p>
            Controle farinha, queijo, caixas, bebidas e qualquer insumo usado na
            produção. O consumo é baixado quando o pedido é aceito.
          </p>
        </div>
        <div className="advanced-summary-badge">
          <AlertTriangle />
          <b>{low.length}</b>
          <small>em nível baixo</small>
        </div>
      </section>
      <div className="advanced-admin-grid">
        <section className="admin-panel">
          <div className="panel-title">
            <div>
              <span>Insumos</span>
              <h2>Estoque real</h2>
            </div>
            <Box />
          </div>
          {loading ? (
            <p>Carregando...</p>
          ) : (
            <div className="inventory-list">
              {data.items.map((item) => (
                <article
                  className={
                    Number(item.quantity) <= Number(item.minQuantity)
                      ? "low-stock"
                      : ""
                  }
                  key={item.id}
                >
                  <div>
                    <b>{item.name}</b>
                    <small>
                      {item.unit} • mínimo {item.minQuantity}
                    </small>
                  </div>
                  <label>
                    Atual
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      defaultValue={item.quantity}
                      onBlur={(e) =>
                        update(item, { quantity: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Alerta
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      defaultValue={item.minQuantity}
                      onBlur={(e) =>
                        update(item, { minQuantity: Number(e.target.value) })
                      }
                    />
                  </label>
                  <button
                    className={
                      item.active ? "area-toggle active" : "area-toggle"
                    }
                    onClick={() => update(item, { active: !item.active })}
                  >
                    {item.active ? "Ativo" : "Pausado"}
                  </button>
                  <button
                    className="subtle-danger"
                    onClick={() => remove(item)}
                  >
                    <Trash2 size={15} />
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
        <form className="admin-panel compact-form" onSubmit={create}>
          <div className="panel-title">
            <div>
              <span>Novo insumo</span>
              <h2>Adicionar ao estoque</h2>
            </div>
            <Plus />
          </div>
          <label>
            Nome
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex.: Mussarela"
            />
          </label>
          <label>
            Unidade
            <select
              className="inventory-unit-select"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
            >
              <option value="un">Unidade (un)</option>
              <option value="g">Gramas (g)</option>
              <option value="kg">Quilos (kg)</option>
              <option value="ml">Mililitros (ml)</option>
              <option value="L">Litros (L)</option>
              <option value="caixa">Caixa</option>
              <option value="pacote">Pacote</option>
            </select>
          </label>
          <div className="two-cols">
            <label>
              Quantidade
              <input
                type="number"
                step="0.001"
                min="0"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              />
            </label>
            <label>
              Alerta mínimo
              <input
                type="number"
                step="0.001"
                min="0"
                value={form.minQuantity}
                onChange={(e) =>
                  setForm({ ...form, minQuantity: e.target.value })
                }
              />
            </label>
          </div>
          <button className="primary-btn">
            <Plus size={16} /> Adicionar insumo
          </button>
        </form>
      </div>
      <section className="admin-panel recipe-panel">
        <div className="panel-title">
          <div>
            <span>Ficha técnica</span>
            <h2>Consumo por produto</h2>
            <p>
              Escolha visualmente o produto e informe quanto de cada insumo ele
              consome. O estoque é baixado automaticamente quando o pedido entra
              em preparo.
            </p>
          </div>
          <PackageSearch />
        </div>
        <div className="recipe-product-toolbar">
          <div className="recipe-product-search">
            <Search size={16} />
            <input
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Buscar produto do cardápio..."
            />
          </div>
          {selected && (
            <div className="recipe-selected-product">
              <span>Selecionado</span>
              <b>{selected.name}</b>
            </div>
          )}
        </div>
        <div className="recipe-product-picker">
          {visibleProducts.map((p) => (
            <button
              key={p.id}
              type="button"
              className={selectedProduct === p.id ? "selected" : ""}
              onClick={() => setSelectedProduct(p.id)}
            >
              {p.image ? (
                <img src={mediaUrl(p.image)} alt="" />
              ) : (
                <span className="recipe-product-placeholder">
                  <ShoppingBag size={18} />
                </span>
              )}
              <span>
                <b>{p.name}</b>
                <small>{p.category?.name || "Produto"}</small>
              </span>
              {selectedProduct === p.id && <i>Selecionado</i>}
            </button>
          ))}
          {!visibleProducts.length && (
            <p className="empty-inline">Nenhum produto encontrado.</p>
          )}
        </div>
        {selected && (
          <>
            <div className="recipe-grid">
              {data.items
                .filter((i) => i.active)
                .map((item) => (
                  <label key={item.id}>
                    <span>
                      {item.name}
                      <small>Consumo por unidade vendida</small>
                    </span>
                    <div className="recipe-quantity-field">
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={recipe[item.id] || ""}
                        onChange={(e) =>
                          setRecipe({ ...recipe, [item.id]: e.target.value })
                        }
                        placeholder="0"
                      />
                      <i>{item.unit}</i>
                    </div>
                  </label>
                ))}
            </div>
            <button
              className="primary-btn recipe-save-btn"
              disabled={!selectedProduct}
              onClick={saveRecipe}
            >
              <Save size={16} /> Salvar ficha técnica de {selected.name}
            </button>
          </>
        )}
      </section>
      <section className="admin-panel">
        <div className="panel-title">
          <div>
            <span>Produtos simples</span>
            <h2>Estoque direto no produto</h2>
            <p>
              Ideal para refrigerantes, sorvetes e itens prontos. Ative
              “Controlar estoque simples” na edição do produto.
            </p>
          </div>
          <ShoppingBag />
        </div>
        <div className="simple-stock-list">
          {data.products
            .filter((p) => p.stockTracked)
            .map((p) => (
              <article
                key={p.id}
                className={
                  p.stockQuantity <= p.stockLowThreshold ? "low-stock" : ""
                }
              >
                <b>{p.name}</b>
                <span>{p.stockQuantity} un.</span>
                <small>alerta em {p.stockLowThreshold}</small>
              </article>
            ))}
          {!data.products.some((p) => p.stockTracked) && (
            <p className="empty-inline">
              Nenhum produto com estoque simples ativado.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

