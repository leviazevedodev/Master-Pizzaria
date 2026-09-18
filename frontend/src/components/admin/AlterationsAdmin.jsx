import React from "react";
import { ImagePlus, Layers3, Plus, Trash2, Upload } from "lucide-react";
import { api, mediaUrl } from "../../lib/api";
import PriorityArrows from "./PriorityArrows";

export default function AlterationsAdmin({
  modifierGroups,
  modifierGroupForm,
  setModifierGroupForm,
  modifierOptionForms,
  setModifierOptionForms,
  headers,
  notify,
  fail,
  reload,
  onCatalogChanged,
  requestCrop,
  imageUploading,
  reorderGroup,
  reorderOption,
}) {
  async function createGroup(e) {
    e.preventDefault();
    try {
      await api.post(
        "/admin/modifier-groups",
        {
          ...modifierGroupForm,
          minSelect: Number(modifierGroupForm.minSelect || 0),
          maxSelect: Number(modifierGroupForm.maxSelect || 1),
          sortOrder: Number(
            modifierGroupForm.sortOrder || modifierGroups.length + 1,
          ),
        },
        headers,
      );
      setModifierGroupForm({
        name: "",
        description: "",
        required: false,
        minSelect: 0,
        maxSelect: 1,
        sortOrder: modifierGroups.length + 1,
      });
      notify("Grupo de adicionais criado.");
      await reload();
      await onCatalogChanged?.();
    } catch (err) {
      fail(err, "Não foi possível criar o grupo.");
    }
  }
  async function updateGroup(group, patch) {
    try {
      await api.patch(`/admin/modifier-groups/${group.id}`, patch, headers);
      await reload();
      await onCatalogChanged?.();
    } catch (err) {
      fail(err, "Não foi possível atualizar o grupo.");
    }
  }
  async function removeGroup(group) {
    if (!window.confirm(`Remover ou pausar o grupo “${group.name}”?`)) return;
    try {
      await api.delete(`/admin/modifier-groups/${group.id}`, headers);
      notify("Grupo atualizado.");
      await reload();
      await onCatalogChanged?.();
    } catch (err) {
      fail(err, "Não foi possível remover o grupo.");
    }
  }
  function optionForm(group) {
    return (
      modifierOptionForms[group.id] || {
        name: "",
        description: "",
        price: "",
        image: "",
        sortOrder: (group.options?.length || 0) + 1,
      }
    );
  }
  function setOptionForm(group, patch) {
    setModifierOptionForms((current) => ({
      ...current,
      [group.id]: { ...optionForm(group), ...patch },
    }));
  }
  async function createOption(e, group) {
    e.preventDefault();
    const form = optionForm(group);
    try {
      await api.post(
        `/admin/modifier-groups/${group.id}/options`,
        {
          ...form,
          price: Number(form.price || 0),
          sortOrder: Number(form.sortOrder || (group.options?.length || 0) + 1),
        },
        headers,
      );
      setModifierOptionForms((current) => ({
        ...current,
        [group.id]: {
          name: "",
          description: "",
          price: "",
          image: "",
          sortOrder: (group.options?.length || 0) + 2,
        },
      }));
      notify("Opção adicionada.");
      await reload();
      await onCatalogChanged?.();
    } catch (err) {
      fail(err, "Não foi possível adicionar a opção.");
    }
  }
  async function updateOption(option, patch) {
    try {
      await api.patch(`/admin/modifier-options/${option.id}`, patch, headers);
      await reload();
      await onCatalogChanged?.();
    } catch (err) {
      fail(err, "Não foi possível atualizar a opção.");
    }
  }
  async function removeOption(option) {
    if (!window.confirm(`Remover ou pausar “${option.name}”?`)) return;
    try {
      await api.delete(`/admin/modifier-options/${option.id}`, headers);
      notify("Opção atualizada.");
      await reload();
      await onCatalogChanged?.();
    } catch (err) {
      fail(err, "Não foi possível remover a opção.");
    }
  }
  function uploadOptionImage(group, file) {
    if (!file) return;
    requestCrop(
      file,
      (url) => setOptionForm(group, { image: url }),
      `Imagem do adicional`,
      4 / 3,
    );
  }
  function replaceOptionImage(option, file) {
    if (!file) return;
    requestCrop(
      file,
      (url) => updateOption(option, { image: url }),
      `Imagem de ${option.name}`,
      4 / 3,
    );
  }
  return (
    <div className="admin-two-column alterations-layout">
      <section className="admin-panel">
        <div className="panel-title">
          <div>
            <span>Personalização</span>
            <h2>Adicionais</h2>
            <p>
              Crie grupos de adicionais e suas opções. “Borda da pizza” é apenas
              um grupo de adicional padrão, não uma categoria do cardápio.
            </p>
          </div>
          <b>{modifierGroups.length}</b>
        </div>
        <div className="modifier-admin-list compact-modifier-admin">
          {modifierGroups.map((group) => (
            <article key={group.id} className={!group.active ? "paused" : ""}>
              <div className="modifier-group-head">
                <div>
                  <b>{group.name}</b>
                  <small>
                    {group.description || "Sem descrição"} •{" "}
                    {group.required ? "Obrigatório" : "Opcional"}
                  </small>
                </div>
                <PriorityArrows
                  value={group.sortOrder}
                  onUp={() => reorderGroup(group, -1)}
                  onDown={() => reorderGroup(group, 1)}
                />
                <button
                  className={
                    group.active ? "area-toggle active" : "area-toggle"
                  }
                  onClick={() => updateGroup(group, { active: !group.active })}
                >
                  {group.active ? "Ativo" : "Pausado"}
                </button>
                <button
                  className="subtle-danger"
                  onClick={() => removeGroup(group)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <div className="modifier-option-admin-list">
                {(group.options || []).map((option) => (
                  <div
                    key={option.id}
                    className={`modifier-option-admin-row ${!option.active ? "paused" : ""}`}
                  >
                    <label
                      className="modifier-option-photo"
                      title="Clique para trocar a imagem"
                    >
                      {option.image ? (
                        <img src={mediaUrl(option.image)} alt={option.name} />
                      ) : (
                        <span className="modifier-placeholder">
                          <ImagePlus size={18} />
                        </span>
                      )}
                      <i>
                        <Upload size={12} />
                      </i>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={imageUploading}
                        onChange={(e) =>
                          replaceOptionImage(option, e.target.files?.[0])
                        }
                      />
                    </label>
                    <span className="modifier-option-copy">
                      <b>{option.name}</b>
                      <small>{option.description || "Sem descrição"}</small>
                    </span>
                    <label className="modifier-option-price-edit">
                      <span>Preço</span>
                      <div className="money-input">
                        <small>R$</small>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          defaultValue={option.price}
                          onBlur={(e) =>
                            Number(e.target.value) !== Number(option.price) &&
                            updateOption(option, {
                              price: Number(e.target.value),
                            })
                          }
                        />
                      </div>
                    </label>
                    <PriorityArrows
                      value={option.sortOrder}
                      onUp={() => reorderOption(group, option, -1)}
                      onDown={() => reorderOption(group, option, 1)}
                    />
                    <button
                      className={
                        option.active ? "area-toggle active" : "area-toggle"
                      }
                      onClick={() =>
                        updateOption(option, { active: !option.active })
                      }
                    >
                      {option.active ? "Ativo" : "Pausado"}
                    </button>
                    <button
                      className="subtle-danger"
                      onClick={() => removeOption(option)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <form
                className="inline-option-form modifier-option-create-compact"
                onSubmit={(e) => createOption(e, group)}
              >
                <label
                  className="inline-option-image-upload"
                  title="Imagem do adicional"
                >
                  {optionForm(group).image ? (
                    <img src={mediaUrl(optionForm(group).image)} alt="Prévia" />
                  ) : (
                    <ImagePlus size={20} />
                  )}
                  <span>
                    <Upload size={12} /> Foto
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={imageUploading}
                    onChange={(e) =>
                      uploadOptionImage(group, e.target.files?.[0])
                    }
                  />
                </label>
                <input
                  required
                  placeholder="Nome da opção"
                  value={optionForm(group).name}
                  onChange={(e) =>
                    setOptionForm(group, { name: e.target.value })
                  }
                />
                <input
                  placeholder="Descrição opcional"
                  value={optionForm(group).description}
                  onChange={(e) =>
                    setOptionForm(group, { description: e.target.value })
                  }
                />
                <input
                  required
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Acréscimo R$"
                  value={optionForm(group).price}
                  onChange={(e) =>
                    setOptionForm(group, { price: e.target.value })
                  }
                />
                <button className="ghost-dark-btn">
                  <Plus size={15} /> Adicionar opção
                </button>
              </form>
            </article>
          ))}
        </div>
      </section>
      <form className="admin-panel compact-form" onSubmit={createGroup}>
        <div className="panel-title">
          <div>
            <span>Novo grupo</span>
            <h2>Criar adicional</h2>
          </div>
          <Layers3 />
        </div>
        <label>
          Nome
          <input
            required
            value={modifierGroupForm.name}
            onChange={(e) =>
              setModifierGroupForm({
                ...modifierGroupForm,
                name: e.target.value,
              })
            }
            placeholder="Ex.: Escolha sua borda"
          />
        </label>
        <label>
          Descrição
          <input
            value={modifierGroupForm.description}
            onChange={(e) =>
              setModifierGroupForm({
                ...modifierGroupForm,
                description: e.target.value,
              })
            }
            placeholder="Ex.: Escolha 1 opção"
          />
        </label>
        <label className="switch-label">
          <input
            type="checkbox"
            checked={modifierGroupForm.required}
            onChange={(e) =>
              setModifierGroupForm({
                ...modifierGroupForm,
                required: e.target.checked,
                minSelect: e.target.checked
                  ? Math.max(1, Number(modifierGroupForm.minSelect || 0))
                  : modifierGroupForm.minSelect,
              })
            }
          />{" "}
          Obrigatório
        </label>
        <div className="two-cols">
          <label>
            Mínimo
            <input
              type="number"
              min="0"
              value={modifierGroupForm.minSelect}
              onChange={(e) =>
                setModifierGroupForm({
                  ...modifierGroupForm,
                  minSelect: e.target.value,
                })
              }
            />
          </label>
          <label>
            Máximo
            <input
              type="number"
              min="1"
              max="10"
              value={modifierGroupForm.maxSelect}
              onChange={(e) =>
                setModifierGroupForm({
                  ...modifierGroupForm,
                  maxSelect: e.target.value,
                })
              }
            />
          </label>
        </div>
        <button className="primary-btn full">
          <Plus size={16} /> Criar grupo
        </button>
      </form>
    </div>
  );
}

