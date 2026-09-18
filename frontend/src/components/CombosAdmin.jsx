import React, { useMemo, useState } from "react";
import { ImagePlus, PackagePlus, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { api, authHeaders, mediaUrl } from "../lib/api";
import { money } from "../lib/format";
import ComboContents from "./ComboContents";
import ComboSlotEditor, { createEmptyComboSlot, normalizeComboSlot } from "./ComboSlotEditor";
import "../styles/combo-payment.css";

const SLOT_TYPE_LABELS = {
  FIXED_PRODUCT: "Produto fixo",
  PRODUCT_CHOICE: "Escolha de produtos",
  CONFIGURABLE_PIZZA: "Pizza configurável",
};

function emptyForm() {
  return { name: "", description: "", price: "", image: "", available: true, slots: [], convertedFromLegacy: false };
}

function legacySlot(entry) {
  return normalizeComboSlot({
    type: "FIXED_PRODUCT",
    name: entry.product?.name || "",
    quantity: Number(entry.quantity || 1),
    products: [{ productId: entry.productId, sizeId: entry.sizeId || "", priceAdjustment: 0 }],
  });
}

function formFromCombo(combo) {
  const hasSlots = (combo.comboSlots || []).length > 0;
  return {
    name: combo.name || "",
    description: combo.description || "",
    price: combo.price ?? "",
    image: combo.image || "",
    available: combo.available !== false,
    slots: hasSlots ? combo.comboSlots.map(normalizeComboSlot) : (combo.comboItems || []).map(legacySlot),
    convertedFromLegacy: !hasSlots && (combo.comboItems || []).length > 0,
  };
}

function slotPayload(slot) {
  const common = {
    type: slot.type,
    name: slot.name,
    quantity: Number(slot.quantity || 1),
    baseProductId: null,
    sizeId: null,
    flavorScope: "ALL",
    maxFlavors: null,
    allowModifiers: false,
    modifierPricingMode: "NORMAL",
    products: [],
    flavorGroupRules: [],
    flavorRules: [],
    modifierRules: [],
  };
  if (slot.type === "CONFIGURABLE_PIZZA") {
    return {
      ...common,
      baseProductId: slot.baseProductId || null,
      sizeId: slot.sizeId || null,
      flavorScope: slot.flavorScope || "ALL",
      maxFlavors: slot.maxFlavors === "" ? null : Number(slot.maxFlavors),
      allowModifiers: Boolean(slot.allowModifiers),
      modifierPricingMode: slot.modifierPricingMode || "NORMAL",
      flavorGroupRules: (slot.flavorGroupRules || []).map((rule) => ({ flavorGroupId: rule.flavorGroupId, pricingRule: rule.pricingRule, amount: Number(rule.amount || 0) })),
      flavorRules: (slot.flavorRules || []).map((rule) => ({ flavorId: rule.flavorId, pricingRule: rule.pricingRule, amount: Number(rule.amount || 0) })),
      modifierRules: slot.allowModifiers
        ? (slot.modifierRules || []).map((rule) => ({ optionId: rule.optionId, pricingRule: rule.pricingRule, amount: Number(rule.amount || 0) }))
        : [],
    };
  }
  return {
    ...common,
    products: (slot.products || []).filter((choice) => choice.productId).map((choice) => ({
      productId: choice.productId,
      sizeId: choice.sizeId || null,
      priceAdjustment: Number(choice.priceAdjustment || 0),
    })),
  };
}

function validateSlots(slots, productMap) {
  if (slots.length < 2 || slots.length > 20) return "Configure entre 2 e 20 itens no combo.";
  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index];
    const label = `Item ${index + 1}`;
    if (Number(slot.quantity) < 1 || Number(slot.quantity) > 20) return `${label}: informe uma quantidade entre 1 e 20.`;
    if (slot.type === "FIXED_PRODUCT" && slot.products.filter((row) => row.productId).length !== 1) return `${label}: selecione o produto fixo.`;
    if (slot.type === "PRODUCT_CHOICE" && slot.products.filter((row) => row.productId).length < 2) return `${label}: cadastre ao menos duas opções de produto.`;
    if (slot.type !== "CONFIGURABLE_PIZZA") {
      for (const choice of slot.products.filter((row) => row.productId)) {
        const product = productMap.get(choice.productId);
        if (product?.availableSizes?.length > 0 && !choice.sizeId) return `${label}: selecione o tamanho de ${product.name}.`;
      }
    }
    if (slot.type === "CONFIGURABLE_PIZZA") {
      if (!slot.baseProductId || !slot.sizeId) return `${label}: selecione o produto base e o tamanho da pizza.`;
      const positiveRule = (rule) => rule.pricingRule !== "BLOCKED";
      if (slot.flavorScope === "GROUPS" && !slot.flavorGroupRules.some(positiveRule) && !slot.flavorRules.some(positiveRule)) return `${label}: libere ao menos um grupo ou sabor.`;
      if (slot.flavorScope === "MANUAL" && !slot.flavorRules.some(positiveRule)) return `${label}: libere ao menos um sabor.`;
    }
  }
  return "";
}

function ConfiguredSlotSummary({ slot }) {
  let detail = "Configuração incompleta";
  if (slot.type === "CONFIGURABLE_PIZZA") detail = `${slot.baseProduct?.name || "Pizza"}${slot.size?.name ? ` • ${slot.size.name}` : ""}`;
  else {
    const names = (slot.products || []).map((entry) => entry.product?.name).filter(Boolean);
    if (names.length) detail = names.join(" ou ");
  }
  return <li><b>{slot.quantity || 1}× {slot.name || SLOT_TYPE_LABELS[slot.type] || "Item"}</b><span>{detail}</span></li>;
}

export default function CombosAdmin({
  session,
  combos,
  products,
  flavors = [],
  flavorGroups = [],
  sizes = [],
  onChanged,
  notify,
  fail,
  requestCrop,
  imageUploading,
}) {
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const headers = authHeaders(session.token);
  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  function reset() {
    setEditingId(null);
    setForm(emptyForm());
  }

  function updateSlot(index, slot) {
    setForm((current) => ({ ...current, slots: current.slots.map((row, rowIndex) => rowIndex === index ? slot : row) }));
  }

  function removeSlot(index) {
    setForm((current) => ({ ...current, slots: current.slots.filter((_, rowIndex) => rowIndex !== index) }));
  }

  function moveSlot(index, direction) {
    setForm((current) => {
      const destination = index + direction;
      if (destination < 0 || destination >= current.slots.length) return current;
      const slots = [...current.slots];
      [slots[index], slots[destination]] = [slots[destination], slots[index]];
      return { ...current, slots };
    });
  }

  function showValidation(message) {
    fail({ response: { data: { message } } }, "Revise a configuração do combo.");
  }

  async function submit(event) {
    event.preventDefault();
    const validation = validateSlots(form.slots, productMap);
    if (validation) return showValidation(validation);
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        description: form.description,
        price: Number(form.price),
        image: form.image,
        available: form.available,
        slots: form.slots.map(slotPayload),
      };
      if (editingId) await api.patch(`/admin/combos/${editingId}`, payload, headers);
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
      await api.patch(`/admin/combos/${combo.id}`, { available: !combo.available }, headers);
      await onChanged?.();
    } catch (error) {
      fail(error, "Não foi possível alterar a disponibilidade do combo.");
    }
  }

  return (
    <section className="admin-panel combos-admin">
      <div className="panel-title">
        <div><span>Cardápio</span><h2>Combos</h2><p>Monte ofertas com produtos fixos, escolhas e pizzas configuráveis.</p></div>
        {editingId && <button type="button" className="outline-btn" onClick={reset}><X size={16} /> Cancelar edição</button>}
      </div>

      <form className="combo-editor" onSubmit={submit}>
        <div className="combo-editor-fields">
          <label>Nome do combo<input required minLength="2" maxLength="100" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Ex.: Combo Família" /></label>
          <label>Preço do combo (R$)<input required type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))} placeholder="79,90" /></label>
          <label className="span-2">Descrição para o cliente<textarea required maxLength="350" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Descreva o que torna este combo especial." /></label>
          <label className="combo-photo-field span-2">
            Foto do combo
            <span>
              {form.image ? <img src={mediaUrl(form.image)} alt="Prévia do combo" /> : <i><ImagePlus size={24} /></i>}
              <input type="file" accept="image/jpeg,image/png,image/webp" disabled={imageUploading} onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) requestCrop(file, (image) => setForm((current) => ({ ...current, image })), "Foto do combo", 4 / 3);
                event.target.value = "";
              }} />
              <b>{imageUploading ? "Preparando imagem..." : "Escolher foto"}</b>
            </span>
          </label>
        </div>

        <div className="combo-slots-editor">
          <div className="combo-slots-heading">
            <div><b>Itens do combo</b><small>Adicione entre 2 e 20 itens. A ordem abaixo será usada na montagem pelo cliente.</small></div>
            <div className="combo-add-slot-actions">
              <button type="button" className="outline-btn" onClick={() => setForm((current) => ({ ...current, slots: [...current.slots, createEmptyComboSlot("FIXED_PRODUCT")] }))} disabled={form.slots.length >= 20}><Plus size={15} /> Produto fixo</button>
              <button type="button" className="outline-btn" onClick={() => setForm((current) => ({ ...current, slots: [...current.slots, createEmptyComboSlot("PRODUCT_CHOICE")] }))} disabled={form.slots.length >= 20}><Plus size={15} /> Escolha</button>
              <button type="button" className="outline-btn" onClick={() => setForm((current) => ({ ...current, slots: [...current.slots, createEmptyComboSlot("CONFIGURABLE_PIZZA")] }))} disabled={form.slots.length >= 20}><Plus size={15} /> Pizza configurável</button>
            </div>
          </div>
          {form.convertedFromLegacy && <div className="combo-legacy-notice">Este combo usa o formato anterior. Os itens foram preservados como produtos fixos e só serão migrados ao salvar.</div>}
          <div className="combo-slot-list">
            {form.slots.map((slot, index) => (
              <ComboSlotEditor
                key={slot.clientKey}
                slot={slot}
                index={index}
                products={products}
                flavors={flavors}
                flavorGroups={flavorGroups}
                sizes={sizes}
                onChange={(nextSlot) => updateSlot(index, nextSlot)}
                onRemove={() => removeSlot(index)}
                onMove={(direction) => moveSlot(index, direction)}
                canMoveUp={index > 0}
                canMoveDown={index < form.slots.length - 1}
              />
            ))}
            {!form.slots.length && <div className="combo-empty-items"><PackagePlus size={24} /> Escolha acima os tipos de item que formarão o combo.</div>}
          </div>
        </div>

        <label className="compact-check combo-active-check"><input type="checkbox" checked={form.available} onChange={(event) => setForm((current) => ({ ...current, available: event.target.checked }))} />Publicar no cardápio</label>
        <button className="primary-btn" disabled={saving || imageUploading}>{editingId ? <Save size={16} /> : <Plus size={16} />}{saving ? "Salvando..." : editingId ? "Salvar combo" : "Criar combo"}</button>
      </form>

      <div className="combo-admin-list">
        {combos.map((combo) => {
          const slots = combo.comboSlots || [];
          const itemCount = slots.length || combo.comboItems?.length || 0;
          return (
            <article key={combo.id} className={!combo.available ? "paused" : ""}>
              <img src={mediaUrl(combo.image)} alt="" />
              <div>
                <small>COMBO • {itemCount} ITENS • {slots.length ? "CONFIGURÁVEL" : "LEGADO"}</small>
                <h3>{combo.name}</h3>
                {slots.length ? <ul className="combo-slot-summary">{slots.map((slot) => <ConfiguredSlotSummary key={slot.id} slot={slot} />)}</ul> : <ComboContents items={combo.comboItems} />}
              </div>
              <strong>{money(combo.price)}</strong>
              <button type="button" className={combo.available ? "availability-button on" : "availability-button off"} onClick={() => toggle(combo)}>{combo.available ? "Ativo" : "Pausado"}</button>
              <button type="button" className="icon-action" onClick={() => { setEditingId(combo.id); setForm(formFromCombo(combo)); window.scrollTo({ top: 0, behavior: "smooth" }); }}><Pencil size={16} /> Editar</button>
              <button type="button" className="subtle-danger" onClick={() => archive(combo)}><Trash2 size={16} /> Arquivar</button>
            </article>
          );
        })}
        {!combos.length && <div className="empty-admin"><PackagePlus /><p>Nenhum combo criado ainda.</p></div>}
      </div>
    </section>
  );
}
