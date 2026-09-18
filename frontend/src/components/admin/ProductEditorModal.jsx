import React from "react";
import { ImagePlus, Save, Trash2, Upload, X } from "lucide-react";
import { mediaUrl } from "../../lib/api";
import { slugify } from "../../lib/slugify";

export default function ProductEditorModal({
  productForm,
  setProductForm,
  categories,
  subcategories,
  sizes,
  flavors,
  modifierGroups,
  onClose,
  onSave,
  onUpload,
  imageUploading,
  isNew,
  onArchive,
}) {
  const subs = subcategories.filter(
    (s) => s.categoryId === productForm.categoryId,
  );
  function toggleGroup(id) {
    setProductForm({
      ...productForm,
      modifierGroupIds: productForm.modifierGroupIds.includes(id)
        ? productForm.modifierGroupIds.filter((x) => x !== id)
        : [...productForm.modifierGroupIds, id],
    });
  }
  function toggleFlavor(id) {
    const current = productForm.flavorIds || [];
    setProductForm({
      ...productForm,
      flavorIds: current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    });
  }
  function sizeRow(id) {
    return productForm.sizePrices.find((row) => row.sizeId === id);
  }
  function toggleSize(size) {
    const existing = sizeRow(size.id);
    setProductForm({
      ...productForm,
      sizePrices: existing
        ? productForm.sizePrices.filter((row) => row.sizeId !== size.id)
        : [
            ...productForm.sizePrices,
            {
              sizeId: size.id,
              price: Number(productForm.price || 0),
              sortOrder: size.sortOrder || 0,
            },
          ],
    });
  }
  function setSizePrice(size, value) {
    setProductForm({
      ...productForm,
      sizePrices: productForm.sizePrices.map((row) =>
        row.sizeId === size.id ? { ...row, price: value } : row,
      ),
    });
  }
  return (
    <div className="modal-backdrop admin-editor-backdrop">
      <form className="product-editor-modal" onSubmit={onSave}>
        <div className="modal-head">
          <div>
            <span className="eyebrow dark">
              {isNew ? "Novo produto" : "Editar produto"}
            </span>
            <h2>{isNew ? "Adicionar ao cardápio" : productForm.name}</h2>
            <p>
              Configure foto, preços por tamanho, uso como sabor e adicionais.
            </p>
          </div>
          <button type="button" className="icon-close" onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="product-editor-grid">
          <aside className="image-upload-card product-image-panel">
            <div className="image-preview storefront-preview">
              {productForm.image ? (
                <img src={mediaUrl(productForm.image)} alt="Prévia" />
              ) : (
                <ImagePlus size={42} />
              )}
              <span>Prévia do card</span>
            </div>
            <div className="product-image-actions">
              <label
                className="upload-icon-button media-upload-standard product-upload-button"
                title="Anexar imagem"
              >
                <Upload size={18} />
                <span>{imageUploading ? "Enviando..." : "Anexar imagem"}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={imageUploading}
                  onChange={(e) => onUpload(e.target.files?.[0])}
                />
              </label>
              <label className="product-image-url">
                <span>Ou URL da imagem</span>
                <input
                  value={productForm.image}
                  onChange={(e) =>
                    setProductForm({ ...productForm, image: e.target.value })
                  }
                  placeholder="https://..."
                />
              </label>
            </div>
            <small>
              A imagem é ajustada automaticamente para caber no card.
            </small>
          </aside>
          <div className="product-fields">
            <label>
              Nome
              <input
                required
                value={productForm.name}
                onChange={(e) =>
                  setProductForm({
                    ...productForm,
                    name: e.target.value,
                    slug: isNew ? slugify(e.target.value) : productForm.slug,
                  })
                }
              />
            </label>
            <label>
              Slug
              <input
                required
                value={productForm.slug}
                onChange={(e) =>
                  setProductForm({ ...productForm, slug: e.target.value })
                }
              />
            </label>
            <label>
              Descrição
              <textarea
                required
                value={productForm.description}
                onChange={(e) =>
                  setProductForm({
                    ...productForm,
                    description: e.target.value,
                  })
                }
              />
            </label>
            <div className="two-cols">
              <label>
                Preço base
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={productForm.price}
                  onChange={(e) =>
                    setProductForm({ ...productForm, price: e.target.value })
                  }
                />
              </label>
              <label>
                Categoria
                <select
                  required
                  value={productForm.categoryId}
                  onChange={(e) =>
                    setProductForm({
                      ...productForm,
                      categoryId: e.target.value,
                      subcategoryId: "",
                    })
                  }
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {subs.length > 0 && (
              <label>
                Subcategoria opcional
                <select
                  value={productForm.subcategoryId}
                  onChange={(e) =>
                    setProductForm({
                      ...productForm,
                      subcategoryId: e.target.value,
                    })
                  }
                >
                  <option value="">Sem subcategoria</option>
                  {subs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Selo opcional
              <input
                value={productForm.badge}
                onChange={(e) =>
                  setProductForm({ ...productForm, badge: e.target.value })
                }
              />
            </label>
            <div className="editor-switches">
              <label className="switch-label">
                <input
                  type="checkbox"
                  checked={productForm.available}
                  onChange={(e) =>
                    setProductForm({
                      ...productForm,
                      available: e.target.checked,
                    })
                  }
                />{" "}
                Disponível
              </label>
              <label className="switch-label">
                <input
                  type="checkbox"
                  checked={productForm.featured}
                  onChange={(e) =>
                    setProductForm({
                      ...productForm,
                      featured: e.target.checked,
                    })
                  }
                />{" "}
                Destaque
              </label>
              <label className="switch-label">
                <input
                  type="checkbox"
                  checked={Boolean(productForm.isNew)}
                  onChange={(e) =>
                    setProductForm({
                      ...productForm,
                      isNew: e.target.checked,
                    })
                  }
                />{" "}
                Marcar como novidade
              </label>
              <label className="switch-label">
                <input
                  type="checkbox"
                  checked={productForm.isFlavorOption}
                  onChange={(e) =>
                    setProductForm({
                      ...productForm,
                      isFlavorOption: e.target.checked,
                    })
                  }
                />{" "}
                Pode ser sabor de outras pizzas
              </label>
              <label className="switch-label">
                <input
                  type="checkbox"
                  checked={productForm.allowFlavorSplit}
                  onChange={(e) =>
                    setProductForm({
                      ...productForm,
                      allowFlavorSplit: e.target.checked,
                      maxFlavors: e.target.checked
                        ? Math.min(
                            4,
                            Math.max(1, Number(productForm.maxFlavors || 1)),
                          )
                        : 1,
                    })
                  }
                />{" "}
                Permitir divisão em sabores
              </label>
            </div>
            {productForm.allowFlavorSplit && (
              <div className="flavor-product-config">
                <div className="two-cols">
                  <label>
                    Máximo de sabores
                    <select
                      value={productForm.maxFlavors}
                      onChange={(e) =>
                        setProductForm({
                          ...productForm,
                          maxFlavors: Number(e.target.value),
                        })
                      }
                    >
                      {[1, 2, 3, 4].map((n) => (
                        <option key={n} value={n}>
                          {n} {n === 1 ? "sabor" : "sabores"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Como calcular vários sabores
                    <select
                      value={productForm.flavorPricingMode || "MAX"}
                      onChange={(e) =>
                        setProductForm({
                          ...productForm,
                          flavorPricingMode: e.target.value,
                        })
                      }
                    >
                      <option value="MAX">Cobrar o sabor mais caro</option>
                      <option value="AVERAGE">Média dos sabores</option>
                      <option value="PROPORTIONAL">
                        Proporcional às partes escolhidas
                      </option>
                      {productForm.flavorPricingMode === "SUM" && (
                        <option value="SUM">Média (configuração antiga)</option>
                      )}
                    </select>
                  </label>
                </div>
                <small className="field-note">
                  O servidor sempre recalcula o preço final. Em “Dividir e
                  somar”, cada sabor contribui proporcionalmente para o valor da
                  pizza.
                </small>
                <div className="product-flavor-catalog-config">
                  <div>
                    <b>Sabores permitidos</b>
                    <small>
                      Selecione no catálogo central quais sabores podem ser
                      escolhidos neste produto.
                    </small>
                  </div>
                  <div className="modifier-group-checkboxes flavor-catalog-checkboxes">
                    {(flavors || [])
                      .filter((flavor) => flavor.active !== false)
                      .map((flavor) => {
                        const selected = (productForm.flavorIds || []).includes(
                          flavor.id,
                        );
                        return (
                          <label key={flavor.id} className={selected ? "selected" : ""}>
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleFlavor(flavor.id)}
                            />
                            <span>
                              <b>{flavor.name}</b>
                              <small>
                                {flavor.group?.name || "Sem grupo"} •{" "}
                                {flavor.sizes?.filter((size) => size.available)
                                  .length || 0}{" "}
                                tamanho(s)
                              </small>
                            </span>
                          </label>
                        );
                      })}
                  </div>
                  {(flavors || []).filter((flavor) => flavor.active !== false)
                    .length === 0 && (
                    <small className="field-note">
                      Cadastre os sabores primeiro em Cardápio &gt; Sabores.
                    </small>
                  )}
                </div>
              </div>
            )}
            {sizes.filter((size) => size.active).length > 0 && (
              <div className="product-size-config">
                <div>
                  <b>Tamanhos e preços</b>
                  <small>
                    Marque os tamanhos vendidos neste produto e informe o valor
                    de cada um.
                  </small>
                </div>
                <div className="size-admin-product-grid">
                  {sizes
                    .filter((size) => size.active)
                    .map((size) => {
                      const row = sizeRow(size.id);
                      return (
                        <label key={size.id} className={row ? "selected" : ""}>
                          <input
                            type="checkbox"
                            checked={Boolean(row)}
                            onChange={() => toggleSize(size)}
                          />
                          <span>
                            <b>{size.name}</b>
                            <small>
                              {size.diameterCm
                                ? `${size.diameterCm} cm`
                                : "Tamanho cadastrado"}
                            </small>
                          </span>
                          {row && (
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.price}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) =>
                                setSizePrice(size, e.target.value)
                              }
                            />
                          )}
                        </label>
                      );
                    })}
                </div>
              </div>
            )}
            <div className="simple-stock-editor">
              <label className="switch-label">
                <input
                  type="checkbox"
                  checked={Boolean(productForm.stockTracked)}
                  onChange={(e) =>
                    setProductForm({
                      ...productForm,
                      stockTracked: e.target.checked,
                    })
                  }
                />{" "}
                Controlar estoque simples
              </label>
              {productForm.stockTracked && (
                <div className="two-cols">
                  <label>
                    Quantidade em estoque
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={productForm.stockQuantity}
                      onChange={(e) =>
                        setProductForm({
                          ...productForm,
                          stockQuantity: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Alerta de estoque baixo
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={productForm.stockLowThreshold}
                      onChange={(e) =>
                        setProductForm({
                          ...productForm,
                          stockLowThreshold: e.target.value,
                        })
                      }
                    />
                  </label>
                </div>
              )}
            </div>
            <div className="product-advanced-availability">
              <b>Disponibilidade e margem</b>
              <div className="two-cols">
                <label>
                  Custo estimado
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={productForm.costPrice || 0}
                    onChange={(e) =>
                      setProductForm({
                        ...productForm,
                        costPrice: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Pausar até
                  <input
                    type="datetime-local"
                    value={productForm.pausedUntil || ""}
                    onChange={(e) =>
                      setProductForm({
                        ...productForm,
                        pausedUntil: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Disponível a partir de
                  <input
                    type="time"
                    value={productForm.availableStartTime || ""}
                    onChange={(e) =>
                      setProductForm({
                        ...productForm,
                        availableStartTime: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Disponível até
                  <input
                    type="time"
                    value={productForm.availableEndTime || ""}
                    onChange={(e) =>
                      setProductForm({
                        ...productForm,
                        availableEndTime: e.target.value,
                      })
                    }
                  />
                </label>
              </div>
              <label>
                Ingredientes removíveis
                <input
                  value={productForm.removableIngredients || ""}
                  onChange={(e) =>
                    setProductForm({
                      ...productForm,
                      removableIngredients: e.target.value,
                    })
                  }
                  placeholder="Ex.: cebola, orégano, azeitona"
                />
              </label>
            </div>
            {modifierGroups.filter((group) => group.active).length > 0 && (
              <div className="product-modifier-config">
                <div>
                  <b>Adicionais do produto</b>
                  <small>Escolha quais grupos aparecerão neste produto.</small>
                </div>
                <div className="modifier-group-checkboxes">
                  {modifierGroups
                    .filter((group) => group.active)
                    .map((group) => (
                      <label
                        key={group.id}
                        className={
                          productForm.modifierGroupIds.includes(group.id)
                            ? "selected"
                            : ""
                        }
                      >
                        <input
                          type="checkbox"
                          checked={productForm.modifierGroupIds.includes(
                            group.id,
                          )}
                          onChange={() => toggleGroup(group.id)}
                        />
                        <span>
                          <b>{group.name}</b>
                          <small>
                            {group.required ? "Obrigatório" : "Opcional"} •{" "}
                            {group.options?.filter((o) => o.active).length || 0}{" "}
                            opções
                          </small>
                        </span>
                      </label>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="modal-actions product-modal-actions">
          {!isNew && (
            <div className="danger-zone">
              <small>Área de risco</small>
              <button
                type="button"
                className="subtle-danger archive-button"
                onClick={onArchive}
              >
                <Trash2 size={15} /> Excluir do catálogo
              </button>
            </div>
          )}
          <span />
          <button type="button" className="ghost-dark-btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-btn">
            <Save size={16} />{" "}
            {isNew ? "Adicionar produto" : "Salvar alterações"}
          </button>
        </div>
      </form>
    </div>
  );
}
