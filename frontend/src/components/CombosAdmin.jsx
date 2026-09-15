import React, { useMemo, useState } from "react";
import {
  ImagePlus,
  PackagePlus,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { api, authHeaders, mediaUrl } from "../lib/api";
import { money } from "../lib/format";
import ComboContents from "./ComboContents";
import "../styles/combo-payment.css";

const EMPTY = {
  name: "",
  description: "",
  price: "",
  image: "",
  available: true,
  items: [],
};

function formFromCombo(combo) {
  return {
    name: combo.name || "",
    description: combo.description || "",
    price: combo.price ?? "",
    image: combo.image || "",
    available: combo.available !== false,
    items: (combo.comboItems || []).map((entry) => ({
      productId: entry.productId,
      quantity: Number(entry.quantity || 1),
      sizeId: entry.sizeId || "",
    })),
  };
}

export default function CombosAdmin({
  session,
  combos,
  products,
  onChanged,
  notify,
  fail,
  requestCrop,
  imageUploading,
}) {
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const headers = authHeaders(session.token);
  const productMap = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const availableProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    const selected = new Set(form.items.map((entry) => entry.productId));
    return products
      .filter(
        (product) =>
          !product.deletedAt &&
          !product.isCombo &&
          !selected.has(product.id) &&
          (!query ||
            `${product.name} ${product.category?.name || ""}`
              .toLocaleLowerCase("pt-BR")
              .includes(query)),
      )
      .slice(0, 12);
  }, [products, form.items, search]);

  function reset() {
    setEditingId(null);
    setForm(EMPTY);
    setSearch("");
  }
  function addProduct(productId) {
    if (!productId || form.items.some((item) => item.productId === productId))
      return;
    const product = productMap.get(productId);
    const defaultSize = product?.availableSizes?.find((size) => size.slug === "media") || product?.availableSizes?.[0];
    setForm((current) => ({
      ...current,
      items: [...current.items, { productId, quantity: 1, sizeId: defaultSize?.id || "" }],
    }));
    setSearch("");
  }
  function updateQuantity(productId, value) {
    const quantity = Math.max(1, Math.min(20, Number(value) || 1));
    setForm((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.productId === productId ? { ...item, quantity } : item,
      ),
    }));
  }
  async function submit(event) {
    event.preventDefault();
    if (form.items.length < 2)
      return fail(
        { response: { data: { message: "Escolha ao menos dois produtos diferentes." } } },
        "Escolha os itens do combo.",
      );
    setSaving(true);
    try {
      const payload = {
        ...form,
        price: Number(form.price),
        items: form.items.map((item) => ({
          productId: item.productId,
          quantity: Number(item.quantity),
          sizeId: item.sizeId || null,
        })),
      };
      if (editingId)
        await api.patch(`/admin/combos/${editingId}`, payload, headers);
      else await api.post("/admin/combos", payload, headers);
      await onChanged?.();
      notify(editingId ? "Combo atualizado." : "Combo criado e publicado no cardápio.");
      reset();
    } catch (error) {
      fail(error, "Não foi possível salvar o combo.");
    } finally {
      setSaving(false);
    }
  }
  async function archive(combo) {
    if (!window.confirm(`Arquivar o combo “${combo.name}”?`)) return;
    try {
      await api.delete(`/admin/combos/${combo.id}`, headers);
      await onChanged?.();
      if (editingId === combo.id) reset();
      notify("Combo arquivado.");
    } catch (error) {
      fail(error, "Não foi possível arquivar o combo.");
    }
  }
  async function toggle(combo) {
    try {
      await api.patch(
        `/admin/combos/${combo.id}`,
        { available: !combo.available },
        headers,
      );
      await onChanged?.();
    } catch (error) {
      fail(error, "Não foi possível alterar a disponibilidade do combo.");
    }
  }

  return (
    <section className="admin-panel combos-admin">
      <div className="panel-title">
        <div>
          <span>Cardápio</span>
          <h2>Combos</h2>
          <p>Reúna produtos e tamanhos em uma oferta com preço e foto próprios.</p>
        </div>
        {editingId && (
          <button type="button" className="outline-btn" onClick={reset}>
            <X size={16} /> Cancelar edição
          </button>
        )}
      </div>

      <form className="combo-editor" onSubmit={submit}>
        <div className="combo-editor-fields">
          <label>
            Nome do combo
            <input
              required
              minLength="2"
              maxLength="100"
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Ex.: Combo Família"
            />
          </label>
          <label>
            Preço do combo (R$)
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={(event) =>
                setForm((current) => ({ ...current, price: event.target.value }))
              }
              placeholder="79,90"
            />
          </label>
          <label className="span-2">
            Descrição para o cliente
            <textarea
              required
              maxLength="350"
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              placeholder="Descreva o que torna este combo especial."
            />
          </label>
          <label className="combo-photo-field span-2">
            Foto do combo
            <span>
              {form.image ? (
                <img src={mediaUrl(form.image)} alt="Prévia do combo" />
              ) : (
                <i><ImagePlus size={24} /></i>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={imageUploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file)
                    requestCrop(
                      file,
                      (image) => setForm((current) => ({ ...current, image })),
                      "Foto do combo",
                      4 / 3,
                    );
                  event.target.value = "";
                }}
              />
              <b>{imageUploading ? "Preparando imagem..." : "Escolher foto"}</b>
            </span>
          </label>
        </div>

        <div className="combo-products-editor">
          <div>
            <b>Produtos incluídos</b>
            <small>Selecione pelo menos dois produtos diferentes.</small>
          </div>
          <label className="combo-product-search">
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar produto para adicionar"
            />
          </label>
          {search && availableProducts.length > 0 && form.items.length < 20 && (
            <div className="combo-search-results">
              {availableProducts.map((product) => (
                <button
                  type="button"
                  key={product.id}
                  onClick={() => addProduct(product.id)}
                >
                  <img src={mediaUrl(product.image)} alt="" />
                  <span><b>{product.name}</b><small>{money(product.price)}</small></span>
                  <Plus size={16} />
                </button>
              ))}
            </div>
          )}
          <div className="combo-selected-products">
            {form.items.map((item) => {
              const product = productMap.get(item.productId);
              return (
                <article key={item.productId}>
                  <img src={mediaUrl(product?.image)} alt="" />
                  <span>
                    <b>{product?.name || "Produto indisponível"}</b>
                    <small>{money(product?.price || 0)}</small>
                    {product?.availableSizes?.length > 0 && (
                      <label className="combo-size-field">
                        Tamanho incluído
                        <select
                          required
                          value={item.sizeId || ""}
                          onChange={(event) => setForm((current) => ({
                            ...current,
                            items: current.items.map((entry) => entry.productId === item.productId ? { ...entry, sizeId: event.target.value } : entry),
                          }))}
                        >
                          <option value="" disabled>Escolha o tamanho</option>
                          {product.availableSizes.map((size) => <option key={size.id} value={size.id}>{size.name}</option>)}
                        </select>
                      </label>
                    )}
                  </span>
                  <label>
                    Quantidade
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={item.quantity}
                      onChange={(event) =>
                        updateQuantity(item.productId, event.target.value)
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="subtle-danger"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        items: current.items.filter(
                          (entry) => entry.productId !== item.productId,
                        ),
                      }))
                    }
                    aria-label={`Remover ${product?.name || "produto"}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </article>
              );
            })}
            {!form.items.length && (
              <div className="combo-empty-items">
                <PackagePlus size={24} /> Busque e adicione os produtos do combo.
              </div>
            )}
          </div>
          <small className="combo-hint">Os produtos e tamanhos definidos aqui são fixos. O cliente pode incluir uma observação no pedido.</small>
        </div>

        <label className="compact-check combo-active-check">
          <input
            type="checkbox"
            checked={form.available}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                available: event.target.checked,
              }))
            }
          />
          Publicar no cardápio
        </label>
        <button className="primary-btn" disabled={saving || imageUploading}>
          {editingId ? <Save size={16} /> : <Plus size={16} />}
          {saving ? "Salvando..." : editingId ? "Salvar combo" : "Criar combo"}
        </button>
      </form>

      <div className="combo-admin-list">
        {combos.map((combo) => (
          <article key={combo.id} className={!combo.available ? "paused" : ""}>
            <img src={mediaUrl(combo.image)} alt="" />
            <div>
              <small>COMBO • {combo.comboItems?.length || 0} TIPOS DE ITEM</small>
              <h3>{combo.name}</h3>
              <ComboContents items={combo.comboItems} />
            </div>
            <strong>{money(combo.price)}</strong>
            <button
              type="button"
              className={combo.available ? "availability-button on" : "availability-button off"}
              onClick={() => toggle(combo)}
            >
              {combo.available ? "Ativo" : "Pausado"}
            </button>
            <button
              type="button"
              className="icon-action"
              onClick={() => {
                setEditingId(combo.id);
                setForm(formFromCombo(combo));
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              <Pencil size={16} /> Editar
            </button>
            <button
              type="button"
              className="subtle-danger"
              onClick={() => archive(combo)}
            >
              <Trash2 size={16} /> Arquivar
            </button>
          </article>
        ))}
        {!combos.length && (
          <div className="empty-admin">
            <PackagePlus />
            <p>Nenhum combo criado ainda.</p>
          </div>
        )}
      </div>
    </section>
  );
}
