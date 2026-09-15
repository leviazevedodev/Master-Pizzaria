import React from "react";
import { MapPin, Plus, Route, Save, Trash2 } from "lucide-react";
import MotoIcon from "../MotoIcon";
import { money } from "../../lib/format";
export default function DeliveryAdmin({
  settings,
  setSettings,
  areas,
  form,
  setForm,
  create,
  update,
  remove,
  saveSettings,
}) {
  return (
    <>
      <form
        className="admin-panel delivery-pricing-panel"
        onSubmit={saveSettings}
      >
        <div className="panel-title">
          <div>
            <span>Cálculo de entrega</span>
            <h2>Frete, pedido mínimo e entrega grátis</h2>
            <p>
              O CEP identifica cidade e bairro. Quando não existe uma exceção, o
              sistema calcula a rota automaticamente a partir da loja.
            </p>
          </div>
          <Route />
        </div>
        <div className="delivery-mode-options">
          <button
            type="button"
            className={(settings.deliveryPricingMode || "AREA") === "AREA" ? "active" : ""}
            onClick={() =>
              setSettings({ ...settings, deliveryPricingMode: "AREA" })
            }
          >
            <MotoIcon />
            <span>
              <b>Exceções fixas</b>
              <small>
                Áreas especiais podem ter taxa, pedido mínimo e entrega grátis
                próprios.
              </small>
            </span>
          </button>
          <button
            type="button"
            className={
              settings.deliveryPricingMode === "DISTANCE" ? "active" : ""
            }
            onClick={() =>
              setSettings({ ...settings, deliveryPricingMode: "DISTANCE" })
            }
          >
            <Route />
            <span>
              <b>Distância automática</b>
              <small>
                Calcula a distância sem precisar cadastrar cada bairro.
              </small>
            </span>
          </button>
        </div>
        {settings.deliveryPricingMode === "AREA" && (
          <div className="delivery-hybrid-switch">
            <label
              className={
                settings.deliveryHybridEnabled !== false
                  ? "payment-toggle active"
                  : "payment-toggle"
              }
            >
              <input
                type="checkbox"
                checked={settings.deliveryHybridEnabled !== false}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    deliveryHybridEnabled: e.target.checked,
                  })
                }
              />
              <span>
                <b>Calcular automaticamente fora das exceções</b>
                <small>
                  Se não houver regra fixa para a região, usa distância
                  automática.
                </small>
              </span>
            </label>
          </div>
        )}
        {(settings.deliveryPricingMode === "DISTANCE" ||
          settings.deliveryHybridEnabled !== false) && (
          <>
            <div className="settings-grid delivery-policy-grid">
              <label>
                Km da saída
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={settings.deliveryMinimumKm ?? 10}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      deliveryMinimumKm: Number(e.target.value),
                    })
                  }
                />
                <small>Distância já incluída no valor da saída.</small>
              </label>
              <label>
                Valor da saída (R$)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={settings.deliveryMinimumFee ?? 4}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      deliveryMinimumFee: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                Km excedente (R$/km)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={settings.deliveryPricePerKm ?? 1}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      deliveryPricePerKm: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                Raio máximo padrão (km)
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={settings.deliveryMaxDistanceKm ?? 0}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      deliveryMaxDistanceKm: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                Pedido mínimo padrão (R$)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={settings.defaultMinimumOrder ?? 0}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      defaultMinimumOrder: Number(e.target.value),
                    })
                  }
                />
                <small>Vale para regiões sem regra específica.</small>
              </label>
              <label>
                Entrega grátis a partir de (R$)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={settings.freeDeliveryThreshold ?? 0}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      freeDeliveryThreshold: Number(e.target.value),
                    })
                  }
                />
                <small>0 desativa a gratuidade global.</small>
              </label>
            </div>
            <div className="delivery-formula-preview">
              <Route />
              <span>
                <b>Como fica o cálculo</b>
                <small>
                  Saída de até {Number(settings.deliveryMinimumKm || 0).toFixed(1)} km:{" "}
                  {money(settings.deliveryMinimumFee || 0)}. Depois: valor da saída
                  + km excedente × {money(settings.deliveryPricePerKm || 0)}/km.
                </small>
              </span>
            </div>
          </>
        )}
        <button className="primary-btn">
          <Save size={16} /> Salvar regras de entrega
        </button>
      </form>

      <div className="admin-two-column delivery-layout">
        <section className="admin-panel">
          <div className="panel-title">
            <div>
              <span>Exceções por região</span>
              <h2>Cidades e bairros especiais</h2>
              <p>
                Use para sobrescrever distância, taxa, pedido mínimo ou valor
                para entrega grátis.
              </p>
            </div>
            <b>{areas.filter((a) => a.active).length} ativas</b>
          </div>
          <div className="delivery-admin-list advanced-delivery-areas">
            {areas.length ? (
              areas.map((a) => (
                <article key={a.id}>
                  <div className="delivery-area-name">
                    <b>{a.neighborhood}</b>
                    <small>
                      {a.city}
                      {a.rawNeighborhood === "*"
                        ? " • cidade inteira"
                        : a.distanceKm != null
                          ? ` • ${Number(a.distanceKm).toFixed(1)} km`
                          : " • taxa fixa"}
                    </small>
                  </div>
                  <label>
                    Distância km
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      defaultValue={a.distanceKm ?? ""}
                      placeholder="auto/fixa"
                      onBlur={(e) =>
                        update(a, {
                          distanceKm:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Taxa fixa
                    <input
                      type="number"
                      step="0.01"
                      defaultValue={a.fee}
                      onBlur={(e) => update(a, { fee: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Pedido mínimo
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={a.minimumOrder || 0}
                      onBlur={(e) =>
                        update(a, { minimumOrder: Number(e.target.value || 0) })
                      }
                    />
                  </label>
                  <label>
                    Grátis a partir
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={a.freeDeliveryThreshold ?? ""}
                      placeholder="global"
                      onBlur={(e) =>
                        update(a, {
                          freeDeliveryThreshold:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className={a.active ? "area-toggle active" : "area-toggle"}
                    onClick={() => update(a, { active: !a.active })}
                  >
                    {a.active ? "Ativa" : "Pausada"}
                  </button>
                  <button
                    type="button"
                    className="subtle-danger"
                    onClick={() => remove(a)}
                  >
                    <Trash2 size={16} />
                  </button>
                </article>
              ))
            ) : (
              <div className="empty-admin">
                <Route />
                <p>
                  Nenhuma exceção cadastrada. O frete continuará automático.
                </p>
              </div>
            )}
          </div>
        </section>
        <form className="admin-panel compact-form" onSubmit={create}>
          <div className="panel-title">
            <div>
              <span>Nova exceção</span>
              <h2>Regra especial de região</h2>
            </div>
            <MapPin />
          </div>
          <label>
            Cidade
            <input
              required
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              placeholder="Ex.: Aracaju - SE"
            />
          </label>
          <label>
            Bairro / área <small>(opcional)</small>
            <input
              value={form.neighborhood}
              onChange={(e) =>
                setForm({ ...form, neighborhood: e.target.value })
              }
              placeholder="Vazio = cidade inteira"
            />
          </label>
          <label>
            Distância manual (km) <small>(opcional)</small>
            <input
              type="number"
              min="0"
              step="0.1"
              value={form.distanceKm}
              onChange={(e) => setForm({ ...form, distanceKm: e.target.value })}
              placeholder="Ex.: 3.2"
            />
          </label>
          <label>
            Taxa fixa (R$)
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={form.fee}
              onChange={(e) => setForm({ ...form, fee: e.target.value })}
            />
          </label>
          <div className="two-cols">
            <label>
              Pedido mínimo
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.minimumOrder || 0}
                onChange={(e) =>
                  setForm({ ...form, minimumOrder: e.target.value })
                }
              />
            </label>
            <label>
              Entrega grátis a partir
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.freeDeliveryThreshold}
                onChange={(e) =>
                  setForm({ ...form, freeDeliveryThreshold: e.target.value })
                }
                placeholder="Opcional"
              />
            </label>
          </div>
          <button className="primary-btn full">
            <Plus size={16} /> Adicionar exceção
          </button>
        </form>
      </div>
    </>
  );
}

