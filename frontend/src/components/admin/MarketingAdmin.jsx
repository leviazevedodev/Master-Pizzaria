import React, { useEffect, useState } from "react";
import { Check, EyeOff, Gift, Megaphone, Pencil, Plus, Save, Star, Trash2, X } from "lucide-react";
import { api, authHeaders, mediaUrl } from "../../lib/api";
import CouponsAdmin from "./CouponsAdmin";

const EMPTY_CAMPAIGN = {
  id: null,
  title: "",
  description: "",
  image: "",
  buttonText: "Ver cardápio",
  targetUrl: "/cardapio",
  couponCode: "",
  startsAt: "",
  endsAt: "",
  sortOrder: 0,
  active: true,
};

const toLocalDateTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

export default function MarketingAdmin({
  session,
  settings,
  setSettings,
  notify,
  fail,
  onChanged,
  uploadMedia,
  imageUploading = false,
}) {
  const headers = authHeaders(session.token);
  const [campaigns, setCampaigns] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [form, setForm] = useState(EMPTY_CAMPAIGN);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const [campaignResponse, reviewResponse] = await Promise.all([
        api.get("/admin/campaigns", headers),
        api.get("/admin/reviews", headers),
      ]);
      setCampaigns(campaignResponse.data || []);
      setReviews(reviewResponse.data || []);
    } catch (error) {
      fail?.(error, "Não foi possível carregar marketing e avaliações.");
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function saveGrowthSettings(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const fields = [
        "publicReviewsEnabled",
        "reviewCollectionEnabled",
        "bestSellersEnabled",
        "newProductsEnabled",
        "newProductDays",
        "rewardsMode",
        "loyaltyEnabled",
        "loyaltyPointsPerReal",
        "loyaltyRewardPoints",
        "loyaltyRewardValue",
        "cashbackEnabled",
        "cashbackPercent",
      ];
      const payload = Object.fromEntries(fields.map((field) => [field, settings[field]]));
      const { data } = await api.patch("/admin/settings", payload, headers);
      setSettings((current) => ({ ...current, ...data }));
      notify?.("Recursos de relacionamento salvos.");
      await onChanged?.();
    } catch (error) {
      fail?.(error, "Não foi possível salvar os recursos de relacionamento.");
    } finally {
      setSaving(false);
    }
  }

  async function createCampaign(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      };
      delete payload.id;
      if (form.id)
        await api.patch(`/admin/campaigns/${form.id}`, payload, headers);
      else await api.post("/admin/campaigns", payload, headers);
      setForm(EMPTY_CAMPAIGN);
      notify?.(form.id ? "Campanha atualizada." : "Campanha criada.");
      await load();
      await onChanged?.();
    } catch (error) {
      fail?.(error, "Não foi possível criar a campanha.");
    } finally {
      setSaving(false);
    }
  }

  function editCampaign(row) {
    setForm({
      id: row.id,
      title: row.title || "",
      description: row.description || "",
      image: row.image || "",
      buttonText: row.buttonText || "",
      targetUrl: row.targetUrl || "",
      couponCode: row.couponCode || "",
      startsAt: toLocalDateTime(row.startsAt),
      endsAt: toLocalDateTime(row.endsAt),
      sortOrder: Number(row.sortOrder || 0),
      active: Boolean(row.active),
    });
  }

  async function archiveCampaign(row) {
    try {
      await api.delete(`/admin/campaigns/${row.id}`, headers);
      await load();
      await onChanged?.();
    } catch (error) {
      fail?.(error, "Não foi possível arquivar a campanha.");
    }
  }

  async function moderate(review, status) {
    try {
      const { data } = await api.patch(
        `/admin/reviews/${review.id}`,
        { status },
        headers,
      );
      setReviews((rows) => rows.map((row) => (row.id === review.id ? { ...row, ...data } : row)));
      notify?.(status === "APPROVED" ? "Avaliação publicada." : "Avaliação ocultada.");
      await onChanged?.();
    } catch (error) {
      fail?.(error, "Não foi possível moderar a avaliação.");
    }
  }

  const set = (field, value) => setSettings((current) => ({ ...current, [field]: value }));
  const toggle = (field, label) => (
    <label className="switch-label">
      <input type="checkbox" checked={Boolean(settings[field])} onChange={(event) => set(field, event.target.checked)} /> {label}
    </label>
  );

  return (
    <div className="marketing-admin-grid">
      <form className="admin-panel settings-form" onSubmit={saveGrowthSettings}>
        <div className="panel-title">
          <div><span>Relacionamento</span><h2>Vitrine, avaliações e recompensas</h2><p>Ative somente os recursos que a loja deseja oferecer.</p></div>
          <Gift />
        </div>
        <div className="marketing-toggle-grid">
          {toggle("reviewCollectionEnabled", "Coletar avaliações após a entrega")}
          {toggle("publicReviewsEnabled", "Exibir avaliações aprovadas no site")}
          {toggle("bestSellersEnabled", "Exibir os mais pedidos")}
          {toggle("newProductsEnabled", "Destacar novidades")}
        </div>
        <div className="settings-grid">
          <label>Programa de recompensa<select value={settings.rewardsMode || "DISABLED"} onChange={(event) => set("rewardsMode", event.target.value)}><option value="DISABLED">Desativado</option><option value="POINTS">Pontos</option><option value="CASHBACK">Cashback</option></select></label>
          <label>Dias como novidade<input type="number" min="1" max="365" value={settings.newProductDays || 30} onChange={(event) => set("newProductDays", Number(event.target.value))} /></label>
          {settings.rewardsMode === "POINTS" && <><label>Pontos por real<input type="number" min="0" step="0.1" value={settings.loyaltyPointsPerReal || 0} onChange={(event) => set("loyaltyPointsPerReal", Number(event.target.value))} /></label><label>Pontos para resgate<input type="number" min="1" value={settings.loyaltyRewardPoints || 500} onChange={(event) => set("loyaltyRewardPoints", Number(event.target.value))} /></label><label>Valor do resgate<input type="number" min="0" step="0.01" value={settings.loyaltyRewardValue || 0} onChange={(event) => set("loyaltyRewardValue", Number(event.target.value))} /></label></>}
          {settings.rewardsMode === "CASHBACK" && <label>Cashback (%)<input type="number" min="0" max="100" step="0.1" value={settings.cashbackPercent || 0} onChange={(event) => set("cashbackPercent", Number(event.target.value))} /></label>}
        </div>
        <button className="primary-btn" disabled={saving}><Save size={16} /> Salvar relacionamento</button>
      </form>

      <CouponsAdmin session={session} notify={notify} fail={fail} />

      <form className="admin-panel settings-form" onSubmit={createCampaign}>
        <div className="panel-title"><div><span>Campanhas</span><h2>Faixas promocionais da página inicial</h2><p>Use período, imagem, cupom e chamada para ação.</p></div><Megaphone /></div>
        <div className="settings-grid">
          <label>Título<input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
          <label>Cupom opcional<input value={form.couponCode} onChange={(event) => setForm({ ...form, couponCode: event.target.value.toUpperCase() })} /></label>
          <label className="span-2">Descrição<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          <label className="span-2">Imagem (URL ou mídia enviada)<input value={form.image} onChange={(event) => setForm({ ...form, image: event.target.value })} /></label>
          <label className="span-2 campaign-image-upload">
            Enviar banner
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={imageUploading}
              onChange={(event) =>
                uploadMedia?.(
                  event.target.files?.[0],
                  (url) => setForm((current) => ({ ...current, image: url })),
                )
              }
            />
            {imageUploading && <small>Enviando imagem...</small>}
            <small className="upload-resolution-hint">Resolução recomendada: 1200 × 525 px<br />Proporção recomendada: 16:7</small>
          </label>
          <label>Texto do botão<input value={form.buttonText} onChange={(event) => setForm({ ...form, buttonText: event.target.value })} /></label>
          <label>Destino<input value={form.targetUrl} onChange={(event) => setForm({ ...form, targetUrl: event.target.value })} /></label>
          <label>Início<input type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} /></label>
          <label>Fim<input type="datetime-local" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} /></label>
          <label>Ordem<input type="number" min="-10000" max="10000" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })} /></label>
          <label className="switch-label"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Campanha ativa</label>
        </div>
        <div className="campaign-form-actions">
          <button className="primary-btn" disabled={saving}>{form.id ? <Save size={16} /> : <Plus size={16} />} {form.id ? "Salvar campanha" : "Criar campanha"}</button>
          {form.id && <button type="button" className="ghost-dark-btn" onClick={() => setForm(EMPTY_CAMPAIGN)}><X size={16} /> Cancelar edição</button>}
        </div>
        <div className="campaign-admin-list">
          {campaigns.map((campaign) => <article key={campaign.id}>{campaign.image && <img src={mediaUrl(campaign.image)} alt="" />}<div><b>{campaign.title}</b><small>{campaign.description}</small><span>{campaign.active ? "Ativa" : "Arquivada"} • ordem {campaign.sortOrder}</span></div><div className="campaign-row-actions"><button type="button" className="ghost-dark-btn" onClick={() => editCampaign(campaign)}><Pencil size={15} /> Editar</button>{campaign.active && <button type="button" className="subtle-danger" onClick={() => archiveCampaign(campaign)} title="Arquivar campanha"><Trash2 size={15} /></button>}</div></article>)}
        </div>
      </form>

      <section className="admin-panel settings-form marketing-reviews-panel">
        <div className="panel-title"><div><span>Moderação</span><h2>Avaliações de pedidos entregues</h2><p>Somente as aprovadas aparecem publicamente.</p></div><Star /></div>
        <div className="review-admin-list">
          {reviews.map((review) => <article key={review.id}><div><span>{review.deliveryRating ? `Entrega: ${"★".repeat(review.deliveryRating)}${"☆".repeat(5 - review.deliveryRating)} • ` : ""}Comida: {"★".repeat(review.foodRating || review.rating)}{"☆".repeat(5 - (review.foodRating || review.rating))}</span><b>{review.customerName || "Cliente"}</b><p>{review.comment || "Sem comentário."}</p><small>Status: {review.status}</small></div><div>{review.status !== "APPROVED" && <button className="primary-btn" onClick={() => moderate(review, "APPROVED")}><Check size={15} /> Aprovar</button>}{review.status !== "HIDDEN" && <button className="ghost-dark-btn" onClick={() => moderate(review, "HIDDEN")}><EyeOff size={15} /> Ocultar</button>}</div></article>)}
          {!reviews.length && <p className="empty-inline">Nenhuma avaliação recebida.</p>}
        </div>
      </section>
    </div>
  );
}
