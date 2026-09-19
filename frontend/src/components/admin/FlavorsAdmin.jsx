import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ImagePlus,
  Layers3,
  Pencil,
  Plus,
  Save,
  Search,
  Star,
  Tags,
  X,
} from "lucide-react";
import { api, authHeaders, mediaUrl } from "../../lib/api";
import { toIsoDateTime, toLocalDateTimeInput } from "../../lib/dateInput";
import { money } from "../../lib/format";
import { slugify } from "../../lib/slugify";

const normalizeSizeRows = (sizes, configured = [], isNew = false) => {
  const configuredById = new Map(
    (configured || []).map((entry) => [entry.sizeId || entry.size?.id, entry]),
  );
  return (sizes || [])
    .filter((size) => size.active !== false || configuredById.has(size.id))
    .sort(
      (a, b) =>
        Number(a.sortOrder || 0) - Number(b.sortOrder || 0) ||
        String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"),
    )
    .map((size, index) => {
      const configuredSize = configuredById.get(size.id);
      return {
        sizeId: size.id,
        name: size.name,
        pricingMode:
          configuredSize?.pricingMode === "SURCHARGE" ? "SURCHARGE" : "FIXED",
        price: configuredSize?.price ?? "",
        available: configuredSize
          ? configuredSize.available !== false
          : Boolean(isNew && size.active !== false),
        sortOrder: Number(configuredSize?.sortOrder ?? size.sortOrder ?? index),
      };
    });
};

const emptyFlavorForm = (sizes = []) => ({
  name: "",
  slug: "",
  description: "",
  ingredients: "",
  groupId: "",
  image: "",
  active: true,
  featured: false,
  allowHalfAndHalf: true,
  stockTracked: false,
  stockQuantity: 0,
  stockLowThreshold: 5,
  price: "",
  promoPrice: "",
  promoActive: false,
  promoStartAt: "",
  promoEndAt: "",
  sortOrder: 0,
  sizes: normalizeSizeRows(sizes, [], true),
});

const formFromFlavor = (flavor, sizes) => ({
  name: flavor.name || "",
  slug: flavor.slug || slugify(flavor.name),
  description: flavor.description || "",
  ingredients: Array.isArray(flavor.ingredients)
    ? flavor.ingredients.join(", ")
    : "",
  groupId: flavor.groupId || flavor.group?.id || "",
  image: flavor.image || "",
  active: flavor.active !== false,
  featured: Boolean(flavor.featured),
  allowHalfAndHalf: flavor.allowHalfAndHalf !== false,
  stockTracked: Boolean(flavor.stockTracked),
  stockQuantity: Number(flavor.stockQuantity || 0),
  stockLowThreshold: Number(flavor.stockLowThreshold ?? 5),
  price: flavor.basePrice ?? flavor.price ?? "",
  promoPrice: flavor.promoPrice ?? "",
  promoActive: Boolean(flavor.promoActive),
  promoStartAt: toLocalDateTimeInput(flavor.promoStartAt),
  promoEndAt: toLocalDateTimeInput(flavor.promoEndAt),
  sortOrder: Number(flavor.sortOrder || 0),
  sizes: normalizeSizeRows(sizes, flavor.sizes, false),
});

const emptyGroupForm = (categories = []) => ({
  name: "",
  slug: "",
  description: "",
  categoryId: categories.find((category) => category.active !== false)?.id || "",
  active: true,
  sortOrder: 0,
});

function ingredientList(value) {
  return String(value || "")
    .split(/[\n,;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function FlavorsAdmin({
  session,
  flavors = [],
  groups = [],
  sizes = [],
  categories = [],
  reload,
  notify,
  fail,
  requestCrop,
  imageUploading = false,
}) {
  const [flavorForm, setFlavorForm] = useState(() => emptyFlavorForm(sizes));
  const [editingFlavorId, setEditingFlavorId] = useState(null);
  const [groupForm, setGroupForm] = useState(() => emptyGroupForm(categories));
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [savingFlavor, setSavingFlavor] = useState(false);
  const [savingGroup, setSavingGroup] = useState(false);
  const editorRef = useRef(null);
  const headers = authHeaders(session?.token);

  const orderedGroups = useMemo(
    () =>
      [...groups].sort(
        (a, b) =>
          Number(a.category?.sortOrder || 0) -
            Number(b.category?.sortOrder || 0) ||
          Number(a.sortOrder || 0) - Number(b.sortOrder || 0) ||
          String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"),
      ),
    [groups],
  );
  const visibleFlavors = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return [...flavors]
      .filter((flavor) => {
        const flavorGroupId = flavor.groupId || flavor.group?.id || "";
        if (groupFilter && flavorGroupId !== groupFilter) return false;
        return (
          !query ||
          `${flavor.name || ""} ${flavor.description || ""} ${
            flavor.group?.name || ""
          } ${Array.isArray(flavor.ingredients) ? flavor.ingredients.join(" ") : ""}`
            .toLocaleLowerCase("pt-BR")
            .includes(query)
        );
      })
      .sort(
        (a, b) =>
          Number(a.sortOrder || 0) - Number(b.sortOrder || 0) ||
          String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"),
      );
  }, [flavors, groupFilter, search]);

  useEffect(() => {
    setFlavorForm((current) => {
      const configuredById = new Map(
        current.sizes.map((entry) => [entry.sizeId, entry]),
      );
      const next = normalizeSizeRows(
        sizes,
        sizes.map((size) => configuredById.get(size.id)).filter(Boolean),
        !editingFlavorId,
      );
      return { ...current, sizes: next };
    });
  }, [sizes, editingFlavorId]);

  useEffect(() => {
    if (!flavorForm.groupId) {
      const firstGroup = orderedGroups.find((group) => group.active !== false);
      if (firstGroup)
        setFlavorForm((current) => ({ ...current, groupId: firstGroup.id }));
    }
  }, [flavorForm.groupId, orderedGroups]);

  useEffect(() => {
    if (!groupForm.categoryId) {
      const firstCategory = categories.find((category) => category.active !== false);
      if (firstCategory)
        setGroupForm((current) => ({ ...current, categoryId: firstCategory.id }));
    }
  }, [categories, groupForm.categoryId]);

  function reportClientError(message) {
    if (fail)
      fail({ response: { data: { message } } }, message);
    else window.alert(message);
  }

  function resetFlavor() {
    const next = emptyFlavorForm(sizes);
    next.groupId = orderedGroups.find((group) => group.active !== false)?.id || "";
    setFlavorForm(next);
    setEditingFlavorId(null);
  }

  function resetGroup() {
    setGroupForm(emptyGroupForm(categories));
    setEditingGroupId(null);
  }

  function setSizeValue(sizeId, patch) {
    setFlavorForm((current) => ({
      ...current,
      sizes: current.sizes.map((entry) =>
        entry.sizeId === sizeId ? { ...entry, ...patch } : entry,
      ),
    }));
  }

  async function submitFlavor(event) {
    event.preventDefault();
    if (!flavorForm.sizes.length)
      return reportClientError("Cadastre ao menos um tamanho antes de criar sabores.");
    if (!flavorForm.sizes.some((entry) => entry.available))
      return reportClientError("Disponibilize o sabor em pelo menos um tamanho.");
    const basePrice = Number(flavorForm.price);
    const promoPrice =
      flavorForm.promoPrice === "" ? null : Number(flavorForm.promoPrice);
    if (
      flavorForm.promoActive &&
      (promoPrice == null || promoPrice < 0 || promoPrice >= basePrice)
    )
      return reportClientError(
        "O valor promocional deve ser menor que o preço base.",
      );

    const payload = {
      ...flavorForm,
      name: flavorForm.name.trim(),
      slug: slugify(flavorForm.slug || flavorForm.name),
      description: flavorForm.description.trim(),
      ingredients: ingredientList(flavorForm.ingredients),
      image: flavorForm.image.trim(),
      price: basePrice,
      promoPrice,
      promoActive: flavorForm.promoActive && promoPrice != null,
      promoStartAt: toIsoDateTime(flavorForm.promoStartAt),
      promoEndAt: toIsoDateTime(flavorForm.promoEndAt),
      sortOrder: Number(flavorForm.sortOrder || 0),
      stockQuantity: Number(flavorForm.stockQuantity || 0),
      stockLowThreshold: Number(flavorForm.stockLowThreshold || 0),
      sizes: flavorForm.sizes.map((entry, index) => ({
        sizeId: entry.sizeId,
        pricingMode:
          entry.pricingMode === "SURCHARGE" ? "SURCHARGE" : "FIXED",
        price:
          entry.price === ""
            ? entry.pricingMode === "SURCHARGE"
              ? 0
              : basePrice
            : Number(entry.price),
        available: Boolean(entry.available),
        sortOrder: Number(entry.sortOrder ?? index),
      })),
    };

    setSavingFlavor(true);
    try {
      if (editingFlavorId)
        await api.patch(`/admin/flavors/${editingFlavorId}`, payload, headers);
      else await api.post("/admin/flavors", payload, headers);
      await reload?.();
      notify?.(editingFlavorId ? "Sabor atualizado." : "Sabor criado.");
      resetFlavor();
    } catch (error) {
      fail?.(error, "Não foi possível salvar o sabor.");
    } finally {
      setSavingFlavor(false);
    }
  }

  async function toggleFlavor(flavor) {
    try {
      await api.patch(
        `/admin/flavors/${flavor.id}`,
        { active: flavor.active === false },
        headers,
      );
      await reload?.();
      notify?.(flavor.active === false ? "Sabor reativado." : "Sabor pausado.");
    } catch (error) {
      fail?.(error, "Não foi possível alterar o sabor.");
    }
  }

  async function submitGroup(event) {
    event.preventDefault();
    const payload = {
      ...groupForm,
      name: groupForm.name.trim(),
      slug: slugify(groupForm.slug || groupForm.name),
      description: groupForm.description.trim() || null,
      sortOrder: Number(groupForm.sortOrder || 0),
    };
    setSavingGroup(true);
    try {
      if (editingGroupId)
        await api.patch(`/admin/flavor-groups/${editingGroupId}`, payload, headers);
      else await api.post("/admin/flavor-groups", payload, headers);
      await reload?.();
      notify?.(editingGroupId ? "Grupo atualizado." : "Grupo de sabores criado.");
      resetGroup();
    } catch (error) {
      fail?.(error, "Não foi possível salvar o grupo de sabores.");
    } finally {
      setSavingGroup(false);
    }
  }

  async function toggleGroup(group) {
    try {
      await api.patch(
        `/admin/flavor-groups/${group.id}`,
        { active: group.active === false },
        headers,
      );
      await reload?.();
      notify?.(
        group.active === false ? "Grupo reativado." : "Grupo desativado.",
      );
    } catch (error) {
      fail?.(error, "Não foi possível alterar o grupo de sabores.");
    }
  }

  function startFlavorEdit(flavor) {
    setEditingFlavorId(flavor.id);
    setFlavorForm(formFromFlavor(flavor, sizes));
    requestAnimationFrame(() =>
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  function startGroupEdit(group) {
    setEditingGroupId(group.id);
    setGroupForm({
      name: group.name || "",
      slug: group.slug || slugify(group.name),
      description: group.description || "",
      categoryId: group.categoryId || group.category?.id || "",
      active: group.active !== false,
      sortOrder: Number(group.sortOrder || 0),
    });
  }

  return (
    <div className="admin-stack flavors-admin">
      <section className="admin-panel">
        <div className="panel-title">
          <div>
            <span>Catálogo central</span>
            <h2>Sabores de pizza</h2>
            <p>
              Sabores ligados a produtos aparecem automaticamente e devem ser
              editados na aba Produtos. Use este cadastro para sabores
              independentes.
            </p>
          </div>
          <b>{flavors.length}</b>
        </div>

        <div className="two-cols">
          <label>
            <span className="sr-only">Buscar sabores</span>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Search size={16} aria-hidden="true" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar sabor, ingrediente ou grupo"
              />
            </span>
          </label>
          <label>
            Grupo
            <select
              value={groupFilter}
              onChange={(event) => setGroupFilter(event.target.value)}
            >
              <option value="">Todos os grupos</option>
              {orderedGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="category-admin-list" style={{ marginTop: 16 }}>
          {visibleFlavors.map((flavor) => (
            <article
              key={flavor.id}
              className={flavor.active === false ? "paused" : ""}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span
                  style={{
                    width: 52,
                    height: 52,
                    flex: "0 0 52px",
                    borderRadius: 12,
                    overflow: "hidden",
                    display: "grid",
                    placeItems: "center",
                    background: "rgba(127, 127, 127, .1)",
                  }}
                >
                  {flavor.image ? (
                    <img
                      src={mediaUrl(flavor.image)}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <Layers3 size={20} aria-hidden="true" />
                  )}
                </span>
                <span style={{ display: "grid", gap: 3 }}>
                  <b>
                    {flavor.name}{" "}
                    {flavor.featured && <Star size={13} aria-label="Destaque" />}
                  </b>
                  <small>
                    {money(flavor.basePrice ?? flavor.price)} •{" "}
                    {(flavor.sizes || []).filter((size) => size.available !== false).length} tamanho(s)
                  </small>
                  <small>
                    {flavor.stockTracked
                      ? `Estoque: ${flavor.stockQuantity || 0}`
                      : "Estoque não controlado"}
                    {Number(flavor.productsCount || 0) > 0
                      ? ` • usado em ${flavor.productsCount} produto(s)`
                      : ""}
                  </small>
                  {flavor.sourceProductId && (
                    <small className="managed-flavor-note">
                      Gerenciado em Produtos
                    </small>
                  )}
                </span>
              </div>
              <span>{flavor.group?.name || "Sem grupo"}</span>
              {flavor.sourceProductId ? (
                <span className={flavor.active !== false ? "area-toggle active" : "area-toggle"}>
                  {flavor.active !== false ? "Ativo" : "Pausado"}
                </span>
              ) : (
                <>
                  <button
                    type="button"
                    className={flavor.active !== false ? "area-toggle active" : "area-toggle"}
                    onClick={() => toggleFlavor(flavor)}
                    aria-label={`${flavor.active !== false ? "Pausar" : "Reativar"} ${flavor.name}`}
                  >
                    {flavor.active !== false ? "Ativo" : "Pausado"}
                  </button>
                  <button
                    type="button"
                    className="icon-action"
                    onClick={() => startFlavorEdit(flavor)}
                    aria-label={`Editar ${flavor.name}`}
                  >
                    <Pencil size={16} /> Editar
                  </button>
                </>
              )}
            </article>
          ))}
          {!visibleFlavors.length && (
            <div className="empty-state">
              Nenhum sabor corresponde aos filtros selecionados.
            </div>
          )}
        </div>
      </section>

      <form
        ref={editorRef}
        className="admin-panel compact-form"
        onSubmit={submitFlavor}
      >
        <div className="panel-title">
          <div>
            <span>{editingFlavorId ? "Edição" : "Novo sabor"}</span>
            <h2>{editingFlavorId ? "Editar sabor" : "Cadastrar sabor"}</h2>
          </div>
          {editingFlavorId && (
            <button type="button" className="outline-btn" onClick={resetFlavor}>
              <X size={16} /> Cancelar
            </button>
          )}
        </div>

        <div className="two-cols">
          <label>
            Nome
            <input
              required
              minLength="2"
              maxLength="100"
              value={flavorForm.name}
              onChange={(event) =>
                setFlavorForm((current) => ({
                  ...current,
                  name: event.target.value,
                  slug:
                    editingFlavorId || current.slug
                      ? current.slug
                      : slugify(event.target.value),
                }))
              }
              placeholder="Ex.: Calabresa"
            />
          </label>
          <label>
            Identificador (slug)
            <input
              required
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              value={flavorForm.slug}
              onChange={(event) =>
                setFlavorForm((current) => ({
                  ...current,
                  slug: slugify(event.target.value),
                }))
              }
              placeholder="calabresa"
            />
          </label>
          <label>
            Grupo
            <select
              required
              value={flavorForm.groupId}
              onChange={(event) =>
                setFlavorForm((current) => ({
                  ...current,
                  groupId: event.target.value,
                }))
              }
            >
              <option value="" disabled>
                Selecione o grupo
              </option>
              {orderedGroups.map((group) => (
                <option key={group.id} value={group.id} disabled={group.active === false}>
                  {group.name} — {group.category?.name || "Sem categoria"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Ordem
            <input
              type="number"
              min="0"
              step="1"
              value={flavorForm.sortOrder}
              onChange={(event) =>
                setFlavorForm((current) => ({
                  ...current,
                  sortOrder: event.target.value,
                }))
              }
            />
          </label>
        </div>

        <label>
          Descrição para o cardápio
          <textarea
            required
            maxLength="500"
            value={flavorForm.description}
            onChange={(event) =>
              setFlavorForm((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
            placeholder="Descreva o sabor para o cliente."
          />
        </label>
        <label>
          Ingredientes
          <textarea
            maxLength="1000"
            value={flavorForm.ingredients}
            onChange={(event) =>
              setFlavorForm((current) => ({
                ...current,
                ingredients: event.target.value,
              }))
            }
            placeholder="Muçarela, calabresa, cebola (separe por vírgula ou linha)"
          />
        </label>

        <div className="two-cols">
          <label>
            Preço base (R$)
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={flavorForm.price}
              onChange={(event) =>
                setFlavorForm((current) => ({
                  ...current,
                  price: event.target.value,
                }))
              }
              placeholder="39,90"
            />
          </label>
          <label>
            Preço promocional (R$)
            <input
              type="number"
              min="0"
              step="0.01"
              value={flavorForm.promoPrice}
              onChange={(event) =>
                setFlavorForm((current) => ({
                  ...current,
                  promoPrice: event.target.value,
                }))
              }
              placeholder="Opcional"
            />
          </label>
          <label>
            Início da promoção
            <input
              type="datetime-local"
              value={flavorForm.promoStartAt}
              onChange={(event) =>
                setFlavorForm((current) => ({
                  ...current,
                  promoStartAt: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Fim da promoção
            <input
              type="datetime-local"
              value={flavorForm.promoEndAt}
              min={flavorForm.promoStartAt || undefined}
              onChange={(event) =>
                setFlavorForm((current) => ({
                  ...current,
                  promoEndAt: event.target.value,
                }))
              }
            />
          </label>
        </div>
        <label className="switch-label">
          <input
            type="checkbox"
            checked={flavorForm.promoActive}
            onChange={(event) =>
              setFlavorForm((current) => ({
                ...current,
                promoActive: event.target.checked,
              }))
            }
          />
          Publicar o preço promocional
        </label>

        <div className="two-cols">
          <label>
            URL da foto
            <input
              value={flavorForm.image}
              onChange={(event) =>
                setFlavorForm((current) => ({
                  ...current,
                  image: event.target.value,
                }))
              }
              placeholder="https://..."
            />
          </label>
          <div className="media-upload-control upload-resolution-field">
            <label className="upload-icon-button media-upload-standard">
              <ImagePlus size={16} aria-hidden="true" />
              <span>{imageUploading ? "Preparando imagem..." : "Escolher foto"}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={imageUploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file && requestCrop)
                    requestCrop(
                      file,
                      (image) =>
                        setFlavorForm((current) => ({ ...current, image })),
                      "Foto do sabor",
                      4 / 3,
                    );
                  event.target.value = "";
                }}
              />
            </label>
            <small className="upload-resolution-hint">
              Resolução recomendada: 1200 × 900 px
              <br />Proporção recomendada: 4:3
            </small>
          </div>
        </div>
        {flavorForm.image && (
          <div className="promo-image-preview">
            <img src={mediaUrl(flavorForm.image)} alt="Prévia do sabor" />
          </div>
        )}

        <fieldset
          style={{
            border: "1px solid var(--line)",
            borderRadius: 14,
            padding: 14,
            display: "grid",
            gap: 10,
          }}
        >
          <legend>
            <b>Disponibilidade e preço por tamanho</b>
          </legend>
          <small>
            Em “Preço fixo”, informe o valor total. Em “Acréscimo”, informe
            apenas quanto este sabor adiciona ao preço da pizza.
          </small>
          {flavorForm.sizes.map((entry) => (
            <div
              key={entry.sizeId}
              className="two-cols"
              style={{
                alignItems: "end",
                padding: 10,
                border: "1px solid var(--line)",
                borderRadius: 12,
              }}
            >
              <label className="switch-label">
                <input
                  type="checkbox"
                  checked={entry.available}
                  onChange={(event) =>
                    setSizeValue(entry.sizeId, { available: event.target.checked })
                  }
                />
                {entry.name}
              </label>
              <label>
                Regra de preço
                <select
                  value={entry.pricingMode}
                  onChange={(event) =>
                    setSizeValue(entry.sizeId, {
                      pricingMode: event.target.value,
                    })
                  }
                >
                  <option value="FIXED">Preço fixo</option>
                  <option value="SURCHARGE">Acréscimo</option>
                </select>
              </label>
              <label>
                Valor (R$)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={entry.price}
                  onChange={(event) =>
                    setSizeValue(entry.sizeId, { price: event.target.value })
                  }
                  placeholder={
                    entry.pricingMode === "SURCHARGE"
                      ? "0,00"
                      : flavorForm.price || "Preço base"
                  }
                />
              </label>
            </div>
          ))}
          {!flavorForm.sizes.length && (
            <small>Crie um tamanho de pizza para configurar este sabor.</small>
          )}
        </fieldset>

        <fieldset
          style={{
            border: "1px solid var(--line)",
            borderRadius: 14,
            padding: 14,
            display: "grid",
            gap: 10,
          }}
        >
          <legend>
            <b>Publicação e estoque</b>
          </legend>
          <div className="two-cols">
            <label className="switch-label">
              <input
                type="checkbox"
                checked={flavorForm.active}
                onChange={(event) =>
                  setFlavorForm((current) => ({
                    ...current,
                    active: event.target.checked,
                  }))
                }
              />
              Sabor ativo
            </label>
            <label className="switch-label">
              <input
                type="checkbox"
                checked={flavorForm.featured}
                onChange={(event) =>
                  setFlavorForm((current) => ({
                    ...current,
                    featured: event.target.checked,
                  }))
                }
              />
              Destacar no cardápio
            </label>
            <label className="switch-label">
              <input
                type="checkbox"
                checked={flavorForm.allowHalfAndHalf}
                onChange={(event) =>
                  setFlavorForm((current) => ({
                    ...current,
                    allowHalfAndHalf: event.target.checked,
                  }))
                }
              />
              Permitir meio a meio
            </label>
            <label className="switch-label">
              <input
                type="checkbox"
                checked={flavorForm.stockTracked}
                onChange={(event) =>
                  setFlavorForm((current) => ({
                    ...current,
                    stockTracked: event.target.checked,
                  }))
                }
              />
              Controlar estoque
            </label>
          </div>
          {flavorForm.stockTracked && (
            <div className="two-cols">
              <label>
                Quantidade em estoque
                <input
                  required
                  type="number"
                  min="0"
                  step="1"
                  value={flavorForm.stockQuantity}
                  onChange={(event) =>
                    setFlavorForm((current) => ({
                      ...current,
                      stockQuantity: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Avisar quando restarem
                <input
                  required
                  type="number"
                  min="0"
                  step="1"
                  value={flavorForm.stockLowThreshold}
                  onChange={(event) =>
                    setFlavorForm((current) => ({
                      ...current,
                      stockLowThreshold: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
          )}
        </fieldset>

        <button
          className="primary-btn full"
          disabled={savingFlavor || imageUploading || !flavorForm.sizes.length}
        >
          {editingFlavorId ? <Save size={16} /> : <Plus size={16} />}
          {savingFlavor
            ? "Salvando..."
            : editingFlavorId
              ? "Salvar sabor"
              : "Criar sabor"}
        </button>
      </form>

      <div className="admin-two-column">
        <section className="admin-panel">
          <div className="panel-title">
            <div>
              <span>Organização</span>
              <h2>Grupos de sabores</h2>
              <p>
                Organize sabores por categoria, como tradicionais, especiais,
                premium e doces.
              </p>
            </div>
            <b>{groups.length}</b>
          </div>
          <div className="category-admin-list">
            {orderedGroups.map((group) => (
              <article key={group.id} className={group.active === false ? "paused" : ""}>
                <div>
                  <b>{group.name}</b>
                  <small>
                    {group.category?.name || "Sem categoria"} •{" "}
                    {group.flavorsCount ?? group._count?.flavors ?? 0} sabor(es)
                  </small>
                </div>
                <span>{group.slug}</span>
                <button
                  type="button"
                  className={group.active !== false ? "area-toggle active" : "area-toggle"}
                  onClick={() => toggleGroup(group)}
                  aria-label={`${group.active !== false ? "Desativar" : "Reativar"} ${group.name}`}
                >
                  {group.active !== false ? "Ativo" : "Inativo"}
                </button>
                <button
                  type="button"
                  className="icon-action"
                  onClick={() => startGroupEdit(group)}
                  aria-label={`Editar ${group.name}`}
                >
                  <Pencil size={15} />
                </button>
              </article>
            ))}
          </div>
        </section>

        <form className="admin-panel compact-form" onSubmit={submitGroup}>
          <div className="panel-title">
            <div>
              <span>{editingGroupId ? "Edição" : "Novo grupo"}</span>
              <h2>{editingGroupId ? "Editar grupo" : "Criar grupo"}</h2>
            </div>
            {editingGroupId ? (
              <button type="button" className="outline-btn" onClick={resetGroup}>
                <X size={16} />
              </button>
            ) : (
              <Tags aria-hidden="true" />
            )}
          </div>
          <label>
            Categoria do cardápio
            <select
              required
              value={groupForm.categoryId}
              onChange={(event) =>
                setGroupForm((current) => ({
                  ...current,
                  categoryId: event.target.value,
                }))
              }
            >
              <option value="" disabled>
                Selecione a categoria
              </option>
              {categories.map((category) => (
                <option
                  key={category.id}
                  value={category.id}
                  disabled={category.active === false}
                >
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Nome
            <input
              required
              minLength="2"
              maxLength="80"
              value={groupForm.name}
              onChange={(event) =>
                setGroupForm((current) => ({
                  ...current,
                  name: event.target.value,
                  slug:
                    editingGroupId || current.slug
                      ? current.slug
                      : slugify(event.target.value),
                }))
              }
              placeholder="Ex.: Especiais"
            />
          </label>
          <label>
            Identificador (slug)
            <input
              required
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              value={groupForm.slug}
              onChange={(event) =>
                setGroupForm((current) => ({
                  ...current,
                  slug: slugify(event.target.value),
                }))
              }
              placeholder="especiais"
            />
          </label>
          <label>
            Descrição
            <textarea
              maxLength="240"
              value={groupForm.description}
              onChange={(event) =>
                setGroupForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              placeholder="Como estes sabores serão agrupados."
            />
          </label>
          <label>
            Ordem
            <input
              type="number"
              min="0"
              step="1"
              value={groupForm.sortOrder}
              onChange={(event) =>
                setGroupForm((current) => ({
                  ...current,
                  sortOrder: event.target.value,
                }))
              }
            />
          </label>
          <label className="switch-label">
            <input
              type="checkbox"
              checked={groupForm.active}
              onChange={(event) =>
                setGroupForm((current) => ({
                  ...current,
                  active: event.target.checked,
                }))
              }
            />
            Grupo ativo
          </label>
          <button className="primary-btn full" disabled={savingGroup}>
            {editingGroupId ? <Save size={16} /> : <Plus size={16} />}
            {savingGroup
              ? "Salvando..."
              : editingGroupId
                ? "Salvar grupo"
                : "Criar grupo"}
          </button>
        </form>
      </div>
    </div>
  );
}
