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
  normalizeMenuUrl,
  printableMenuProducts,
} from "../lib/menuPdf";

function initialUrl() {
  try {
    return (
      localStorage.getItem("master-pizza-print-menu-url") ||
      window.location.origin
    );
  } catch {
    return window.location.origin;
  }
}

export default function MenuPrintStudio({
  products = [],
  categories = [],
  subcategories = [],
  settings = {},
  notify = () => {},
}) {
  const [menuUrl, setMenuUrl] = useState(initialUrl);
  const [includePromotions, setIncludePromotions] = useState(true);
  const [generating, setGenerating] = useState("");
  const [error, setError] = useState("");
  const printable = useMemo(() => printableMenuProducts(products), [products]);
  const sections = useMemo(
    () => buildMenuSections(printable, categories, subcategories),
    [printable, categories, subcategories],
  );
  const preparedSettings = useMemo(
    () => ({ ...settings, logoImage: mediaUrl(settings.logoImage) }),
    [settings],
  );
  const preparedProducts = useMemo(
    () => printable.map((product) => ({ ...product, image: mediaUrl(product.image) })),
    [printable],
  );
  const validUrl = normalizeMenuUrl(menuUrl);

  function rememberUrl() {
    try {
      localStorage.setItem("master-pizza-print-menu-url", validUrl);
    } catch {}
  }

  async function generate(kind) {
    setError("");
    if (!validUrl) {
      setError("Informe um link completo começando com http:// ou https://.");
      return;
    }
    if (kind === "menu" && !preparedProducts.length) {
      setError("Cadastre e ative pelo menos um produto antes de gerar o PDF.");
      return;
    }
    setGenerating(kind);
    try {
      rememberUrl();
      if (kind === "menu") {
        const result = await createMenuPdf({
          products: preparedProducts,
          categories,
          subcategories,
          settings: preparedSettings,
          menuUrl: validUrl,
          includePromotions,
        });
        notify(`Cardápio criado em ${result.pageCount} página(s).`);
      } else {
        await createQrCodePdf({ settings: preparedSettings, menuUrl: validUrl });
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
            produtos, imagens e preços atuais.
          </p>
        </div>
        <Printer />
      </div>

      <div className="menu-print-grid">
        <div className="menu-print-form">
          <label className="menu-url-field">
            Link que será aberto pelo QR Code
            <span>
              <ExternalLink size={17} />
              <input
                type="url"
                maxLength={500}
                value={menuUrl}
                onChange={(event) => setMenuUrl(event.target.value)}
                placeholder="https://seusite.com/cardapio"
                autoComplete="url"
              />
            </span>
            <small>
              O link apenas será convertido em QR Code; nenhum site externo é
              carregado pelo painel.
            </small>
          </label>

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

          {error && <div className="menu-print-error">{error}</div>}

          <div className="menu-print-actions">
            <button
              type="button"
              className="primary-btn"
              disabled={Boolean(generating) || !preparedProducts.length}
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
              <b>{preparedProducts.length}</b>
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
            <span><Image size={15} /> Foto ao lado de cada produto</span>
            <span><Tags size={15} /> Separação por categoria e subcategoria</span>
            <span><QrCode size={15} /> QR Code validado antes da impressão</span>
          </div>
          <small className="menu-print-note">
            Produtos pausados ou arquivados não entram no arquivo. Se alguma
            imagem externa bloquear a leitura, o PDF usa uma identificação
            visual no lugar dela e continua sendo gerado.
          </small>
        </aside>
      </div>
    </section>
  );
}
