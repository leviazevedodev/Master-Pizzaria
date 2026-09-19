import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Pizza, Plus, Trash2 } from "lucide-react";
import { money } from "../lib/format";

let slotSequence = 0;

const SLOT_TYPES = [
  { value: "FIXED_PRODUCT", label: "Produto fixo" },
  { value: "PRODUCT_CHOICE", label: "Escolha de produtos" },
  { value: "CONFIGURABLE_PIZZA", label: "Pizza configurável" },
];

const FLAVOR_RULES = [
  { value: "INCLUDED", label: "Incluído" },
  { value: "SURCHARGE", label: "Acréscimo" },
  { value: "DISCOUNT", label: "Desconto" },
  { value: "BLOCKED", label: "Bloqueado" },
];

const MODIFIER_RULES = [
  { value: "NORMAL", label: "Preço normal" },
  ...FLAVOR_RULES,
];

const clientKey = () => `combo-slot-${Date.now()}-${slotSequence++}`;

function emptyChoice() {
  return { productId: "", sizeId: "", priceAdjustment: 0 };
}

export function createEmptyComboSlot(type = "FIXED_PRODUCT") {
  return {
    clientKey: clientKey(),
    type,
    name: "",
    quantity: 1,
    baseProductId: "",
    sizeId: "",
    flavorScope: "ALL",
    maxFlavors: "",
    allowModifiers: false,
    modifierPricingMode: "NORMAL",
    products:
      type === "PRODUCT_CHOICE"
        ? [emptyChoice(), emptyChoice()]
        : type === "FIXED_PRODUCT"
          ? [emptyChoice()]
          : [],
    flavorGroupRules: [],
    flavorRules: [],
    modifierRules: [],
  };
}

export function normalizeComboSlot(slot) {
  return {
    ...createEmptyComboSlot(slot?.type || "FIXED_PRODUCT"),
    ...slot,
    clientKey: clientKey(),
    quantity: Number(slot?.quantity || 1),
    baseProductId: slot?.baseProductId || "",
    sizeId: slot?.sizeId || "",
    maxFlavors: slot?.maxFlavors ?? "",
    products: (slot?.products || []).map((choice) => ({
      productId: choice.productId || "",
      sizeId: choice.sizeId || "",
      priceAdjustment: Number(choice.priceAdjustment || 0),
    })),
    flavorGroupRules: (slot?.flavorGroupRules || []).map((rule) => ({
      flavorGroupId: rule.flavorGroupId,
      pricingRule: rule.pricingRule,
      amount: Number(rule.amount || 0),
    })),
    flavorRules: (slot?.flavorRules || []).map((rule) => ({
      flavorId: rule.flavorId,
      pricingRule: rule.pricingRule,
      amount: Number(rule.amount || 0),
    })),
    modifierRules: (slot?.modifierRules || []).map((rule) => ({
      optionId: rule.optionId,
      pricingRule: rule.pricingRule,
      amount: Number(rule.amount || 0),
    })),
  };
}

function defaultSize(product) {
  return (
    product?.availableSizes?.find((size) => size.slug === "media") ||
    product?.availableSizes?.[0] ||
    null
  );
}

function supportsSize(flavor, sizeId) {
  if (!sizeId) return true;
  const rows = flavor?.availableSizes || flavor?.sizes || [];
  return rows.some(
    (row) => (row.sizeId || row.id) === sizeId && row.available !== false,
  );
}

function PricingRuleField({
  value,
  amount,
  rules,
  inheritLabel,
  onRuleChange,
  onAmountChange,
}) {
  const hasAmount = value === "SURCHARGE" || value === "DISCOUNT";
  return (
    <div className="combo-rule-inputs">
      <select value={value || "INHERIT"} onChange={(event) => onRuleChange(event.target.value)}>
        <option value="INHERIT">{inheritLabel}</option>
        {rules.map((rule) => (
          <option key={rule.value} value={rule.value}>{rule.label}</option>
        ))}
      </select>
      {hasAmount && (
        <label>
          Valor (R$)
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount ?? 0}
            onChange={(event) => onAmountChange(event.target.value)}
          />
        </label>
      )}
    </div>
  );
}

export default function ComboSlotEditor({
  slot,
  index,
  products,
  flavors,
  flavorGroups,
  sizes,
  onChange,
  onRemove,
  onMove,
  canMoveUp,
  canMoveDown,
}) {
  const [flavorSearch, setFlavorSearch] = useState("");
  const [expanded, setExpanded] = useState(index === 0);
  const catalogProducts = useMemo(
    () => products.filter((product) => !product.deletedAt && !product.isCombo),
    [products],
  );
  const productMap = useMemo(
    () => new Map(catalogProducts.map((product) => [product.id, product])),
    [catalogProducts],
  );
  const baseProducts = useMemo(
    () => catalogProducts.filter((product) => product.allowFlavorSplit),
    [catalogProducts],
  );
  const baseProduct = productMap.get(slot.baseProductId);
  const linkedFlavorIds = useMemo(
    () => new Set(baseProduct?.flavorIds || baseProduct?.availableFlavors?.map((row) => row.id) || []),
    [baseProduct],
  );
  const eligibleFlavors = useMemo(() => {
    const rows = baseProduct?.availableFlavors?.length
      ? baseProduct.availableFlavors
      : flavors.filter((flavor) => linkedFlavorIds.has(flavor.id));
    return rows.filter(
      (flavor) => flavor.active !== false && supportsSize(flavor, slot.sizeId),
    );
  }, [baseProduct, flavors, linkedFlavorIds, slot.sizeId]);
  const visibleFlavors = useMemo(() => {
    const query = flavorSearch.trim().toLocaleLowerCase("pt-BR");
    return query
      ? eligibleFlavors.filter((flavor) =>
          `${flavor.name} ${flavor.group?.name || ""}`
            .toLocaleLowerCase("pt-BR")
            .includes(query),
        )
      : eligibleFlavors;
  }, [eligibleFlavors, flavorSearch]);
  const eligibleGroups = useMemo(() => {
    const ids = new Set(eligibleFlavors.map((flavor) => flavor.group?.id || flavor.groupId).filter(Boolean));
    const catalog = flavorGroups.filter((group) => ids.has(group.id));
    for (const flavor of eligibleFlavors) {
      const groupId = flavor.group?.id || flavor.groupId;
      if (groupId && !catalog.some((group) => group.id === groupId))
        catalog.push({ id: groupId, name: flavor.group?.name || "Grupo sem nome" });
    }
    return catalog;
  }, [eligibleFlavors, flavorGroups]);
  const modifierOptions = useMemo(
    () =>
      (baseProduct?.availableModifierGroups || []).flatMap((group) =>
        (group.options || [])
          .filter((option) => option.active !== false)
          .map((option) => ({ ...option, groupName: group.name })),
      ),
    [baseProduct],
  );

  function patch(values) {
    onChange({ ...slot, ...values });
  }

  function changeType(type) {
    const next = createEmptyComboSlot(type);
    onChange({
      ...next,
      clientKey: slot.clientKey,
      name: slot.name,
      quantity: slot.quantity,
    });
  }

  function updateChoice(choiceIndex, values) {
    patch({
      products: slot.products.map((choice, rowIndex) =>
        rowIndex === choiceIndex ? { ...choice, ...values } : choice,
      ),
    });
  }

  function selectProduct(choiceIndex, productId) {
    const product = productMap.get(productId);
    updateChoice(choiceIndex, {
      productId,
      sizeId: defaultSize(product)?.id || "",
    });
  }

  function updateRule(listName, idField, id, pricingRule, amount) {
    const current = slot[listName] || [];
    const without = current.filter((rule) => rule[idField] !== id);
    patch({
      [listName]:
        pricingRule === "INHERIT"
          ? without
          : [...without, { [idField]: id, pricingRule, amount: Number(amount || 0) }],
    });
  }

  function changeRuleAmount(listName, idField, id, amount) {
    patch({
      [listName]: (slot[listName] || []).map((rule) =>
        rule[idField] === id ? { ...rule, amount } : rule,
      ),
    });
  }

  function selectBaseProduct(baseProductId) {
    const product = productMap.get(baseProductId);
    patch({
      baseProductId,
      sizeId: defaultSize(product)?.id || "",
      flavorGroupRules: [],
      flavorRules: [],
      modifierRules: [],
      allowModifiers: false,
    });
  }

  const slotTitle = slot.name.trim() || SLOT_TYPES.find((row) => row.value === slot.type)?.label;

  return (
    <article className={`combo-slot-card ${expanded ? "expanded" : "collapsed"}`}>
      <header>
        <span className="combo-slot-number">{index + 1}</span>
        <div>
          <b>{slotTitle}</b>
          <small>O cliente recebe {slot.quantity || 1} unidade(s) deste item.</small>
        </div>
        <div className="combo-slot-actions">
          <button
            type="button"
            className="icon-action combo-slot-expand"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            aria-label={expanded ? "Recolher item" : "Configurar item"}
          >
            <ChevronDown size={16} />
          </button>
          <button type="button" className="icon-action" disabled={!canMoveUp} onClick={() => onMove(-1)} aria-label="Mover item para cima">
            <ChevronUp size={15} />
          </button>
          <button type="button" className="icon-action" disabled={!canMoveDown} onClick={() => onMove(1)} aria-label="Mover item para baixo">
            <ChevronDown size={15} />
          </button>
          <button type="button" className="subtle-danger" onClick={onRemove} aria-label={`Remover item ${index + 1}`}>
            <Trash2 size={15} />
          </button>
        </div>
      </header>

      {expanded && (
        <div className="combo-slot-body">
      <div className="combo-slot-basics">
        <label>
          Tipo do item
          <select value={slot.type} onChange={(event) => changeType(event.target.value)}>
            {SLOT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
        </label>
        <label>
          Nome exibido (opcional)
          <input maxLength="100" value={slot.name} onChange={(event) => patch({ name: event.target.value })} placeholder="Ex.: Escolha sua pizza" />
        </label>
        <label>
          Quantidade
          <input type="number" min="1" max="20" value={slot.quantity} onChange={(event) => patch({ quantity: event.target.value })} />
        </label>
      </div>

      {(slot.type === "FIXED_PRODUCT" || slot.type === "PRODUCT_CHOICE") && (
        <div className="combo-choice-editor">
          <div className="combo-section-heading">
            <div>
              <b>{slot.type === "FIXED_PRODUCT" ? "Produto incluído" : "Opções para o cliente"}</b>
              <small>{slot.type === "FIXED_PRODUCT" ? "Este produto sempre fará parte do combo." : "O cliente escolhe uma opção desta lista."}</small>
            </div>
            {slot.type === "PRODUCT_CHOICE" && slot.products.length < 20 && (
              <button type="button" className="outline-btn" onClick={() => patch({ products: [...slot.products, emptyChoice()] })}>
                <Plus size={15} /> Adicionar opção
              </button>
            )}
          </div>
          <div className="combo-choice-list">
            {slot.products.map((choice, choiceIndex) => {
              const product = productMap.get(choice.productId);
              const productSizes = product?.availableSizes || [];
              return (
                <div className="combo-choice-row" key={`${slot.clientKey}-choice-${choiceIndex}`}>
                  <label>
                    Produto
                    <select required value={choice.productId} onChange={(event) => selectProduct(choiceIndex, event.target.value)}>
                      <option value="" disabled>Selecione o produto</option>
                      {catalogProducts.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                    </select>
                  </label>
                  <label>
                    Tamanho
                    <select required={productSizes.length > 0} disabled={!productSizes.length} value={choice.sizeId || ""} onChange={(event) => updateChoice(choiceIndex, { sizeId: event.target.value })}>
                      {!productSizes.length && <option value="">Sem tamanho</option>}
                      {productSizes.length > 0 && <option value="" disabled>Selecione</option>}
                      {productSizes.map((size) => <option key={size.id} value={size.id}>{size.name}</option>)}
                    </select>
                  </label>
                  <label>
                    Ajuste no combo (R$)
                    <input type="number" step="0.01" value={choice.priceAdjustment ?? 0} onChange={(event) => updateChoice(choiceIndex, { priceAdjustment: event.target.value })} />
                  </label>
                  {slot.type === "PRODUCT_CHOICE" && (
                    <button type="button" className="subtle-danger" onClick={() => patch({ products: slot.products.filter((_, rowIndex) => rowIndex !== choiceIndex) })} aria-label="Remover opção">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {slot.type === "PRODUCT_CHOICE" && <small className="combo-hint">Cadastre pelo menos duas opções. O ajuste pode ser positivo (acréscimo) ou negativo (desconto).</small>}
        </div>
      )}

      {slot.type === "CONFIGURABLE_PIZZA" && (
        <div className="combo-configurable-editor">
          <div className="combo-configurable-grid">
            <label>
              Produto base da pizza
              <select required value={slot.baseProductId} onChange={(event) => selectBaseProduct(event.target.value)}>
                <option value="" disabled>Selecione a pizza base</option>
                {baseProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
              </select>
            </label>
            <label>
              Tamanho incluído
              <select required disabled={!baseProduct} value={slot.sizeId || ""} onChange={(event) => patch({ sizeId: event.target.value, flavorGroupRules: [], flavorRules: [] })}>
                <option value="" disabled>Selecione o tamanho</option>
                {(baseProduct?.availableSizes || []).map((size) => <option key={size.id} value={size.id}>{size.name}</option>)}
              </select>
            </label>
            <label>
              Limite de sabores
              <select value={slot.maxFlavors ?? ""} onChange={(event) => patch({ maxFlavors: event.target.value })}>
                <option value="">Seguir produto/tamanho</option>
                {[1, 2, 3, 4].map((value) => <option key={value} value={value}>Até {value} sabor{value > 1 ? "es" : ""}</option>)}
              </select>
            </label>
            <label>
              Quais sabores entram
              <select
                value={slot.flavorScope}
                onChange={(event) => patch({
                  flavorScope: event.target.value,
                  flavorGroupRules: event.target.value === "MANUAL" ? [] : slot.flavorGroupRules,
                })}
              >
                <option value="ALL">Todos, com exceções</option>
                <option value="GROUPS">Somente grupos liberados</option>
                <option value="MANUAL">Somente sabores liberados</option>
              </select>
            </label>
          </div>

          {!baseProducts.length && (
            <div className="combo-inline-warning"><Pizza size={18} /> Cadastre antes um produto com montagem por sabores.</div>
          )}

          {baseProduct && slot.sizeId && (
            <>
              {slot.flavorScope !== "MANUAL" && (
                <section className="combo-rules-section">
                  <div className="combo-section-heading">
                    <div>
                      <b>Regras por grupo</b>
                      <small>{slot.flavorScope === "ALL" ? "Todos entram por padrão; use exceções para cobrar ou bloquear." : "Libere os grupos que poderão ser escolhidos."}</small>
                    </div>
                  </div>
                  <div className="combo-rule-list">
                    {eligibleGroups.map((group) => {
                      const rule = slot.flavorGroupRules.find((row) => row.flavorGroupId === group.id);
                      return (
                        <div className="combo-rule-row" key={group.id}>
                          <span><b>{group.name}</b><small>{eligibleFlavors.filter((flavor) => (flavor.group?.id || flavor.groupId) === group.id).length} sabores compatíveis</small></span>
                          <PricingRuleField
                            value={rule?.pricingRule}
                            amount={rule?.amount}
                            rules={FLAVOR_RULES}
                            inheritLabel={slot.flavorScope === "ALL" ? "Padrão: incluído" : "Padrão: não oferecido"}
                            onRuleChange={(value) => updateRule("flavorGroupRules", "flavorGroupId", group.id, value, rule?.amount)}
                            onAmountChange={(value) => changeRuleAmount("flavorGroupRules", "flavorGroupId", group.id, value)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              <section className="combo-rules-section">
                <div className="combo-section-heading">
                  <div>
                    <b>{slot.flavorScope === "MANUAL" ? "Sabores liberados" : "Exceções por sabor"}</b>
                    <small>A regra específica do sabor prevalece sobre a regra do grupo.</small>
                  </div>
                  <input className="combo-rule-search" value={flavorSearch} onChange={(event) => setFlavorSearch(event.target.value)} placeholder="Filtrar sabores" />
                </div>
                <div className="combo-rule-list combo-flavor-rule-list">
                  {visibleFlavors.map((flavor) => {
                    const rule = slot.flavorRules.find((row) => row.flavorId === flavor.id);
                    return (
                      <div className="combo-rule-row" key={flavor.id}>
                        <span><b>{flavor.name}</b><small>{flavor.group?.name || "Sem grupo"} • {money(flavor.price || 0)}</small></span>
                        <PricingRuleField
                          value={rule?.pricingRule}
                          amount={rule?.amount}
                          rules={FLAVOR_RULES}
                          inheritLabel={slot.flavorScope === "ALL" ? "Herdar (incluído)" : "Herdar (não oferecido)"}
                          onRuleChange={(value) => updateRule("flavorRules", "flavorId", flavor.id, value, rule?.amount)}
                          onAmountChange={(value) => changeRuleAmount("flavorRules", "flavorId", flavor.id, value)}
                        />
                      </div>
                    );
                  })}
                  {!visibleFlavors.length && <div className="combo-empty-rules">Nenhum sabor compatível encontrado.</div>}
                </div>
              </section>

              <section className="combo-rules-section">
                <div className="combo-section-heading">
                  <div>
                    <b>Adicionais</b>
                    <small>Controle bordas, extras e outras opções ligadas ao produto base.</small>
                  </div>
                  <label className="compact-check combo-allow-modifiers">
                    <input type="checkbox" checked={slot.allowModifiers} onChange={(event) => patch({ allowModifiers: event.target.checked, modifierRules: event.target.checked ? slot.modifierRules : [] })} />
                    Permitir adicionais
                  </label>
                </div>
                {slot.allowModifiers && (
                  <>
                    <label className="combo-default-modifier-rule">
                      Cobrança padrão
                      <select value={slot.modifierPricingMode} onChange={(event) => patch({ modifierPricingMode: event.target.value })}>
                        <option value="NORMAL">Preço normal do cardápio</option>
                        <option value="INCLUDED">Todos incluídos no combo</option>
                      </select>
                    </label>
                    <div className="combo-rule-list combo-modifier-rule-list">
                      {modifierOptions.map((option) => {
                        const rule = slot.modifierRules.find((row) => row.optionId === option.id);
                        return (
                          <div className="combo-rule-row" key={option.id}>
                            <span><b>{option.name}</b><small>{option.groupName} • {money(option.price || 0)}</small></span>
                            <PricingRuleField
                              value={rule?.pricingRule}
                              amount={rule?.amount}
                              rules={MODIFIER_RULES}
                              inheritLabel={slot.modifierPricingMode === "INCLUDED" ? "Herdar: incluído" : "Herdar: preço normal"}
                              onRuleChange={(value) => updateRule("modifierRules", "optionId", option.id, value, rule?.amount)}
                              onAmountChange={(value) => changeRuleAmount("modifierRules", "optionId", option.id, value)}
                            />
                          </div>
                        );
                      })}
                      {!modifierOptions.length && <div className="combo-empty-rules">O produto base não possui adicionais ativos.</div>}
                    </div>
                  </>
                )}
              </section>
            </>
          )}
        </div>
      )}
        </div>
      )}
    </article>
  );
}
