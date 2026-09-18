import React, { useEffect, useMemo, useState } from "react";
import { Megaphone, PackagePlus, Pizza, Plus, Trash2, Upload, UtensilsCrossed } from "lucide-react";
import { mediaUrl } from "../../lib/api";
import { money } from "../../lib/format";
import { toIsoDateTime } from "../../lib/dateInput";
import PriorityArrows from "./PriorityArrows";

export default function PromotionsAdmin({
  rows,
  products,
  combos,
  modifierGroups,
  form,
  setForm,
  create,
  update,
  remove,
  updateModifierOption,
  uploadMedia,
  imageUploading,
  reorder,
}) {
  const [mode, setMode] = useState("PRODUCTS");
  const promotionProducts = mode === "COMBOS" ? combos : products;
  const comboIds = useMemo(() => new Set(combos.map((combo) => combo.id)), [combos]);
  const selected = promotionProducts.find((p) => p.id === form.productId);
  useEffect(() => {
    if (mode === "ADDITIONALS" || promotionProducts.some((product) => product.id === form.productId)) return;
    const first = promotionProducts[0];
    setForm((current) => ({ ...current, productId: first?.id || "", originalPrice: first?.basePrice ?? first?.price ?? "", promoPrice: "", sizePrices: {}, title: "", subtitle: "", image: "" }));
  }, [mode, promotionProducts, form.productId]);
  const orderedRows = useMemo(
    () =>
      rows.filter((row) => (Boolean(row.product?.isCombo) || comboIds.has(row.productId)) === (mode === "COMBOS")).sort(
        (a, b) =>
          Number(a.sortOrder || 0) - Number(b.sortOrder || 0) ||
          String(a.title || "").localeCompare(String(b.title || ""), "pt-BR"),
      ),
    [rows, mode, comboIds],
  );
  const orderedProducts = useMemo(
    () =>
      [...promotionProducts].sort(
        (a, b) =>
          Number(a.sortOrder || 0) - Number(b.sortOrder || 0) ||
          String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"),
      ),
    [promotionProducts],
  );
  const additionalGroups = useMemo(
    () =>
      modifierGroups
        .map((group) => [
          group.name,
          (group.options || [])
            .map((item) => ({
              ...item,
              promoKind: "OPTION",
              groupName: group.name,
              groupSortOrder: group.sortOrder || 0,
            }))
            .sort(
              (a, b) =>
                Number(a.sortOrder || 0) - Number(b.sortOrder || 0) ||
                String(a.name || "").localeCompare(
                  String(b.name || ""),
                  "pt-BR",
                ),
            ),
        ])
        .filter(([, items]) => items.length),
    [modifierGroups],
  );
  const additionalRows = useMemo(
    () => additionalGroups.flatMap(([, items]) => items),
    [additionalGroups],
  );
  function chooseProduct(id) {
    const p = promotionProducts.find((row) => row.id === id);
    setForm({
      ...form,
      productId: id,
      originalPrice: p?.basePrice ?? p?.price ?? form.originalPrice,
      promoPrice: "",
      sizePrices: {},
      title: form.title || p?.name || "",
    });
  }
  function saveAdditional(row, patch) {
    return updateModifierOption(row, patch);
  }
  function dt(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function toggleAdditionalPromo(row) {
    if (
      !row.promoActive &&
      (row.promoPrice == null ||
        Number(row.promoPrice) >= Number(row.basePrice ?? row.price))
    ) {
      window.alert(
        "Informe primeiro um preço promocional menor que o preço base.",
      );
      return;
    }
    saveAdditional(row, { promoActive: !row.promoActive });
  }
  return (
    <div className="promotions-control">
      <div className="promotion-kind-tabs">
        <button
          type="button"
          className={mode === "PRODUCTS" ? "active" : ""}
          onClick={() => setMode("PRODUCTS")}
        >
          <Pizza size={17} /> Produtos
        </button>
        <button
          type="button"
          className={mode === "COMBOS" ? "active" : ""}
          onClick={() => setMode("COMBOS")}
        >
          <PackagePlus size={17} /> Combos
        </button>
        <button
          type="button"
          className={mode === "ADDITIONALS" ? "active" : ""}
          onClick={() => setMode("ADDITIONALS")}
        >
          <UtensilsCrossed size={17} /> Adicionais
        </button>
      </div>

      {mode !== "ADDITIONALS" ? (
        <div className="admin-two-column promotions-admin-layout">
          <section className="admin-panel">
            <div className="panel-title">
              <div>
                <span>Vitrine promocional</span>
                <h2>Promoções de {mode === "COMBOS" ? "combos" : "produtos"}</h2>
                <p>
                  A lista abaixo segue somente a prioridade da promoção, sem
                  separar por categoria.
                </p>
              </div>
              <b>{orderedRows.length}</b>
            </div>
            <div className="promotion-admin-list promotion-product-rows">
              {orderedRows.length ? (
                orderedRows.map((r) => (
                  <article
                    key={r.id}
                    className={`promotion-product-editor ${!r.active ? "paused" : ""}`}
                  >
                    <div className="promotion-product-identity">
                      <img
                        src={mediaUrl(r.image) || mediaUrl(r.product?.image)}
                        alt={`Imagem de ${r.product?.name || r.title}`}
                      />
                      <div className="promotion-admin-main">
                        <small>Produto: {r.product?.name}</small>
                        <input
                          aria-label={`Título da promoção de ${r.product?.name || r.title}`}
                          defaultValue={r.title}
                          onBlur={(e) =>
                            e.target.value !== r.title &&
                            update(r, { title: e.target.value })
                          }
                        />
                        <textarea
                          aria-label={`Descrição da promoção de ${r.product?.name || r.title}`}
                          defaultValue={r.subtitle || ""}
                          placeholder="Descrição curta"
                          onBlur={(e) =>
                            e.target.value !== (r.subtitle || "") &&
                            update(r, { subtitle: e.target.value })
                          }
                        />
                      </div>
                    </div>

                    <div className="promotion-pricing-panel">
                      <div className="promotion-section-heading">
                        <span>Preços da oferta</span>
                        <small>
                          Use um valor específico por tamanho ou deixe vazio
                          para aplicar o desconto geral.
                        </small>
                      </div>
                      <div className="promotion-admin-values">
                        <label>
                          <span>Preço base</span>
                          <div className="promo-money-input">
                            <i>R$</i>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              defaultValue={r.originalPrice}
                              onBlur={(e) =>
                                Number(e.target.value) !==
                                  Number(r.originalPrice) &&
                                update(r, {
                                  originalPrice: Number(e.target.value),
                                })
                              }
                            />
                          </div>
                        </label>
                        <label>
                          <span>Preço promocional</span>
                          <div className="promo-money-input featured">
                            <i>R$</i>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              defaultValue={r.promoPrice}
                              onBlur={(e) =>
                                Number(e.target.value) !==
                                  Number(r.promoPrice) &&
                                update(r, {
                                  promoPrice: Number(e.target.value),
                                })
                              }
                            />
                          </div>
                        </label>
                      </div>
                      {(r.product?.availableSizes || []).length > 0 && (
                        <div className="promotion-size-prices compact">
                          {r.product.availableSizes.map((size) => (
                            <label key={size.id}>
                              <span>
                                {size.name}
                                <small>Preço normal: {money(size.price)}</small>
                              </span>
                              <div className="promo-money-input">
                                <i>R$</i>
                                <input
                                  aria-label={`Preço promocional do tamanho ${size.name}`}
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  defaultValue={
                                    r.sizePrices?.[size.sizeId] ?? ""
                                  }
                                  placeholder="Desconto geral"
                                  onBlur={(event) => {
                                    const raw = event.target.value;
                                    const current = { ...(r.sizePrices || {}) };
                                    if (raw === "") delete current[size.sizeId];
                                    else current[size.sizeId] = Number(raw);
                                    update(r, { sizePrices: current });
                                  }}
                                />
                              </div>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="promotion-schedule-fields">
                      <div className="promotion-section-heading">
                        <span>Período da oferta</span>
                        <small>Deixe vazio para manter sem prazo.</small>
                      </div>
                      <label>
                        Início
                        <input
                          type="datetime-local"
                          defaultValue={dt(r.startAt)}
                          onBlur={(e) =>
                            update(r, {
                              startAt: toIsoDateTime(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        Término
                        <input
                          type="datetime-local"
                          defaultValue={dt(r.endAt)}
                          onBlur={(e) =>
                            update(r, { endAt: toIsoDateTime(e.target.value) })
                          }
                        />
                      </label>
                    </div>

                    <div className="promotion-admin-actions">
                      <PriorityArrows
                        value={r.sortOrder}
                        onUp={() => reorder(r, -1)}
                        onDown={() => reorder(r, 1)}
                      />
                      <div className="media-upload-control compact">
                        <label
                          className="upload-icon-button media-upload-standard media-upload-mini"
                          title="Trocar imagem"
                        >
                          <Upload size={16} />
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            disabled={imageUploading}
                            onChange={(e) =>
                              uploadMedia(e.target.files?.[0], (url) =>
                                update(r, { image: url }),
                              )
                            }
                          />
                        </label>
                        <small className="upload-resolution-hint">
                          Resolução recomendada: 1200 × 675 px
                        </small>
                      </div>
                      <button
                        type="button"
                        className={
                          r.active ? "area-toggle active" : "area-toggle"
                        }
                        onClick={() => update(r, { active: !r.active })}
                      >
                        {r.active ? "Ativa" : "Pausada"}
                      </button>
                      <button
                        type="button"
                        className="subtle-danger"
                        onClick={() => remove(r)}
                        title="Remover promoção"
                      >
                        <Trash2 size={16} /> Remover
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="empty-admin">
                  <Megaphone />
                  <p>Nenhuma promoção de produto criada.</p>
                </div>
              )}
            </div>
          </section>
          <form
            className="admin-panel compact-form promotion-create-form"
            onSubmit={create}
          >
            <div className="panel-title">
              <div>
                <span>Nova promoção</span>
                <h2>Adicionar produto em oferta</h2>
              </div>
              <Megaphone />
            </div>
            <label>
              {mode === "COMBOS" ? "Combo" : "Produto"}
              <select
                required
                value={form.productId}
                onChange={(e) => chooseProduct(e.target.value)}
              >
                <option value="">Selecione</option>
                {orderedProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Título
              <input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Ex.: Quarta da Pizza"
              />
            </label>
            <label>
              Descrição
              <textarea
                value={form.subtitle}
                onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
                placeholder="Texto curto da oferta"
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
                  value={form.originalPrice}
                  onChange={(e) =>
                    setForm({ ...form, originalPrice: e.target.value })
                  }
                />
              </label>
              <label>
                Preço promocional
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.promoPrice}
                  onChange={(e) =>
                    setForm({ ...form, promoPrice: e.target.value })
                  }
                />
              </label>
            </div>
            {(selected?.availableSizes || []).length > 0 && (
              <div className="promotion-size-prices">
                <b>Preço promocional por tamanho</b>
                <small>
                  Opcional. Quando vazio, o tamanho usa o desconto geral acima.
                </small>
                {selected.availableSizes.map((size) => (
                  <label key={size.id}>
                    <span>{size.name} <small>base {money(size.price)}</small></span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.sizePrices?.[size.sizeId] ?? ""}
                      placeholder="Valor promocional"
                      onChange={(event) =>
                        setForm({
                          ...form,
                          sizePrices: {
                            ...(form.sizePrices || {}),
                            [size.sizeId]: event.target.value,
                          },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            )}
            <div className="two-cols">
              <label>
                Início opcional
                <input
                  type="datetime-local"
                  value={form.startAt}
                  onChange={(e) =>
                    setForm({ ...form, startAt: e.target.value })
                  }
                />
              </label>
              <label>
                Fim opcional
                <input
                  type="datetime-local"
                  value={form.endAt}
                  onChange={(e) => setForm({ ...form, endAt: e.target.value })}
                />
              </label>
            </div>
            <div className="promo-image-preview">
              {form.image || selected?.image ? (
                <img
                  src={mediaUrl(form.image) || mediaUrl(selected?.image)}
                  alt="Prévia"
                />
              ) : (
                <Megaphone />
              )}
            </div>
            <div className="media-upload-control">
              <label
                className="upload-icon-button media-upload-standard"
                title="Anexar imagem"
              >
                <Upload size={16} />
                <span>{imageUploading ? "Enviando..." : "Anexar imagem"}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={imageUploading}
                  onChange={(e) =>
                    uploadMedia(e.target.files?.[0], (url) =>
                      setForm((x) => ({ ...x, image: url })),
                    )
                  }
                />
              </label>
              <small className="upload-resolution-hint">
                Resolução recomendada: 1200 × 675 px
              </small>
            </div>
            <label>
              Ou URL da imagem
              <input
                value={form.image}
                onChange={(e) => setForm({ ...form, image: e.target.value })}
              />
            </label>
            <label className="switch-label">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />{" "}
              Publicar promoção
            </label>
            <button className="primary-btn full">
              <Plus size={16} /> Criar promoção
            </button>
          </form>
        </div>
      ) : (
        <section className="admin-panel additional-promotions-panel">
          <div className="panel-title">
            <div>
              <span>Promoções internas</span>
              <h2>Adicionais em promoção</h2>
              <p>
                Os adicionais continuam separados pelo grupo ao qual pertencem,
                mas em linhas compactas para comportar muitos itens.
              </p>
            </div>
            <b>{additionalRows.filter((r) => r.promoActive).length} ativas</b>
          </div>
          <div className="additional-promo-groups">
            {additionalGroups.map(([groupName, groupRows]) => (
              <section
                className="additional-promo-group compact"
                key={groupName}
              >
                <div className="promotion-group-title">
                  <UtensilsCrossed size={15} />
                  <b>{groupName}</b>
                  <span>{groupRows.length}</span>
                </div>
                <div className="additional-promo-compact-list">
                  {groupRows.map((row) => (
                    <article
                      key={`${row.promoKind}-${row.id}`}
                      className={row.promoActive ? "promo-enabled" : ""}
                    >
                      <div className="additional-promo-identity">
                        {row.image ? (
                          <img src={mediaUrl(row.image)} alt="" />
                        ) : (
                          <span>
                            <UtensilsCrossed size={18} />
                          </span>
                        )}
                        <div>
                          <b>{row.name}</b>
                          <small>{row.description || row.groupName}</small>
                          {row.promoActive && <em>Promoção ativa</em>}
                        </div>
                      </div>
                      <div className="additional-promo-prices compact">
                        <label>
                          <span>Preço base</span>
                          <div className="money-input">
                            <small>R$</small>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              defaultValue={row.basePrice ?? row.price ?? 0}
                              onBlur={(e) =>
                                Number(e.target.value) !==
                                  Number(row.basePrice ?? row.price ?? 0) &&
                                saveAdditional(row, {
                                  price: Number(e.target.value),
                                })
                              }
                            />
                          </div>
                        </label>
                        <label>
                          <span>Promocional</span>
                          <div className="money-input">
                            <small>R$</small>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              defaultValue={row.promoPrice ?? ""}
                              placeholder="0,00"
                              onBlur={(e) =>
                                saveAdditional(row, {
                                  promoPrice:
                                    e.target.value === ""
                                      ? null
                                      : Number(e.target.value),
                                })
                              }
                            />
                          </div>
                        </label>
                      </div>
                      <div className="additional-promo-schedule compact">
                        <label>
                          Início
                          <input
                            type="datetime-local"
                            defaultValue={dt(row.promoStartAt)}
                            onBlur={(e) =>
                              saveAdditional(row, {
                                promoStartAt: toIsoDateTime(e.target.value),
                              })
                            }
                          />
                        </label>
                        <label>
                          Término
                          <input
                            type="datetime-local"
                            defaultValue={dt(row.promoEndAt)}
                            onBlur={(e) =>
                              saveAdditional(row, {
                                promoEndAt: toIsoDateTime(e.target.value),
                              })
                            }
                          />
                        </label>
                      </div>
                      <div className="additional-promo-actions">
                        <button
                          type="button"
                          className={
                            row.promoActive
                              ? "area-toggle active"
                              : "area-toggle"
                          }
                          onClick={() => toggleAdditionalPromo(row)}
                        >
                          {row.promoActive ? "Ativa" : "Ativar"}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
