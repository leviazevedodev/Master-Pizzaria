import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  MapPin,
  Palette,
  ShieldCheck,
  Store,
  WalletCards,
} from "lucide-react";
import { api, authHeaders } from "../../lib/api";
import "./SetupWizard.css";

const STEPS = [
  ["Identidade", Palette],
  ["Contato", Store],
  ["Endereço", MapPin],
  ["Horários", Clock3],
  ["Pagamentos", WalletCards],
  ["Administrador", ShieldCheck],
];

export default function SetupWizard({
  session,
  settings,
  setSettings,
  onComplete,
}) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [hours, setHours] = useState([]);
  const headers = authHeaders(session.token);
  const set = (field, value) =>
    setSettings((current) => ({ ...current, [field]: value }));

  useEffect(() => {
    api
      .get("/admin/store-hours", headers)
      .then(({ data }) => setHours(data || []))
      .catch(() => {});
  }, [session.token]);

  function updateHour(index, patch) {
    setHours((rows) =>
      rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
  }

  async function next() {
    setSaving(true);
    setError("");
    try {
      const fieldsByStep = [
        [
          "storeName",
          "shortName",
          "slogan",
          "primaryColor",
          "secondaryColor",
          "accentColor",
          "seoTitle",
          "seoDescription",
        ],
        ["phone", "whatsappPrimary", "instagram", "instagramUrl", "facebookUrl"],
        [
          "address",
          "storePostalCode",
          "deliveryEnabled",
          "pickupEnabled",
          "schedulingEnabled",
        ],
        ["openingHours"],
        ["cashPaymentEnabled", "onlinePaymentEnabled"],
        [],
      ];
      if (step === 3)
        await Promise.all(
          hours.map((hour) =>
            api.patch(
              `/admin/store-hours/${hour.id}`,
              {
                openTime: hour.openTime,
                closeTime: hour.closeTime,
                closed: hour.closed,
              },
              headers,
            ),
          ),
        );
      const payload = Object.fromEntries(
        fieldsByStep[step].map((field) => [field, settings[field]]),
      );
      if (step === STEPS.length - 1) payload.initialSetupCompleted = true;
      const { data } = await api.patch("/admin/settings", payload, headers);
      setSettings((current) => ({ ...current, ...data }));
      if (step === STEPS.length - 1) await onComplete?.();
      else setStep((value) => value + 1);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Não foi possível salvar esta etapa.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="setup-wizard-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="setup-title"
    >
      <section className="setup-wizard-card">
        <div className="setup-progress">
          {STEPS.map(([label, Icon], index) => (
            <span className={index <= step ? "active" : ""} key={label}>
              <Icon size={17} />
              <small>{label}</small>
            </span>
          ))}
        </div>
        <div className="setup-wizard-heading">
          <span className="eyebrow dark">Configuração inicial</span>
          <h2 id="setup-title">{STEPS[step][0]} da sua loja</h2>
          <p>Estas informações podem ser alteradas depois no painel.</p>
        </div>

        {step === 0 && (
          <div className="settings-grid">
            <label>
              Nome da loja
              <input required value={settings.storeName || ""} onChange={(event) => set("storeName", event.target.value)} />
            </label>
            <label>
              Nome curto
              <input value={settings.shortName || ""} onChange={(event) => set("shortName", event.target.value)} />
            </label>
            <label className="span-2">
              Slogan
              <input value={settings.slogan || ""} onChange={(event) => set("slogan", event.target.value)} />
            </label>
            <label>
              Cor principal
              <input type="color" value={settings.primaryColor || "#e31b23"} onChange={(event) => set("primaryColor", event.target.value)} />
            </label>
            <label>
              Cor secundária
              <input type="color" value={settings.secondaryColor || "#111214"} onChange={(event) => set("secondaryColor", event.target.value)} />
            </label>
            <label className="span-2">
              Título para buscadores
              <input value={settings.seoTitle || ""} onChange={(event) => set("seoTitle", event.target.value)} />
            </label>
            <label className="span-2">
              Descrição para buscadores
              <textarea value={settings.seoDescription || ""} onChange={(event) => set("seoDescription", event.target.value)} />
            </label>
          </div>
        )}
        {step === 1 && (
          <div className="settings-grid">
            <label>Telefone<input value={settings.phone || ""} onChange={(event) => set("phone", event.target.value)} /></label>
            <label>WhatsApp<input value={settings.whatsappPrimary || ""} onChange={(event) => set("whatsappPrimary", event.target.value)} /></label>
            <label>Instagram<input value={settings.instagram || ""} onChange={(event) => set("instagram", event.target.value)} /></label>
            <label>URL do Instagram<input value={settings.instagramUrl || ""} onChange={(event) => set("instagramUrl", event.target.value)} /></label>
            <label className="span-2">URL do Facebook<input value={settings.facebookUrl || ""} onChange={(event) => set("facebookUrl", event.target.value)} /></label>
          </div>
        )}
        {step === 2 && (
          <>
            <div className="settings-grid">
              <label className="span-2">Endereço da loja<input value={settings.address || ""} onChange={(event) => set("address", event.target.value)} /></label>
              <label>CEP da loja<input value={settings.storePostalCode || ""} onChange={(event) => set("storePostalCode", event.target.value)} /></label>
            </div>
            <div className="setup-operation-options">
              {[
                ["deliveryEnabled", "Aceitar entrega"],
                ["pickupEnabled", "Aceitar retirada"],
                ["schedulingEnabled", "Permitir agendamento"],
              ].map(([field, label]) => (
                <label key={field}>
                  <input type="checkbox" checked={Boolean(settings[field])} onChange={(event) => set(field, event.target.checked)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <label className="setup-summary-hours">
              Texto resumido de funcionamento
              <input value={settings.openingHours || ""} onChange={(event) => set("openingHours", event.target.value)} />
            </label>
            <div className="setup-hours-list">
              {hours.map((hour, index) => (
                <div key={hour.id}>
                  <b>{hour.label}</b>
                  <label>
                    <input type="checkbox" checked={Boolean(hour.closed)} onChange={(event) => updateHour(index, { closed: event.target.checked })} /> Fechado
                  </label>
                  <input type="time" disabled={hour.closed} value={hour.openTime} onChange={(event) => updateHour(index, { openTime: event.target.value })} />
                  <input type="time" disabled={hour.closed} value={hour.closeTime} onChange={(event) => updateHour(index, { closeTime: event.target.value })} />
                </div>
              ))}
            </div>
          </>
        )}
        {step === 4 && (
          <div className="setup-operation-options">
            {[
              ["cashPaymentEnabled", "Aceitar dinheiro"],
              ["onlinePaymentEnabled", "Habilitar Pix/cartão quando o provedor estiver configurado"],
            ].map(([field, label]) => (
              <label key={field}>
                <input type="checkbox" checked={Boolean(settings[field])} onChange={(event) => set(field, event.target.checked)} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        )}
        {step === 5 && (
          <div className="setup-admin-ready">
            <ShieldCheck size={38} />
            <h3>Administrador confirmado</h3>
            <p><b>{session.user.name}</b><br />{session.user.email}</p>
            <p>Esta conta continuará como proprietária. Novos funcionários podem ser criados depois na aba Funcionários.</p>
            <strong>Sua pizzaria está pronta.</strong>
          </div>
        )}

        {error && <div className="form-error">{error}</div>}
        <div className="setup-wizard-actions">
          <button type="button" className="ghost-dark-btn" disabled={step === 0 || saving} onClick={() => setStep((value) => value - 1)}>
            <ArrowLeft size={16} /> Voltar
          </button>
          <button type="button" className="primary-btn" disabled={saving || !String(settings.storeName || "").trim()} onClick={next}>
            {saving ? "Salvando..." : step === STEPS.length - 1 ? "Concluir configuração" : "Salvar e continuar"}{" "}
            {step === STEPS.length - 1 ? <Check size={16} /> : <ArrowRight size={16} />}
          </button>
        </div>
      </section>
    </div>
  );
}
