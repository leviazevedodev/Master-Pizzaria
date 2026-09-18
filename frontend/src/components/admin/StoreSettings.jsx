import React, { useState } from "react";
import { Activity, Clock3, CreditCard, ImagePlus, MapPin, PackagePlus, Palette, Plus, Route, Save, Settings, ShieldCheck, Trash2, Upload, Users } from "lucide-react";
import { mediaUrl } from "../../lib/api";
export default function StoreSettings({
  settings,
  setSettings,
  saveSettings,
  saveUploadedSetting,
  lookupStoreCep,
  goProducts,
  uploadMedia,
  imageUploading,
}) {
  const [newPaymentName, setNewPaymentName] = useState("");
  const standardTablePayments = [
    ["CASH", "Dinheiro"],
    ["PIX", "Pix"],
    ["CREDIT", "Cartão de crédito"],
    ["DEBIT", "Cartão de débito"],
  ];
  const tablePaymentMethods = Array.isArray(settings.tablePaymentMethods)
    ? settings.tablePaymentMethods
    : standardTablePayments.map(([value]) => value);
  const customPaymentMethods = Array.isArray(settings.customPaymentMethods)
    ? settings.customPaymentMethods
    : [];
  const updateCustomPayment = (id, patch) =>
    setSettings((current) => ({
      ...current,
      customPaymentMethods: (current.customPaymentMethods || []).map((method) =>
        method.id === id ? { ...method, ...patch } : method,
      ),
    }));
  const addCustomPayment = () => {
    const label = newPaymentName.trim().replace(/\s+/g, " ").slice(0, 40);
    if (label.length < 2) return;
    if (
      customPaymentMethods.some(
        (method) => method.label.toLocaleLowerCase("pt-BR") === label.toLocaleLowerCase("pt-BR"),
      )
    )
      return window.alert("Essa forma de pagamento já foi adicionada.");
    const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    setSettings((current) => ({
      ...current,
      customPaymentMethods: [
        ...(current.customPaymentMethods || []),
        { id, label, active: true, siteEnabled: false, tableEnabled: true },
      ],
    }));
    setNewPaymentName("");
  };
  const removeCustomPayment = (id) =>
    setSettings((current) => ({
      ...current,
      customPaymentMethods: (current.customPaymentMethods || []).filter(
        (method) => method.id !== id,
      ),
    }));
  const toggleTablePayment = (value) =>
    setSettings((current) => {
      const methods = Array.isArray(current.tablePaymentMethods)
        ? current.tablePaymentMethods
        : standardTablePayments.map(([method]) => method);
      return {
        ...current,
        tablePaymentMethods: methods.includes(value)
          ? methods.filter((method) => method !== value)
          : [...methods, value],
      };
    });
  const uploadSetting = (key, file) => {
    const config = {
      logoImage: [
        "Logo do site",
        { aspect: 16 / 7, fit: "contain", padding: 0.04 },
      ],
      faviconImage: ["Ícone do site", 1],
      shareImage: ["Imagem de compartilhamento", 1.91],
      heroImage: ["Imagem principal da home", 1 / 1.05],
      aboutImage: ["Imagem da seção Sobre", 4 / 3],
    }[key] || ["Imagem do site", 1];
    uploadMedia(
      file,
      async (url) => {
        const savedUrl = saveUploadedSetting
          ? await saveUploadedSetting(key, url)
          : url;
        setSettings((current) => ({ ...current, [key]: savedUrl }));
      },
      config[0],
      config[1],
    );
  };
  const selectSettingFile = (key, event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    uploadSetting(key, file);
  };
  function useDeviceLocation() {
    if (!navigator.geolocation)
      return window.alert("Este navegador não disponibiliza localização.");
    navigator.geolocation.getCurrentPosition(
      (position) =>
        setSettings((current) => ({
          ...current,
          storeLatitude: Number(position.coords.latitude.toFixed(7)),
          storeLongitude: Number(position.coords.longitude.toFixed(7)),
          storeGeoSource: "manual",
        })),
      () =>
        window.alert(
          "Não foi possível obter a localização. Você pode informar latitude e longitude manualmente.",
        ),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }
  function useGoogleMapsLink() {
    const raw = String(settings.storeGoogleMapsUrl || "").trim();
    let match = raw.match(/@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/);
    if (!match)
      match = raw.match(/!3d(-?\d{1,2}(?:\.\d+)?).*?!4d(-?\d{1,3}(?:\.\d+)?)/);
    if (!match) {
      try {
        const url = new URL(raw);
        const query = url.searchParams.get("q") ||
          url.searchParams.get("query") || url.searchParams.get("ll") || "";
        match = query.match(/^(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)$/);
      } catch {}
    }
    const latitude = Number(match?.[1]);
    const longitude = Number(match?.[2]);
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 || latitude > 90 ||
      longitude < -180 || longitude > 180
    )
      return window.alert(
        "O link foi salvo, mas não contém coordenadas visíveis. Abra o local no Google Maps, copie o link completo da barra de endereço e tente novamente.",
      );
    setSettings((current) => ({
      ...current,
      storeLatitude: Number(latitude.toFixed(7)),
      storeLongitude: Number(longitude.toFixed(7)),
      storeGeoSource: "google-maps",
    }));
  }
  return (
    <>
      <form className="admin-panel settings-form" onSubmit={saveSettings}>
        <div className="settings-quick-card">
          <div>
            <PackagePlus />
            <span>
              <b>Cardápio</b>
              <small>
                Produtos, promoções, adicionais e categorias ficam reunidos nas
                seções da aba Cardápio.
              </small>
            </span>
          </div>
          <button type="button" className="ghost-dark-btn" onClick={goProducts}>
            Abrir Cardápio
          </button>
        </div>
        <div className="panel-title">
          <div>
            <span>Configurações da loja</span>
            <h2>Atendimento, prazos e pagamentos</h2>
            <p>
              Os comandos de abrir/fechar, entrega e retirada agora ficam na aba
              Operação.
            </p>
          </div>
          <Settings />
        </div>
        <div className="store-location-card">
          <div className="panel-title compact">
            <div>
              <span>Origem do frete</span>
              <h3>Localização da unidade</h3>
              <p>
                Essa é a posição usada para calcular a distância automática até
                os bairros dos clientes.
              </p>
            </div>
            <MapPin />
          </div>
          <div className="store-location-grid">
            <label>
              CEP da loja
              <input
                inputMode="numeric"
                placeholder="00000-000"
                value={settings.storePostalCode || ""}
                onChange={(e) =>
                  setSettings({ ...settings, storePostalCode: e.target.value })
                }
              />
            </label>
            <label>
              Latitude
              <input
                type="number"
                step="0.0000001"
                value={settings.storeLatitude ?? ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    storeLatitude:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </label>
            <label>
              Longitude
              <input
                type="number"
                step="0.0000001"
                value={settings.storeLongitude ?? ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    storeLongitude:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </label>
          </div>
          <label className="store-maps-link">
            Link do Google Maps
            <input
              type="url"
              placeholder="https://www.google.com/maps/..."
              value={settings.storeGoogleMapsUrl || ""}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  storeGoogleMapsUrl: event.target.value,
                })
              }
            />
            <small>
              Cole o link completo do ponto da unidade para salvar e, quando o
              link trouxer latitude/longitude, aplicar as coordenadas.
            </small>
          </label>
          <div className="store-location-actions">
            <button
              type="button"
              className="ghost-dark-btn"
              onClick={lookupStoreCep}
            >
              <MapPin size={16} /> Localizar pelo CEP
            </button>
            <button
              type="button"
              className="ghost-dark-btn"
              onClick={useDeviceLocation}
            >
              <Route size={16} /> Usar localização deste aparelho
            </button>
            <button
              type="button"
              className="ghost-dark-btn"
              disabled={!settings.storeGoogleMapsUrl}
              onClick={useGoogleMapsLink}
            >
              <MapPin size={16} /> Aplicar link do Maps
            </button>
            {String(settings.storeGoogleMapsUrl || "").startsWith("https://") && (
              <a
                className="ghost-dark-btn"
                href={settings.storeGoogleMapsUrl}
                target="_blank"
                rel="noreferrer"
              >
                <Route size={16} /> Conferir no mapa
              </a>
            )}
            <span>
              <b>
                {settings.storeLatitude != null &&
                settings.storeLongitude != null
                  ? "Localização configurada"
                  : "Localização ainda não configurada"}
              </b>
              <small>
                {settings.storeGeoSource
                  ? `Origem: ${settings.storeGeoSource}`
                  : "Salve coordenadas confiáveis para melhorar o cálculo de frete."}
              </small>
            </span>
          </div>
        </div>
        <div className="payment-admin-box">
          <div className="panel-title compact">
            <div>
              <span>Formas aceitas agora</span>
              <h3>Pagamento</h3>
            </div>
            <CreditCard />
          </div>
          <div className="payment-toggle-grid">
            <label
              className={
                settings.cashPaymentEnabled
                  ? "payment-toggle active"
                  : "payment-toggle"
              }
            >
              <input
                type="checkbox"
                checked={Boolean(settings.cashPaymentEnabled)}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    cashPaymentEnabled: e.target.checked,
                  })
                }
              />
              <span>
                <b>Dinheiro</b>
                <small>
                  Pedido entra direto na operação; pagamento acontece na
                  entrega/retirada.
                </small>
              </span>
            </label>
            <label
              className={
                settings.onlinePaymentEnabled
                  ? "payment-toggle active"
                  : "payment-toggle"
              }
            >
              <input
                type="checkbox"
                checked={Boolean(settings.onlinePaymentEnabled)}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    onlinePaymentEnabled: e.target.checked,
                  })
                }
              />
              <span>
                <b>Pagamento online</b>
                <small>
                  {settings.onlinePaymentConfigured
                    ? "Mercado Pago configurado. O pedido só aparece para a loja após aprovação."
                    : "Configure Access Token, chave do webhook e URLs HTTPS públicas no backend."}
                </small>
              </span>
            </label>
          </div>
          <div className="custom-payment-manager">
            <div>
              <b>Formas padrão para mesas</b>
              <small>
                As quatro opções começam ativas. Desmarque qualquer uma para
                removê-la do fechamento das comandas.
              </small>
            </div>
            <div className="table-standard-payment-grid">
              {standardTablePayments.map(([value, label]) => (
                <label key={value}>
                  <input
                    type="checkbox"
                    checked={tablePaymentMethods.includes(value)}
                    onChange={() => toggleTablePayment(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
            <div>
              <b>Outras formas de pagamento</b>
              <small>
                Disponíveis somente para fechar comandas de mesa. No site,
                permanecem apenas Dinheiro, Pix e cartão pelo pagamento online.
              </small>
            </div>
            <div className="custom-payment-add">
              <input
                value={newPaymentName}
                maxLength={40}
                placeholder="Ex.: Vale-refeição"
                onChange={(event) => setNewPaymentName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addCustomPayment();
                  }
                }}
              />
              <button
                type="button"
                className="ghost-dark-btn"
                disabled={newPaymentName.trim().length < 2 || customPaymentMethods.length >= 20}
                onClick={addCustomPayment}
              >
                <Plus size={16} /> Adicionar
              </button>
            </div>
            {customPaymentMethods.length > 0 && (
              <div className="custom-payment-list">
                {customPaymentMethods.map((method) => (
                  <article key={method.id}>
                    <div className="custom-payment-name">
                      <input
                        type="checkbox"
                        aria-label={`Ativar ${method.label}`}
                        checked={method.active !== false}
                        onChange={(event) =>
                          updateCustomPayment(method.id, { active: event.target.checked })
                        }
                      />
                      <input
                        value={method.label}
                        maxLength={40}
                        aria-label="Nome da forma de pagamento"
                        onChange={(event) =>
                          updateCustomPayment(method.id, { label: event.target.value })
                        }
                      />
                    </div>
                    <label>
                      <input
                        type="checkbox"
                        checked={method.tableEnabled !== false}
                        onChange={(event) =>
                          updateCustomPayment(method.id, {
                            tableEnabled: event.target.checked,
                          })
                        }
                      />
                      Usar nas mesas
                    </label>
                    <button
                      type="button"
                      className="icon-action danger"
                      title={`Remover ${method.label}`}
                      onClick={() => removeCustomPayment(method.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="retention-policy-card">
          <div className="panel-title compact">
            <div>
              <span>Privacidade e retenção</span>
              <h3>Exclusão automática de dados</h3>
              <p>
                A limpeza é executada em segundo plano. Relatórios continuam
                íntegros durante o prazo fiscal definido.
              </p>
            </div>
            <ShieldCheck />
          </div>
          <div className="retention-policy-grid">
            <span><b>12 horas</b><small>Comandas encerradas na tela</small></span>
            <span><b>2 semanas</b><small>Carrinho e sessões abandonadas</small></span>
            <span><b>1 semana</b><small>Logs técnicos e de integração</small></span>
            <span><b>6 meses</b><small>Endereços e telefones</small></span>
            <span><b>5 anos</b><small>Pedidos, faturamento, pagamentos e fechamentos</small></span>
          </div>
        </div>
        <div className="settings-grid">
          <label>
            Nome da loja
            <input
              value={settings.storeName || ""}
              onChange={(e) =>
                setSettings({ ...settings, storeName: e.target.value })
              }
            />
          </label>
          <label>
            Nome curto
            <input
              value={settings.shortName || ""}
              onChange={(e) =>
                setSettings({ ...settings, shortName: e.target.value })
              }
            />
          </label>
          <label className="span-2">
            Slogan
            <input
              value={settings.slogan || ""}
              onChange={(e) =>
                setSettings({ ...settings, slogan: e.target.value })
              }
            />
          </label>
          <label>
            Telefone <small>(vazio = oculto)</small>
            <input
              value={settings.phone || ""}
              onChange={(e) =>
                setSettings({ ...settings, phone: e.target.value })
              }
            />
          </label>
          <label className="span-2">
            Endereço público da loja
            <input
              value={settings.address || ""}
              onChange={(e) =>
                setSettings({ ...settings, address: e.target.value })
              }
            />
          </label>
          <label>
            WhatsApp <small>(vazio = oculto)</small>
            <input
              value={settings.whatsappPrimary || ""}
              onChange={(e) =>
                setSettings({ ...settings, whatsappPrimary: e.target.value })
              }
            />
          </label>
          <label>
            WhatsApp 2
            <input
              value={settings.whatsappSecondary || ""}
              onChange={(e) =>
                setSettings({ ...settings, whatsappSecondary: e.target.value })
              }
            />
            <span className="inline-visibility-toggle">
              <input
                type="checkbox"
                checked={Boolean(settings.whatsappSecondaryVisible)}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    whatsappSecondaryVisible: e.target.checked,
                  })
                }
              />{" "}
              Exibir no site
            </span>
          </label>
          <label>
            Instagram <small>(vazio = oculto)</small>
            <input
              value={settings.instagram || ""}
              onChange={(e) =>
                setSettings({ ...settings, instagram: e.target.value })
              }
            />
          </label>
          <label>
            URL do Instagram
            <input
              value={settings.instagramUrl || ""}
              onChange={(e) =>
                setSettings({ ...settings, instagramUrl: e.target.value })
              }
            />
          </label>
          <label>
            URL do Facebook
            <input
              value={settings.facebookUrl || ""}
              onChange={(e) =>
                setSettings({ ...settings, facebookUrl: e.target.value })
              }
            />
          </label>
          <label>
            Produtos na home
            <input
              type="number"
              min="4"
              max="8"
              value={settings.homeProductLimit || 8}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  homeProductLimit: Number(e.target.value),
                })
              }
            />
          </label>
          <label>
            Prazo mínimo (min)
            <input
              type="number"
              min="5"
              max="300"
              value={settings.estimatedDeliveryMin || 30}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  estimatedDeliveryMin: Number(e.target.value),
                })
              }
            />
            <small>
              Somado ao horário da compra/agendamento para formar a previsão.
            </small>
          </label>
          <label>
            Prazo máximo (min)
            <input
              type="number"
              min="5"
              max="300"
              value={settings.estimatedDeliveryMax || 45}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  estimatedDeliveryMax: Number(e.target.value),
                })
              }
            />
            <small>Ex.: compra 18:00 + 30–45 min = 18:30–18:45.</small>
          </label>
          <label>
            Alerta antes do prazo (min)
            <input
              type="number"
              min="1"
              max="180"
              value={settings.lateWarningMinutes || 30}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  lateWarningMinutes: Number(e.target.value),
                })
              }
            />
            <small>
              Pedidos ganham um alerta no painel quando entrarem nessa janela.
            </small>
          </label>
          <label className="span-2">
            Descrição do cardápio
            <textarea
              value={settings.menuSubtitle || ""}
              onChange={(e) =>
                setSettings({ ...settings, menuSubtitle: e.target.value })
              }
            />
          </label>
        </div>
        <section className="store-automation-card">
          <div className="panel-title compact">
            <div>
              <span>Automação</span>
              <h3>Operação automática</h3>
              <p>
                Ative recursos de atendimento, cozinha, entrega e
                relacionamento.
              </p>
            </div>
            <Activity />
          </div>
          <div className="automation-toggle-grid">
            <label
              className={
                settings.newOrderSoundEnabled !== false
                  ? "payment-toggle active"
                  : "payment-toggle"
              }
            >
              <input
                type="checkbox"
                checked={settings.newOrderSoundEnabled !== false}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    newOrderSoundEnabled: e.target.checked,
                  })
                }
              />
              <span>
                <b>Som de novo pedido</b>
                <small>
                  Toca na tela Cozinha quando chegar um pedido novo.
                </small>
              </span>
            </label>
            <label
              className={
                settings.browserNotificationsEnabled !== false
                  ? "payment-toggle active"
                  : "payment-toggle"
              }
            >
              <input
                type="checkbox"
                checked={settings.browserNotificationsEnabled !== false}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    browserNotificationsEnabled: e.target.checked,
                  })
                }
              />
              <span>
                <b>Notificação no navegador</b>
                <small>
                  O navegador ainda pedirá permissão neste aparelho.
                </small>
              </span>
            </label>
            <label
              className={
                settings.autoPrintEnabled
                  ? "payment-toggle active"
                  : "payment-toggle"
              }
            >
              <input
                type="checkbox"
                checked={Boolean(settings.autoPrintEnabled)}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    autoPrintEnabled: e.target.checked,
                  })
                }
              />
              <span>
                <b>Impressão automática</b>
                <small>
                  Ao chegar pedido novo, abre a impressão na tela Cozinha.
                </small>
              </span>
            </label>
            <label
              className={
                settings.smartCourierQueueEnabled !== false
                  ? "payment-toggle active"
                  : "payment-toggle"
              }
            >
              <input
                type="checkbox"
                checked={settings.smartCourierQueueEnabled !== false}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    smartCourierQueueEnabled: e.target.checked,
                  })
                }
              />
              <span>
                <b>Fila inteligente de entregadores</b>
                <small>
                  Ao sair para entrega, atribui o entregador ativo com menos
                  corridas em aberto.
                </small>
              </span>
            </label>
            <label
              className={
                settings.cartRecommendationsEnabled !== false
                  ? "payment-toggle active"
                  : "payment-toggle"
              }
            >
              <input
                type="checkbox"
                checked={settings.cartRecommendationsEnabled !== false}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    cartRecommendationsEnabled: e.target.checked,
                  })
                }
              />
              <span>
                <b>Recomendação na sacola</b>
                <small>Sugere produtos que costumam ser comprados junto.</small>
              </span>
            </label>
            <label
              className={
                settings.whatsappAutoEnabled
                  ? "payment-toggle active"
                  : "payment-toggle"
              }
            >
              <input
                type="checkbox"
                checked={Boolean(settings.whatsappAutoEnabled)}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    whatsappAutoEnabled: e.target.checked,
                  })
                }
              />
              <span>
                <b>WhatsApp automático</b>
                <small>
                  {settings.whatsappWebhookConfigured
                    ? "Webhook de mensageria configurado."
                    : "Requer WHATSAPP_WEBHOOK_URL no backend para enviar de verdade."}
                </small>
              </span>
            </label>
          </div>
          {settings.whatsappAutoEnabled && (
            <div className="whatsapp-template-grid">
              <label>
                Mensagem de pedido recebido
                <textarea
                  value={settings.whatsappOrderCreatedTemplate || ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      whatsappOrderCreatedTemplate: e.target.value,
                    })
                  }
                />
                <small>
                  Variáveis: {"{cliente}"}, {"{pedido}"}, {"{total}"},{" "}
                  {"{status}"}
                </small>
              </label>
              <label>
                Mensagem de atualização
                <textarea
                  value={settings.whatsappStatusTemplate || ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      whatsappStatusTemplate: e.target.value,
                    })
                  }
                />
                <small>
                  O envio real depende de WHATSAPP_WEBHOOK_URL no backend.
                </small>
              </label>
            </div>
          )}
        </section>
        <section className="store-customer-rules">
          <div className="panel-title compact">
            <div>
              <span>Relacionamento</span>
              <h3>Clientes VIP e inativos</h3>
            </div>
            <Users />
          </div>
          <div className="settings-grid">
            <label>
              VIP a partir de pedidos
              <input
                type="number"
                min="1"
                value={settings.vipMinOrders || 8}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    vipMinOrders: Number(e.target.value),
                  })
                }
              />
            </label>
            <label>
              VIP a partir de gasto (R$)
              <input
                type="number"
                min="0"
                step="0.01"
                value={settings.vipMinSpend || 400}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    vipMinSpend: Number(e.target.value),
                  })
                }
              />
            </label>
            <label>
              Cliente inativo após (dias)
              <input
                type="number"
                min="1"
                value={settings.inactiveCustomerDays || 60}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    inactiveCustomerDays: Number(e.target.value),
                  })
                }
              />
            </label>
          </div>
        </section>
        <button className="primary-btn">
          <Save size={16} /> Salvar configurações
        </button>
      </form>

      <form
        className="admin-panel settings-form visual-control-panel"
        onSubmit={saveSettings}
      >
        <div className="panel-title">
          <div>
            <span>Editor da fachada</span>
            <h2>Textos e imagens do site</h2>
            <p>Altere a apresentação da home sem editar código.</p>
          </div>
          <Palette />
        </div>
        <div className="logo-admin-setting">
          <div>
            <b>Logo do site</b>
            <small>
              PNG, JPG ou WebP. A imagem será ajustada sem cortar a logo.
            </small>
          </div>
          <div className="site-logo-preview">
            <img
              src={
                mediaUrl(settings.logoImage) || "/images/store-placeholder.svg"
              }
              alt="Logo"
            />
          </div>
          <label
            className="upload-icon-button media-upload-standard"
            title="Trocar logo"
          >
            <Upload size={17} />
            <span>{imageUploading ? "Enviando..." : "Anexar imagem"}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={imageUploading}
              onChange={(event) => selectSettingFile("logoImage", event)}
            />
          </label>
          <input
            className="logo-url-input"
            placeholder="Ou URL da logo"
            value={settings.logoImage || ""}
            onChange={(e) =>
              setSettings({ ...settings, logoImage: e.target.value })
            }
          />
        </div>
        <div className="brand-assets-grid">
          {[
            ["faviconImage", "Ícone do navegador", "quadrado"],
            ["shareImage", "Imagem de compartilhamento", "1200 × 630 recomendado"],
          ].map(([field, label, hint]) => (
            <div className="logo-admin-setting compact" key={field}>
              <div><b>{label}</b><small>{hint}</small></div>
              {settings[field] && <img src={mediaUrl(settings[field])} alt="" />}
              <label className="upload-icon-button media-upload-standard">
                <ImagePlus size={17} /><span>Anexar</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" disabled={imageUploading} onChange={(event) => selectSettingFile(field, event)} />
              </label>
              <input value={settings[field] || ""} placeholder="Ou URL da imagem" onChange={(event) => setSettings({ ...settings, [field]: event.target.value })} />
            </div>
          ))}
        </div>
        <div className="settings-grid brand-seo-grid">
          <label>Cor principal<input type="color" value={settings.primaryColor || "#e31b23"} onChange={(event) => setSettings({ ...settings, primaryColor: event.target.value })} /></label>
          <label>Cor secundária<input type="color" value={settings.secondaryColor || "#111214"} onChange={(event) => setSettings({ ...settings, secondaryColor: event.target.value })} /></label>
          <label>Cor de destaque<input type="color" value={settings.accentColor || "#ff323a"} onChange={(event) => setSettings({ ...settings, accentColor: event.target.value })} /></label>
          <label className="span-2">Título para buscadores<input value={settings.seoTitle || ""} onChange={(event) => setSettings({ ...settings, seoTitle: event.target.value })} /></label>
          <label className="span-2">Descrição para buscadores<textarea value={settings.seoDescription || ""} onChange={(event) => setSettings({ ...settings, seoDescription: event.target.value })} /></label>
          <label className="span-2">URL canônica<input type="url" value={settings.seoCanonicalUrl || ""} onChange={(event) => setSettings({ ...settings, seoCanonicalUrl: event.target.value })} /></label>
        </div>
        <div className="visual-editor-grid">
          <div className="visual-editor-fields">
            <label>
              Título do cardápio
              <input
                value={settings.menuTitle || ""}
                onChange={(e) =>
                  setSettings({ ...settings, menuTitle: e.target.value })
                }
              />
            </label>
            <label>
              Texto pequeno do destaque
              <input
                value={settings.heroEyebrow || ""}
                onChange={(e) =>
                  setSettings({ ...settings, heroEyebrow: e.target.value })
                }
              />
            </label>
            <label>
              Título principal
              <textarea
                value={settings.heroTitle || ""}
                onChange={(e) =>
                  setSettings({ ...settings, heroTitle: e.target.value })
                }
              />
            </label>
            <label>
              Descrição principal
              <textarea
                value={settings.heroSubtitle || ""}
                onChange={(e) =>
                  setSettings({ ...settings, heroSubtitle: e.target.value })
                }
              />
            </label>
            <div className="hero-stamp-editor">
              <b>Cartão flutuante da imagem</b>
              <label>
                Título
                <input
                  value={settings.heroStampTitle ?? "Massa artesanal"}
                  onChange={(e) =>
                    setSettings({ ...settings, heroStampTitle: e.target.value })
                  }
                />
              </label>
              <label>
                Descrição
                <input
                  value={
                    settings.heroStampText ?? "preparo cuidadoso em cada pedido"
                  }
                  onChange={(e) =>
                    setSettings({ ...settings, heroStampText: e.target.value })
                  }
                />
              </label>
              <small>
                Deixe os dois campos vazios para esconder o cartão da página
                inicial.
              </small>
            </div>
          </div>
          <div className="admin-image-setting">
            <b>Imagem principal</b>
            <div className="site-image-preview">
              {settings.heroImage ? (
                <img src={mediaUrl(settings.heroImage)} alt="Destaque" />
              ) : (
                <ImagePlus />
              )}
            </div>
            <label
              className="upload-icon-button media-upload-standard"
              title="Anexar imagem"
            >
              <Upload size={17} />
              <span>{imageUploading ? "Enviando..." : "Anexar imagem"}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={imageUploading}
                onChange={(event) => selectSettingFile("heroImage", event)}
              />
            </label>
            <input
              placeholder="Ou URL da imagem"
              value={settings.heroImage || ""}
              onChange={(e) =>
                setSettings({ ...settings, heroImage: e.target.value })
              }
            />
          </div>
        </div>
        <div className="visual-editor-grid about-editor">
          <div className="visual-editor-fields">
            <label>
              Etiqueta do Sobre
              <input
                value={settings.aboutEyebrow || ""}
                onChange={(e) =>
                  setSettings({ ...settings, aboutEyebrow: e.target.value })
                }
              />
            </label>
            <label>
              Título do Sobre
              <textarea
                value={settings.aboutTitle || ""}
                onChange={(e) =>
                  setSettings({ ...settings, aboutTitle: e.target.value })
                }
              />
            </label>
            <label>
              Texto do Sobre
              <textarea
                value={settings.aboutText || ""}
                onChange={(e) =>
                  setSettings({ ...settings, aboutText: e.target.value })
                }
              />
            </label>
          </div>
          <div className="admin-image-setting">
            <b>Imagem do Sobre</b>
            <div className="site-image-preview">
              {settings.aboutImage ? (
                <img src={mediaUrl(settings.aboutImage)} alt="Sobre" />
              ) : (
                <ImagePlus />
              )}
            </div>
            <label
              className="upload-icon-button media-upload-standard"
              title="Anexar imagem"
            >
              <Upload size={17} />
              <span>{imageUploading ? "Enviando..." : "Anexar imagem"}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={imageUploading}
                onChange={(event) => selectSettingFile("aboutImage", event)}
              />
            </label>
            <input
              placeholder="Ou URL da imagem"
              value={settings.aboutImage || ""}
              onChange={(e) =>
                setSettings({ ...settings, aboutImage: e.target.value })
              }
            />
          </div>
        </div>
        <div className="settings-grid">
          <label>
            Título das promoções
            <input
              value={settings.promotionsTitle || ""}
              onChange={(e) =>
                setSettings({ ...settings, promotionsTitle: e.target.value })
              }
            />
          </label>
          <label>
            Subtítulo das promoções
            <input
              value={settings.promotionsSubtitle || ""}
              onChange={(e) =>
                setSettings({ ...settings, promotionsSubtitle: e.target.value })
              }
            />
          </label>
          <label className="span-2">
            Texto do rodapé
            <textarea
              value={settings.footerText || ""}
              onChange={(e) =>
                setSettings({ ...settings, footerText: e.target.value })
              }
            />
          </label>
        </div>
        <button className="primary-btn">
          <Save size={16} /> Salvar aparência
        </button>
      </form>

      <form className="admin-panel settings-form" onSubmit={saveSettings}>
        <div className="panel-title">
          <div>
            <span>Horário do sistema</span>
            <h2>Fuso horário</h2>
            <p>
              O frete não depende mais das coordenadas de um CEP. A distância é
              configurada por bairro na aba Entregas.
            </p>
          </div>
          <Clock3 />
        </div>
        <div className="settings-grid">
          <label>
            Fuso horário
            <input
              value={settings.timezone || "America/Maceio"}
              onChange={(e) =>
                setSettings({ ...settings, timezone: e.target.value })
              }
            />
          </label>
        </div>
        <button className="primary-btn">
          <Save size={16} /> Salvar fuso horário
        </button>
      </form>
    </>
  );
}
