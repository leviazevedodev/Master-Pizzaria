import React, { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Layers3,
  LoaderCircle,
  MessageSquareText,
  PackageCheck,
  Plus,
  X,
} from "lucide-react";
import { api, mediaUrl } from "../lib/api";
import { money } from "../lib/format";
import "../styles/configurable-combo.css";
import {
  availableComboFlavors,
  availableComboModifierOptions,
  comboCartKey,
  comboFlavorRule,
  comboSelectionBlockReason,
  comboSlotMaxFlavors,
  initialComboSelections,
  localComboAdjustment,
  serializeComboSelections,
} from "../lib/comboConfigurator";

const ruleAdjustment = (rule, normalPrice = 0) => {
  if (rule?.pricingRule === "SURCHARGE") return Number(rule.amount || 0);
  if (rule?.pricingRule === "DISCOUNT") return -Number(rule.amount || 0);
  if (rule?.pricingRule === "NORMAL") return Number(normalPrice || 0);
  return 0;
};

const adjustmentLabel = (value) => {
  const amount = Number(value || 0);
  if (!amount) return "Incluído";
  return `${amount > 0 ? "+" : "−"} ${money(Math.abs(amount))}`;
};

export default function ConfigurableComboFlow({
  baseProduct,
  onClose,
  onAdd,
  submitLabel = "Adicionar à sacola",
}) {
  const decisionSlots = useMemo(
    () =>
      (baseProduct.comboSlots || []).filter(
        (slot) => slot.type !== "FIXED_PRODUCT",
      ),
    [baseProduct],
  );
  const [selections, setSelections] = useState(() =>
    initialComboSelections(baseProduct),
  );
  const [step, setStep] = useState(0);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const slot = decisionSlots[step];
  const selection = slot ? selections[slot.id] || {} : {};
  const blockReason = slot ? comboSelectionBlockReason(slot, selection) : "";
  const isLast = step >= decisionSlots.length - 1;
  const previewTotal =
    Number(baseProduct.price || 0) +
    localComboAdjustment(baseProduct, selections);

  const updateSelection = (slotId, patch) =>
    setSelections((current) => ({
      ...current,
      [slotId]: { ...(current[slotId] || { slotId }), ...patch },
    }));

  function selectChoice(choice) {
    updateSelection(slot.id, {
      choiceId: choice.id,
      productId: choice.productId,
      sizeId: choice.sizeId || null,
    });
    setError("");
  }

  function setFlavorCount(count) {
    const allowed = new Set(
      availableComboFlavors(slot)
        .filter(
          (flavor) => count === 1 || flavor.allowHalfAndHalf !== false,
        )
        .map((flavor) => flavor.id),
    );
    updateSelection(slot.id, {
      targetCount: count,
      flavorIds: (selection.flavorIds || [])
        .filter((id) => allowed.has(id))
        .slice(0, count),
    });
    setError("");
  }

  function toggleFlavor(flavorId) {
    const current = selection.flavorIds || [];
    const selected = current.includes(flavorId);
    const target = Math.max(1, Number(selection.targetCount || 1));
    if (!selected && current.length >= target) return;
    updateSelection(slot.id, {
      flavorIds: selected
        ? current.filter((id) => id !== flavorId)
        : [...current, flavorId],
    });
    setError("");
  }

  function toggleOption(group, optionId) {
    const current = selection.optionIds || [];
    const selected = current.includes(optionId);
    const groupIds = (group.options || []).map((option) => option.id);
    const selectedInGroup = current.filter((id) => groupIds.includes(id));
    if (!selected && selectedInGroup.length >= Number(group.maxSelect || 1))
      return;
    updateSelection(slot.id, {
      optionIds: selected
        ? current.filter((id) => id !== optionId)
        : [...current, optionId],
    });
    setError("");
  }

  async function finish() {
    const firstInvalid = decisionSlots.findIndex((entry) =>
      comboSelectionBlockReason(entry, selections[entry.id] || {}),
    );
    if (firstInvalid >= 0) {
      setStep(firstInvalid);
      setError(
        comboSelectionBlockReason(
          decisionSlots[firstInvalid],
          selections[decisionSlots[firstInvalid].id] || {},
        ),
      );
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const intended = serializeComboSelections(baseProduct, selections);
      const { data } = await api.post(`/combos/${baseProduct.id}/quote`, {
        quantity: 1,
        comboSelections: intended,
      });
      if (
        !Number.isFinite(Number(data?.unitPrice)) ||
        !Array.isArray(data?.comboSelections) ||
        !Array.isArray(data?.comboItems)
      )
        throw new Error("Resposta inválida ao validar o combo.");
      onAdd({
        cartKey: comboCartKey(baseProduct.id, data.comboSelections, notes),
        productId: baseProduct.id,
        name: baseProduct.name,
        price: Number(data.unitPrice),
        image: baseProduct.image,
        quantity: 1,
        notes: notes.trim(),
        sizeId: null,
        sizeName: null,
        flavorIds: [],
        flavors: [],
        optionIds: [],
        options: [],
        isCombo: true,
        comboSelections: data.comboSelections,
        comboItems: data.comboItems,
      });
      onClose();
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ||
          "Não foi possível adicionar o combo ao carrinho. Revise as escolhas.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function next() {
    if (blockReason) {
      setError(blockReason);
      return;
    }
    setError("");
    if (isLast) void finish();
    else setStep((current) => current + 1);
  }

  const fixedSlots = (baseProduct.comboSlots || []).filter(
    (entry) => entry.type === "FIXED_PRODUCT",
  );

  return (
    <div
      className="modal-backdrop product-customizer-backdrop"
      onMouseDown={(event) =>
        event.target === event.currentTarget && !submitting && onClose()
      }
    >
      <section
        className="pizza-builder-modal product-customizer-modal combo-builder-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Montar ${baseProduct.name}`}
      >
        <div className="modal-head">
          <div>
            <span className="eyebrow dark">Monte seu combo</span>
            <h2>{baseProduct.name}</h2>
            <p>{baseProduct.description}</p>
          </div>
          <button
            className="icon-close"
            onClick={onClose}
            aria-label="Fechar"
            disabled={submitting}
          >
            <X />
          </button>
        </div>

        <div className="customizer-product-summary combo-builder-summary">
          <img src={mediaUrl(baseProduct.image)} alt={baseProduct.name} />
          <div>
            <small>Valor atual do combo</small>
            <strong>{money(previewTotal)}</strong>
            <span>
              {decisionSlots.length
                ? `Etapa ${step + 1} de ${decisionSlots.length}`
                : "Composição fixa"}
            </span>
          </div>
        </div>

        {fixedSlots.length > 0 && (
          <section className="customizer-section combo-fixed-summary">
            <div className="customizer-section-head">
              <div>
                <b>Já incluído</b>
                <small>Estes itens fazem parte do valor do combo.</small>
              </div>
              <PackageCheck size={20} />
            </div>
            <div className="combo-fixed-chips">
              {fixedSlots.map((entry) => (
                <span key={entry.id}>
                  {entry.quantity}x {entry.products?.[0]?.product?.name || entry.name}
                  {entry.products?.[0]?.sizeName
                    ? ` • ${entry.products[0].sizeName}`
                    : ""}
                </span>
              ))}
            </div>
          </section>
        )}

        {slot?.type === "PRODUCT_CHOICE" && (
          <section className="customizer-section combo-step-section">
            <div className="customizer-section-head">
              <div>
                <b>{slot.name}</b>
                <small>Escolha uma das opções disponíveis.</small>
              </div>
              <span>1 opção</span>
            </div>
            <div className="combo-choice-grid">
              {(slot.products || []).map((choice) => {
                const active = selection.choiceId === choice.id;
                return (
                  <button
                    type="button"
                    key={choice.id}
                    className={`flavor-option image-option ${active ? "active" : ""}`}
                    onClick={() => selectChoice(choice)}
                    aria-pressed={active}
                    disabled={
                      choice.product?.available === false ||
                      choice.product?.stockAvailable === false
                    }
                  >
                    {choice.product?.image ? (
                      <img src={mediaUrl(choice.product.image)} alt="" />
                    ) : (
                      <span className="flavor-placeholder">
                        <PackageCheck />
                      </span>
                    )}
                    <span>
                      <b>{choice.product?.name}</b>
                      <small>
                        {choice.sizeName || "Tamanho padrão"} •{" "}
                        {adjustmentLabel(choice.priceAdjustment)}
                      </small>
                    </span>
                    <i>{active ? <Check size={16} /> : <Plus size={16} />}</i>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {slot?.type === "CONFIGURABLE_PIZZA" && (
          <>
            <section className="customizer-section combo-step-section">
              <div className="customizer-section-head">
                <div>
                  <b>{slot.name}</b>
                  <small>
                    {slot.size?.name} • escolha somente sabores permitidos neste
                    combo.
                  </small>
                </div>
                <span>
                  {(selection.flavorIds || []).length}/
                  {selection.targetCount || 1}
                </span>
              </div>
              <div className="flavor-count-choice compact-count">
                <div>
                  <Layers3 />
                  <span>
                    <b>Quantidade de sabores</b>
                    <small>O limite respeita o tamanho e este combo.</small>
                  </span>
                </div>
                <div>
                  {Array.from(
                    { length: comboSlotMaxFlavors(slot) },
                    (_, index) => index + 1,
                  ).map((count) => (
                    <button
                      key={count}
                      type="button"
                      className={
                        Number(selection.targetCount || 1) === count
                          ? "active"
                          : ""
                      }
                      onClick={() => setFlavorCount(count)}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flavor-grid flavor-image-grid">
                {availableComboFlavors(slot).map((flavor) => {
                  const active = (selection.flavorIds || []).includes(flavor.id);
                  const blocked =
                    !active &&
                    (selection.flavorIds || []).length >=
                      Number(selection.targetCount || 1);
                  const rule = comboFlavorRule(slot, flavor);
                  return (
                    <button
                      key={flavor.id}
                      type="button"
                      className={`flavor-option image-option ${active ? "active" : ""}`}
                      disabled={blocked}
                      onClick={() => toggleFlavor(flavor.id)}
                      aria-pressed={active}
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
                          {adjustmentLabel(ruleAdjustment(rule))}
                        </small>
                      </span>
                      <i>{active ? <Check size={16} /> : <Plus size={16} />}</i>
                    </button>
                  );
                })}
              </div>
            </section>

            {slot.allowModifiers &&
              (slot.baseProduct?.availableModifierGroups || []).map((group) => (
                <section className="customizer-section" key={group.id}>
                  <div className="customizer-section-head">
                    <div>
                      <b>{group.name}</b>
                      <small>
                        {group.required ? "Escolha obrigatória" : "Opcional"} •
                        até {group.maxSelect}
                      </small>
                    </div>
                  </div>
                  <div className="modifier-option-grid">
                    {availableComboModifierOptions(slot, group).map((option) => {
                      const rule = (slot.modifierRules || []).find(
                        (entry) => entry.optionId === option.id,
                      );
                      const active = (selection.optionIds || []).includes(
                        option.id,
                      );
                      const fallback =
                        slot.modifierPricingMode === "INCLUDED"
                          ? { pricingRule: "INCLUDED" }
                          : { pricingRule: "NORMAL" };
                      const adjustment = ruleAdjustment(
                        rule || fallback,
                        option.price,
                      );
                      return (
                        <button
                          key={option.id}
                          type="button"
                          className={`modifier-option-card ${active ? "active" : ""}`}
                          onClick={() => toggleOption(group, option.id)}
                          aria-pressed={active}
                        >
                          <span>
                            <b>{option.name}</b>
                            <small>{adjustmentLabel(adjustment)}</small>
                          </span>
                          <i>{active ? <Check size={16} /> : <Plus size={16} />}</i>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
          </>
        )}

        {isLast && (
          <section className="customizer-section">
            <div className="customizer-section-head">
              <div>
                <b>Algum detalhe?</b>
                <small>A observação será aplicada ao combo inteiro.</small>
              </div>
              <MessageSquareText size={20} />
            </div>
            <textarea
              className="customizer-notes"
              maxLength={140}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Ex.: sem cebola, refrigerante gelado..."
            />
          </section>
        )}

        {error && (
          <div className="customizer-validation-message" role="alert">
            {error}
          </div>
        )}

        <div className="modal-actions combo-step-actions">
          <button
            type="button"
            className="outline-btn"
            onClick={() => (step > 0 ? setStep(step - 1) : onClose())}
            disabled={submitting}
          >
            {step > 0 ? <ArrowLeft size={17} /> : null}
            {step > 0 ? "Voltar" : "Cancelar"}
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={next}
            disabled={submitting}
          >
            {submitting ? (
              <LoaderCircle className="spin" size={18} />
            ) : isLast ? (
              <PackageCheck size={18} />
            ) : (
              <ArrowRight size={18} />
            )}
            {submitting
              ? "Validando..."
              : isLast
                ? `${submitLabel} • ${money(previewTotal)}`
                : "Continuar"}
          </button>
        </div>
      </section>
    </div>
  );
}
