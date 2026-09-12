import React, { useMemo, useState } from "react";
import {
  ExternalLink,
  FileDown,
  Image,
  LoaderCircle,
  Printer,
  QrCode,
  Tags,
} from "lucide-react";
import { mediaUrl } from "../lib/api";
import {
  buildMenuSections,
  createMenuPdf,
  createQrCodePdf,
  printableMenuProducts,
} from "../lib/menuPdf";

export default function MenuPrintStudio({
  products = [],
  categories = [],
  subcategories = [],
  settings = {},
  notify = () => {},
  onDigitalMenuChange = async () => {},
}) {
  const [includePromotions, setIncludePromotions] = useState(true);
  const [generating, setGenerating] = useState("");
  const [error, setError] = useState("");
  const [savingDigitalMenu, setSavingDigitalMenu] = useState(false);
  const printable = useMemo(() => printableMenuProducts(products), [products]);
  const sections = useMemo(
    () => buildMenuSections(printable, categories, subcategories),
    [printable, categories, subcategories],
  );
  const preparedSettings = useMemo(
    () => ({
      ...settings,
      logoImage:
        mediaUrl(settings.logoImage) || "/images/master-pizzaria-logo.png",
    }),
    [settings],
  );
  const menuUrl = useMemo(
    () =>
      settings.publicMenuUrl ||
      new URL("/cardapio-digital", window.location.origin).href,
    [settings.publicMenuUrl],
  );

  async function generate(kind) {
    setError("");
    if (kind === "menu" && !printable.length) {
      setError("Cadastre e ative pelo menos um produto antes de gerar o PDF.");
      return;
    }
    setGenerating(kind);
    try {
      if (kind === "menu") {
        const result = await createMenuPdf({
          products: printable,
          categories,
          subcategories,
          settings: preparedSettings,
          menuUrl,
          includePromotions,
        });
        notify(`Cardápio criado em ${result.pageCount} página(s).`);
      } else {
        await createQrCodePdf({ settings: preparedSettings, menuUrl });
        notify("PDF com o QR Code criado.");
      }
    } catch (generationError) {
      setError(
        generationError?.message || "Não foi possível criar o arquivo PDF.",
      );
    } finally {
      setGenerating("");
    }
  }

  return (
    <section className="admin-panel menu-print-studio">
      <div className="panel-title menu-print-heading">
        <div>
          <span>Material para impressão</span>
          <h2>Cardápio em PDF e QR Code</h2>
          <p>
            Gere um cardápio organizado por categoria e subcategoria usando os
            produtos e preços atuais, em um layout escuro compacto de duas
            páginas.
          </p>
        </div>
        <Printer />
      </div>

      <div className="menu-print-grid">
        <div className="menu-print-form">
          <div className="menu-url-field">
            Endereço oficial do cardápio digital
            <span>
              <ExternalLink size={17} />
              <output>{menuUrl}</output>
            </span>
            <small>
              O QR Code é protegido contra link digitado incorretamente: ele
              sempre abre somente o cardápio presencial desta pizzaria.
            </small>
          </div>

          <label className="menu-promotion-option">
            <input
              type="checkbox"
              checked={includePromotions}
              onChange={(event) => setIncludePromotions(event.target.checked)}
            />
            <span>
              <b>Incluir preços promocionais ativos</b>
              <small>
                Desmarque para imprimir somente os valores base do cardápio.
              </small>
            </span>
          </label>

          <label className="menu-promotion-option digital-menu-toggle">
            <input
              type="checkbox"
              checked={settings.digitalMenuEnabled !== false}
              disabled={savingDigitalMenu}
              onChange={async (event) => {
                const enabled = event.target.checked;
                setSavingDigitalMenu(true);
                setError("");
                try {
                  await onDigitalMenuChange(enabled);
                  notify(
                    enabled
                      ? "Cardápio digital das mesas ativado."
                      : "Cardápio digital das mesas desativado.",
                  );
                } catch (requestError) {
                  setError(
                    requestError.response?.data?.message ||
                      "Não foi possível alterar o cardápio digital.",
                  );
                } finally {
                  setSavingDigitalMenu(false);
                }
              }}
            />
            <span>
              <b>Permitir acesso ao cardápio digital das mesas</b>
              <small>
                Quando desativado, o endereço e a finalização presencial ficam
                bloqueados no site e na API.
              </small>
            </span>
          </label>

          {error && <div className="menu-print-error">{error}</div>}

          <div className="menu-print-actions">
            <button
              type="button"
              className="primary-btn"
              disabled={Boolean(generating) || !printable.length}
              onClick={() => generate("menu")}
            >
              {generating === "menu" ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <FileDown size={17} />
              )}
              {generating === "menu" ? "Criando PDF..." : "Criar cardápio em PDF"}
            </button>
            <button
              type="button"
              className="ghost-dark-btn menu-qr-only-btn"
              disabled={Boolean(generating)}
              onClick={() => generate("qr")}
            >
              {generating === "qr" ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <QrCode size={17} />
              )}
              {generating === "qr" ? "Criando QR Code..." : "Imprimir apenas QR Code"}
            </button>
          </div>
        </div>

        <aside className="menu-print-preview">
          <div className="menu-preview-brand">
            <span>
              {preparedSettings.logoImage ? (
                <img src={preparedSettings.logoImage} alt="Logo da loja" />
              ) : (
                <Image />
              )}
            </span>
            <div>
              <small>Prévia do conteúdo</small>
              <b>{settings.storeName || "Seu restaurante"}</b>
            </div>
          </div>
          <div className="menu-print-kpis">
            <span>
              <b>{printable.length}</b>
              <small>produtos</small>
            </span>
            <span>
              <b>{sections.length}</b>
              <small>categorias</small>
            </span>
            <span>
              <b>{sections.reduce((sum, section) => sum + section.groups.length, 0)}</b>
              <small>subcategorias</small>
            </span>
          </div>
          <div className="menu-preview-features">
            <span><Image size={15} /> Layout compacto, sem fotos de produtos</span>
            <span><Tags size={15} /> Separação por categoria e subcategoria</span>
            <span><QrCode size={15} /> QR Code exclusivo do cardápio digital</span>
          </div>
          <small className="menu-print-note">
            Produtos pausados ou arquivados não entram no arquivo. Os tamanhos
            e respectivos valores são alinhados ao lado de cada produto.
          </small>
        </aside>
      </div>
    </section>
  );
}
