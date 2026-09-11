import React, { useEffect, useMemo, useState } from "react";
import {
  Check,
  Layers3,
  MessageSquareText,
  Plus,
  ShoppingBag,
  X,
} from "lucide-react";
import { money } from "../lib/format";
import { mediaUrl } from "../lib/api";
import {
  customizerBlockReason,
  initialModifierSelections,
} from "../lib/productCustomizer";

export default function PizzaBuilderModal({
  baseProduct,
  onClose,
  onAdd,
  submitLabel = "Adicionar à sacola",
}) {
  const sizes = useMemo(
    () =>
      (baseProduct.availableSizes || []).filter(
        (size) => size.active !== false,
      ),
    [baseProduct],
  );
  const eligible = useMemo(() => {
    const rows = (baseProduct.availableFlavors || []).filter(
      (flavor) => flavor.active !== false && flavor.stockAvailable !== false,
    );
    return [...rows].sort((a, b) =>
      a.id === baseProduct.id
        ? -1
        : b.id === baseProduct.id
          ? 1
          : Number(a.sortOrder || 0) - Number(b.sortOrder || 0),
    );
  }, [baseProduct]);
  const modifierGroups = useMemo(
    () =>
      (baseProduct.availableModifierGroups || []).filter(
        (group) =>
          group.active !== false &&
          (group.options || []).some((option) => option.active !== false),
      ),
    [baseProduct],
  );
  const maxFlavors = Math.max(
    1,
    Math.min(4, Number(baseProduct.maxFlavors || 1), eligible.length || 1),
  );
  const hasFlavorChoice = Boolean(
    baseProduct.allowFlavorSplit && eligible.length,
  );
  const defaultSize =
    sizes.find((size) => size.slug === "media") || sizes[0] || null;
  const [selectedSizeId, setSelectedSizeId] = useState(defaultSize?.id || "");
  const [targetCount, setTargetCount] = useState(hasFlavorChoice ? 1 : 0);
  const [selected, setSelected] = useState(
    hasFlavorChoice ? [baseProduct.id] : [],
  );
  const [selectedOptions, setSelectedOptions] = useState(() =>
    initialModifierSelections(modifierGroups),
  );
  const [notes, setNotes] = useState("");
  const selectedSize =
    sizes.find((size) => size.id === selectedSizeId) || defaultSize;
  const chosen = eligible.filter((flavor) => selected.includes(flavor.id));

  const baseDiscount = baseProduct.compareAtPrice
    ? Math.max(
        0,
        Number(baseProduct.compareAtPrice) - Number(baseProduct.price),
      )
    : 0;
  const baseOriginalPrice = selectedSize
    ? Number(selectedSize.price)
    : Number(
        baseProduct.basePrice ??
          baseProduct.compareAtPrice ??
          baseProduct.price,
      );
  const basePrice = selectedSize
    ? Math.max(0, baseOriginalPrice - baseDiscount)
    : Number(baseProduct.price);
  function flavorOriginalPrice(flavor) {
    if (flavor.id === baseProduct.id) return baseOriginalPrice;
    if (selectedSize) {
      const same = (flavor.availableSizes || []).find(
        (size) => size.slug === selectedSize.slug,
      );
      if (same) return Number(same.price);
    }
    return Number(
      flavor.basePrice ??
        flavor.compareAtPrice ??
        flavor.price ??
        baseOriginalPrice,
    );
  }
  function flavorPrice(flavor) {
    if (flavor.id === baseProduct.id) return basePrice;
    const original = flavorOriginalPrice(flavor);
    const discount = flavor.compareAtPrice
      ? Math.max(0, Number(flavor.compareAtPrice) - Number(flavor.price))
      : 0;
    return Math.max(0, original - discount);
  }
  const chosenPrices = chosen.map(flavorPrice);
  const chosenOriginalPrices = chosen.map(flavorOriginalPrice);
  const proportionalFlavorPricing = baseProduct.flavorPricingMode === "SUM";
  const sumDivisor = Math.max(1, targetCount || chosen.length || 1);
  const flavoredPrice = chosen.length
    ? proportionalFlavorPricing
      ? chosenPrices.reduce((sum, value) => sum + value, 0) / sumDivisor
      : Math.max(basePrice, ...chosenPrices)
    : basePrice;
  const originalFlavoredPrice = chosen.length
    ? proportionalFlavorPricing
      ? chosenOriginalPrices.reduce((sum, value) => sum + value, 0) / sumDivisor
      : Math.max(baseOriginalPrice, ...chosenOriginalPrices)
    : baseOriginalPrice;
  const flavorContribution = (flavor) => flavorPrice(flavor) / sumDivisor;
  const optionList = modifierGroups
    .flatMap((group) =>
      (selectedOptions[group.id] || []).map((id) => ({
        group,
        option: group.options.find((option) => option.id === id),
      })),
    )
    .filter((entry) => entry.option);
  const optionTotal = optionList.reduce(
    (sum, entry) => sum + Number(entry.option.price || 0),
    0,
  );
  const originalOptionTotal = optionList.reduce(
    (sum, entry) =>
      sum +
      Number(
        entry.option.basePrice ??
          entry.option.compareAtPrice ??
          entry.option.price ??
          0,
      ),
    0,
  );
  const total = flavoredPrice + optionTotal;
  const originalTotal = originalFlavoredPrice + originalOptionTotal;
  const hasCurrentDiscount = originalTotal > total + 0.005;

  useEffect(() => {
    if (!hasFlavorChoice) return;
    setSelected((current) => {
      const extras = current
        .filter((id) => id !== baseProduct.id)
        .slice(0, Math.max(0, targetCount - 1));
      return [baseProduct.id, ...extras];
    });
  }, [targetCount, hasFlavorChoice, baseProduct.id]);

  function toggleFlavor(id) {
    if (id === baseProduct.id) return;
    setSelected((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      if (current.length >= targetCount) return current;
      return [...current, id];
    });
  }
  function toggleOption(group, id) {
    setSelectedOptions((current) => {
      const selectedIds = current[group.id] || [];
      if (selectedIds.includes(id))
        return {
          ...current,
          [group.id]: selectedIds.filter((value) => value !== id),
        };
      if (selectedIds.length >= Number(group.maxSelect || 1)) return current;
      return { ...current, [group.id]: [...selectedIds, id] };
    });
  }
  function validGroup(group) {
    const count = (selectedOptions[group.id] || []).length;
    const minimum = group.required
      ? Math.max(1, Number(group.minSelect || 0))
      : Number(group.minSelect || 0);
    return count >= minimum && count <= Number(group.maxSelect || 1);
  }
  const blockReason = customizerBlockReason({
    sizes,
    selectedSize,
    hasFlavorChoice,
    chosenCount: chosen.length,
    targetCount,
    modifierGroups,
    selectedOptions,
  });
  const canAdd = !blockReason;
  function add() {
    if (!canAdd) return;
    const optionIds = optionList.map((entry) => entry.option.id);
    const cartKey = [
      baseProduct.id,
      selectedSize?.id || "sem-tamanho",
      [...selected].sort().join("-"),
      [...optionIds].sort().join("-"),
      notes.trim().toLowerCase(),
    ].join("::");
    const label = [
      baseProduct.name,
      selectedSize?.name,
      chosen.length > 1 ? chosen.map((f) => f.name).join(" / ") : null,
    ]
      .filter(Boolean)
      .join(" • ");
    onAdd({
      cartKey,
      productId: baseProduct.id,
      name: label,
      price: total,
      image: baseProduct.image,
      quantity: 1,
      notes: notes.trim(),
      sizeId: selectedSize?.id || null,
      sizeName: selectedSize?.name || null,
      flavorIds: chosen.map((f) => f.id),
      flavors: chosen.map((f) => ({
        id: f.id,
        name: f.name,
        price: flavorPrice(f),
        image: f.image,
      })),
      optionIds,
      options: optionList.map(({ group, option }) => ({
        id: option.id,
        groupId: group.id,
        groupName: group.name,
        name: option.name,
        price: Number(option.price || 0),
        image: option.image,
      })),
    });
    onClose();
  }

  return (
    <div
      className="modal-backdrop product-customizer-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        className="pizza-builder-modal product-customizer-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Personalizar produto"
      >
        <div className="modal-head">
          <div>
            <span className="eyebrow dark">Personalize seu pedido</span>
            <h2>{baseProduct.name}</h2>
            <p>{baseProduct.description}</p>
          </div>
          <button className="icon-close" onClick={onClose} aria-label="Fechar">
            <X />
          </button>
        </div>
        <div className="customizer-product-summary">
          <img src={mediaUrl(baseProduct.image)} alt={baseProduct.name} />
          <div>
            <small>Valor do item</small>
            {hasCurrentDiscount && <del>{money(originalTotal)}</del>}
            <strong>{money(total)}</strong>
            <span className="customizer-price-live-note">
              Atualiza ao escolher tamanho, sabores e adicionais.
            </span>
          </div>
        </div>

        {sizes.length > 0 && (
          <section className="customizer-section">
            <div className="customizer-section-head">
              <div>
                <b>Escolha o tamanho</b>
                <small>
                  O valor muda automaticamente de acordo com o tamanho.
                </small>
              </div>
            </div>
            <div className="size-choice-grid">
              {sizes.map((size) => (
                <button
                  key={size.id}
                  type="button"
                  className={
                    selectedSize?.id === size.id
                      ? "size-choice active"
                      : "size-choice"
                  }
                  onClick={() => setSelectedSizeId(size.id)}
                >
                  <span>
                    <b>{size.name}</b>
                    {size.diameterCm && <small>{size.diameterCm} cm</small>}
                  </span>
                  <strong>
                    {money(Math.max(0, Number(size.price) - baseDiscount))}
                  </strong>
                  {selectedSize?.id === size.id && <Check size={16} />}
                </button>
              ))}
            </div>
          </section>
        )}

        {hasFlavorChoice && (
          <section className="customizer-section">
            <div className="customizer-section-head">
              <div>
                <b>Escolha seus sabores</b>
                <small>
                  O sabor do produto escolhido fica fixo. Aumente a quantidade
                  para combinar outros sabores.
                </small>
              </div>
              <span>
                {chosen.length}/{targetCount}
              </span>
            </div>
            <div className="flavor-count-choice compact-count">
              <div>
                <Layers3 />
                <span>
                  <b>Quantidade de sabores</b>
                  <small>Escolha quantas partes deseja</small>
                </span>
              </div>
              <div>
                {Array.from({ length: maxFlavors }, (_, i) => i + 1).map(
                  (n) => (
                    <button
                      key={n}
                      type="button"
                      className={targetCount === n ? "active" : ""}
                      onClick={() => setTargetCount(n)}
                    >
                      {n}
                    </button>
                  ),
                )}
              </div>
            </div>
            <div className="flavor-grid flavor-image-grid">
              {eligible.map((flavor) => {
                const active = selected.includes(flavor.id),
                  locked = flavor.id === baseProduct.id,
                  blocked = !active && selected.length >= targetCount;
                return (
                  <button
                    key={flavor.id}
                    type="button"
                    className={`flavor-option image-option ${active ? "active" : ""} ${locked ? "locked" : ""}`}
                    disabled={blocked || locked}
                    onClick={() => toggleFlavor(flavor.id)}
                  >
                    {flavor.image ? (
                      <img src={mediaUrl(flavor.image)} alt="" />
                    ) : (
                      <span className="flavor-placeholder">
                        <Layers3 />
                      </span>
                    )}
                    <span>
                      <b>{flavor.name}</b>
                      <small>
                        {locked ? "Sabor base • " : ""}
                        {money(flavorPrice(flavor))}
                      </small>
                      {proportionalFlavorPricing && active && (
                        <em className="flavor-price-calculation">
                          {money(flavorPrice(flavor))} ÷ {sumDivisor} ={" "}
                          <b>{money(flavorContribution(flavor))}</b>
                        </em>
                      )}
                    </span>
                    <i>{active ? <Check size={16} /> : <Plus size={16} />}</i>
                  </button>
                );
              })}
            </div>
            {proportionalFlavorPricing && chosen.length > 0 && (
              <div className="proportional-flavor-summary">
                <div>
                  <b>Cálculo proporcional dos sabores</b>
                  <small>
                    Cada sabor contribui com seu valor dividido por {sumDivisor}
                    . O cálculo é atualizado enquanto você escolhe.
                  </small>
                </div>
                <div className="proportional-flavor-lines">
                  {chosen.map((flavor) => (
                    <span key={flavor.id}>
                      <i>{flavor.name}</i>
                      <small>
                        {money(flavorPrice(flavor))} ÷ {sumDivisor}
                      </small>
                      <b>{money(flavorContribution(flavor))}</b>
                    </span>
                  ))}
                </div>
                <strong>
                  <span>
                    {chosen.length === targetCount
                      ? "Valor da pizza"
                      : "Parcial dos sabores escolhidos"}
                  </span>
                  {money(flavoredPrice)}
                </strong>
              </div>
            )}
          </section>
        )}

        {modifierGroups.map((group) => {
          const ids = selectedOptions[group.id] || [],
            minimum = group.required
              ? Math.max(1, Number(group.minSelect || 0))
              : Number(group.minSelect || 0),
            isCrust = /borda/i.test(String(group.name || ""));
          return (
            <section
              className={`customizer-section ${isCrust ? "crust-group" : ""}`}
              key={group.id}
            >
              <div className="customizer-section-head">
                <div>
                  <b>{group.name}</b>
                  <small>
                    {group.description ||
                      `${group.required ? "Obrigatório" : "Opcional"} • escolha ${group.maxSelect === 1 ? "1 opção" : `até ${group.maxSelect} opções`}`}
                  </small>
                </div>
                <span>
                  {ids.length}/{group.maxSelect}
                  {minimum > 0 && <em> obrigatório</em>}
                </span>
              </div>
              <div className="modifier-option-list">
                {group.options
                  .filter((option) => option.active !== false)
                  .map((option) => {
                    const active = ids.includes(option.id),
                      blocked =
                        !active && ids.length >= Number(group.maxSelect || 1);
                    return (
                      <button
                        type="button"
                        key={option.id}
                        className={`modifier-choice ${active ? "active" : ""}`}
                        disabled={blocked}
                        onClick={() => toggleOption(group, option.id)}
                      >
                        {option.image ? (
                          <img src={mediaUrl(option.image)} alt="" />
                        ) : (
                          <span className="modifier-placeholder">
                            <Plus />
                          </span>
                        )}
                        <span>
                          <b>{option.name}</b>
                          {option.description && (
                            <small>{option.description}</small>
                          )}
                          {Number(option.price) > 0 ? (
                            <strong>
                              {option.compareAtPrice && (
                                <del>+ {money(option.compareAtPrice)}</del>
                              )}{" "}
                              + {money(option.price)}
                            </strong>
                          ) : (
                            <strong>Sem acréscimo</strong>
                          )}
                        </span>
                        <i>{active ? <Check /> : <Plus />}</i>
                      </button>
                    );
                  })}
              </div>
              {!validGroup(group) && (
                <small className="customizer-required-hint">
                  Escolha{" "}
                  {minimum === 1 ? "1 opção" : `pelo menos ${minimum} opções`}{" "}
                  para continuar.
                </small>
              )}
            </section>
          );
        })}

        <section className="item-note-box">
          <div>
            <MessageSquareText />
            <span>
              <b>Adicionar algum detalhe?</b>
              <small>Essa observação será salva somente neste item.</small>
            </span>
          </div>
          <textarea
            maxLength="140"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex.: sem cebola, bem assada, cortar em mais pedaços..."
          />
          <small>{notes.length}/140</small>
        </section>
        <div className="customizer-total">
          <span>Total deste item</span>
          <strong>{money(total)}</strong>
        </div>
        <div className="modal-actions sticky-customizer-actions">
          {blockReason && (
            <p className="customizer-add-block" role="status">
              {blockReason}
            </p>
          )}
          <button className="ghost-dark-btn" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="primary-btn"
            disabled={!canAdd}
            title={blockReason || submitLabel}
            onClick={add}
          >
            <ShoppingBag size={17} /> {submitLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
