const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const PAGE_MARGIN = 14;
const CONTENT_BOTTOM = 279;
const BRAND_RED = [220, 28, 36];
const INK = [30, 33, 38];
const MUTED = [99, 105, 116];
const imageCache = new Map();

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanLine(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatPrice(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(numeric(value));
}

function fileSlug(value) {
  return (
    String(value || "cardapio")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "cardapio"
  );
}

export function normalizeMenuUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (!["http:", "https:"].includes(url.protocol)) return "";
    if (url.username || url.password) return "";
    return url.href;
  } catch {
    return "";
  }
}

export function isActivePromotion(promotion, now = new Date()) {
  if (!promotion?.active && promotion?.activeNow !== true) return false;
  if (promotion.activeNow === false) return false;
  const startAt = promotion.startAt ? new Date(promotion.startAt) : null;
  const endAt = promotion.endAt ? new Date(promotion.endAt) : null;
  return !(
    (startAt && startAt > now) ||
    (endAt && endAt < now) ||
    !Number.isFinite(numeric(promotion.promoPrice, Number.NaN))
  );
}

export function printedPriceRows(
  product,
  includePromotions = true,
  now = new Date(),
) {
  const promotion = isActivePromotion(product?.promotion, now)
    ? product.promotion
    : null;
  const discount = promotion
    ? Math.max(
        0,
        numeric(promotion.originalPrice) - numeric(promotion.promoPrice),
      )
    : 0;
  const sizes = (product?.availableSizes || [])
    .filter((size) => size.active !== false)
    .slice()
    .sort((a, b) => numeric(a.sortOrder) - numeric(b.sortOrder));
  const sourceRows = sizes.length
    ? sizes.map((size) => ({ label: size.name, base: numeric(size.price) }))
    : [{ label: "", base: numeric(product?.price) }];

  return sourceRows.map((row) => {
    const promotional = includePromotions && promotion && discount > 0;
    const price = promotional
      ? Math.max(0, row.base - discount)
      : row.base;
    return {
      ...row,
      price,
      promotional: Boolean(promotional && price < row.base),
    };
  });
}

export function printableMenuProducts(products = []) {
  return products
    .filter(
      (product) =>
        product && product.available !== false && !product.deletedAt,
    )
    .slice()
    .sort(
      (a, b) =>
        numeric(a.sortOrder, 9999) - numeric(b.sortOrder, 9999) ||
        String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"),
    );
}

export function buildMenuSections(
  products = [],
  categories = [],
  subcategories = [],
) {
  const printable = printableMenuProducts(products);
  const categoryMap = new Map(categories.map((row) => [row.id, row]));
  const subcategoryMap = new Map(subcategories.map((row) => [row.id, row]));
  const categoryIds = [
    ...new Set(printable.map((product) => product.categoryId || "other")),
  ];
  const orderedCategoryIds = categoryIds.sort((left, right) => {
    const a = categoryMap.get(left);
    const b = categoryMap.get(right);
    return (
      numeric(a?.sortOrder, 9999) - numeric(b?.sortOrder, 9999) ||
      String(a?.name || "Outros").localeCompare(
        String(b?.name || "Outros"),
        "pt-BR",
      )
    );
  });

  return orderedCategoryIds.map((categoryId) => {
    const categoryProducts = printable.filter(
      (product) => (product.categoryId || "other") === categoryId,
    );
    const subcategoryIds = [
      ...new Set(
        categoryProducts.map((product) => product.subcategoryId || "other"),
      ),
    ].sort((left, right) => {
      const a = subcategoryMap.get(left);
      const b = subcategoryMap.get(right);
      return (
        numeric(a?.sortOrder, 9999) - numeric(b?.sortOrder, 9999) ||
        String(a?.name || "Outros").localeCompare(
          String(b?.name || "Outros"),
          "pt-BR",
        )
      );
    });
    return {
      id: categoryId,
      name: categoryMap.get(categoryId)?.name || "Outros",
      groups: subcategoryIds.map((subcategoryId) => ({
        id: subcategoryId,
        name: subcategoryMap.get(subcategoryId)?.name || "Outros",
        products: categoryProducts.filter(
          (product) =>
            (product.subcategoryId || "other") === subcategoryId,
        ),
      })),
    };
  });
}

async function imageData(url, width, height) {
  if (!url || typeof document === "undefined") return null;
  const key = `${url}|${width}x${height}`;
  if (imageCache.has(key)) return imageCache.get(key);
  const pending = (async () => {
    const response = await fetch(url, { credentials: "same-origin" });
    if (!response.ok) throw new Error("Imagem indisponível.");
    const blob = await response.blob();
    if (!blob.type.startsWith("image/") || blob.size > 8 * 1024 * 1024)
      throw new Error("Imagem inválida ou grande demais.");
    const objectUrl = URL.createObjectURL(blob);
    try {
      const image = await new Promise((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = reject;
        element.src = objectUrl;
      });
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      const scale = Math.max(width / image.width, height / image.height);
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;
      context.drawImage(
        image,
        (width - drawWidth) / 2,
        (height - drawHeight) / 2,
        drawWidth,
        drawHeight,
      );
      return canvas.toDataURL("image/jpeg", 0.84);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  })().catch(() => null);
  imageCache.set(key, pending);
  return pending;
}

async function concurrentMap(rows, limit, worker) {
  const result = new Array(rows.length);
  let cursor = 0;
  async function run() {
    while (cursor < rows.length) {
      const index = cursor++;
      result[index] = await worker(rows[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, rows.length) }, () => run()),
  );
  return result;
}

function addBrandHeader(doc, settings, logoData) {
  doc.setFillColor(...BRAND_RED);
  doc.rect(0, 0, PAGE_WIDTH, 7, "F");
  if (logoData) doc.addImage(logoData, "JPEG", PAGE_MARGIN, 12, 34, 15);
  else {
    doc.setFillColor(...BRAND_RED);
    doc.roundedRect(PAGE_MARGIN, 12, 34, 15, 3, 3, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("MENU", PAGE_MARGIN + 17, 21.5, { align: "center" });
  }
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(cleanLine(settings.storeName) || "Cardápio", 53, 19);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.setFontSize(8.5);
  doc.text("Cardápio para impressão", 53, 25);
  doc.setDrawColor(225, 228, 232);
  doc.line(PAGE_MARGIN, 32, PAGE_WIDTH - PAGE_MARGIN, 32);
}

function addPageFooters(doc, settings, menuUrl) {
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(229, 231, 235);
    doc.line(PAGE_MARGIN, 285, PAGE_WIDTH - PAGE_MARGIN, 285);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(cleanLine(settings.storeName) || "Cardápio", PAGE_MARGIN, 290);
    doc.text(`Página ${page} de ${pages}`, PAGE_WIDTH / 2, 290, {
      align: "center",
    });
    doc.text(
      doc.splitTextToSize(menuUrl, 62)[0] || "",
      PAGE_WIDTH - PAGE_MARGIN,
      290,
      { align: "right" },
    );
  }
}

function drawProductImageFallback(doc, product, x, y, size) {
  doc.setFillColor(241, 242, 244);
  doc.roundedRect(x, y, size, size, 2.5, 2.5, "F");
  doc.setTextColor(...BRAND_RED);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(cleanLine(product.name).slice(0, 1).toUpperCase() || "M", x + size / 2, y + size / 2 + 2, {
    align: "center",
  });
}

export async function createMenuPdf({
  products = [],
  categories = [],
  subcategories = [],
  settings = {},
  menuUrl,
  includePromotions = true,
  download = true,
}) {
  const normalizedUrl = normalizeMenuUrl(menuUrl);
  if (!normalizedUrl) throw new Error("Informe um link HTTP ou HTTPS válido.");
  const printable = printableMenuProducts(products);
  if (!printable.length)
    throw new Error("Não há produtos ativos para incluir no cardápio.");
  const [{ jsPDF }, { default: QRCode }] = await Promise.all([
    import("jspdf"),
    import("qrcode"),
  ]);
  const sections = buildMenuSections(printable, categories, subcategories);
  const [logoData, qrData, productImages] = await Promise.all([
    imageData(settings.logoImage, 680, 300),
    QRCode.toDataURL(normalizedUrl, {
      errorCorrectionLevel: "H",
      margin: 1,
      width: 800,
      color: { dark: "#17191d", light: "#ffffff" },
    }),
    concurrentMap(printable, 4, (product) => imageData(product.image, 420, 420)),
  ]);
  const imageById = new Map(
    printable.map((product, index) => [product.id, productImages[index]]),
  );
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  doc.setProperties({
    title: `Cardápio - ${cleanLine(settings.storeName) || "Restaurante"}`,
    subject: "Cardápio de produtos e preços",
    author: cleanLine(settings.storeName) || "Restaurante",
    creator: "Master Pizza",
  });
  addBrandHeader(doc, settings, logoData);
  let y = 39;
  const addPage = () => {
    doc.addPage();
    addBrandHeader(doc, settings, logoData);
    y = 39;
  };
  const ensureSpace = (height) => {
    if (y + height > CONTENT_BOTTOM) addPage();
  };

  for (const section of sections) {
    ensureSpace(62);
    doc.setFillColor(...BRAND_RED);
    doc.roundedRect(PAGE_MARGIN, y, PAGE_WIDTH - PAGE_MARGIN * 2, 11, 2, 2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(cleanLine(section.name), PAGE_MARGIN + 5, y + 7.2);
    y += 15;

    for (const group of section.groups) {
      const showGroup =
        section.groups.length > 1 || group.name.toLowerCase() !== "outros";
      if (showGroup) {
        ensureSpace(46);
        doc.setTextColor(...INK);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text(cleanLine(group.name), PAGE_MARGIN + 1, y + 5);
        doc.setDrawColor(221, 224, 228);
        doc.line(PAGE_MARGIN + 1, y + 7, PAGE_WIDTH - PAGE_MARGIN, y + 7);
        y += 10;
      }

      for (const product of group.products) {
        const nameLines = doc
          .splitTextToSize(cleanLine(product.name), 100)
          .slice(0, 2);
        const nameExtraHeight = Math.max(0, nameLines.length - 1) * 4;
        const description = cleanLine(product.description);
        const descriptionLines = description
          ? doc.splitTextToSize(description, 104).slice(0, 3)
          : [];
        const rows = printedPriceRows(product, includePromotions);
        const priceText = rows.map((row) => {
          const label = row.label ? `${cleanLine(row.label)}: ` : "";
          return row.promotional
            ? `${label}${formatPrice(row.base)}  |  ${formatPrice(row.price)}`
            : `${label}${formatPrice(row.price)}`;
        });
        const priceLines = doc
          .splitTextToSize(priceText.join("   "), 49)
          .slice(0, 4);
        const cardHeight = Math.max(
          32,
          14 +
            nameExtraHeight +
            descriptionLines.length * 3.8 +
            Math.max(1, priceLines.length) * 3.8,
        );
        ensureSpace(cardHeight + 4);
        doc.setFillColor(249, 249, 248);
        doc.setDrawColor(230, 231, 233);
        doc.roundedRect(
          PAGE_MARGIN,
          y,
          PAGE_WIDTH - PAGE_MARGIN * 2,
          cardHeight,
          3,
          3,
          "FD",
        );
        const image = imageById.get(product.id);
        if (image)
          doc.addImage(image, "JPEG", PAGE_MARGIN + 3, y + 3, 26, 26, undefined, "FAST");
        else drawProductImageFallback(doc, product, PAGE_MARGIN + 3, y + 3, 26);
        const textX = PAGE_MARGIN + 33;
        doc.setTextColor(...INK);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10.5);
        doc.text(nameLines, textX, y + 7);
        if (product.badge) {
          doc.setFontSize(6.8);
          doc.setTextColor(...BRAND_RED);
          doc.text(
            cleanLine(product.badge).toUpperCase(),
            textX,
            y + 11.5 + nameExtraHeight,
          );
        }
        doc.setTextColor(...MUTED);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.4);
        if (descriptionLines.length)
          doc.text(
            descriptionLines,
            textX,
            y + (product.badge ? 16 : 13) + nameExtraHeight,
          );
        const priceX = PAGE_WIDTH - PAGE_MARGIN - 4;
        doc.setTextColor(...INK);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.text(priceLines, priceX, y + 8, { align: "right" });
        if (priceText.some((line) => line.includes("|"))) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(6.5);
          doc.setTextColor(...BRAND_RED);
          doc.text("valor base  |  valor promocional", priceX, y + cardHeight - 4, {
            align: "right",
          });
        }
        y += cardHeight + 4;
      }
    }
  }

  ensureSpace(48);
  doc.setFillColor(245, 247, 249);
  doc.setDrawColor(220, 224, 229);
  doc.roundedRect(PAGE_MARGIN, y, PAGE_WIDTH - PAGE_MARGIN * 2, 43, 4, 4, "FD");
  doc.addImage(qrData, "PNG", PAGE_MARGIN + 5, y + 4, 35, 35, undefined, "FAST");
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Veja o cardápio no celular", PAGE_MARGIN + 47, y + 13);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.setFontSize(8.5);
  doc.text("Aponte a câmera para o QR Code e acesse o menu atualizado.", PAGE_MARGIN + 47, y + 20);
  doc.setTextColor(...BRAND_RED);
  doc.setFontSize(7.5);
  doc.text(doc.splitTextToSize(normalizedUrl, 122), PAGE_MARGIN + 47, y + 27);
  addPageFooters(doc, settings, normalizedUrl);
  const fileName = `${fileSlug(settings.storeName)}-cardapio.pdf`;
  if (download) doc.save(fileName);
  return { doc, fileName, pageCount: doc.getNumberOfPages() };
}

export async function createQrCodePdf({
  settings = {},
  menuUrl,
  download = true,
}) {
  const normalizedUrl = normalizeMenuUrl(menuUrl);
  if (!normalizedUrl) throw new Error("Informe um link HTTP ou HTTPS válido.");
  const [{ jsPDF }, { default: QRCode }] = await Promise.all([
    import("jspdf"),
    import("qrcode"),
  ]);
  const [logoData, qrData] = await Promise.all([
    imageData(settings.logoImage, 680, 300),
    QRCode.toDataURL(normalizedUrl, {
      errorCorrectionLevel: "H",
      margin: 1,
      width: 1200,
      color: { dark: "#17191d", light: "#ffffff" },
    }),
  ]);
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  doc.setProperties({
    title: `QR Code do cardápio - ${cleanLine(settings.storeName) || "Restaurante"}`,
    subject: "Acesso ao cardápio digital",
    author: cleanLine(settings.storeName) || "Restaurante",
    creator: "Master Pizza",
  });
  doc.setFillColor(...BRAND_RED);
  doc.rect(0, 0, PAGE_WIDTH, 16, "F");
  if (logoData) doc.addImage(logoData, "JPEG", 73, 27, 64, 28);
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(23);
  doc.text(cleanLine(settings.storeName) || "Nosso cardápio", PAGE_WIDTH / 2, 70, {
    align: "center",
  });
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  doc.text("Aponte a câmera do celular", PAGE_WIDTH / 2, 82, {
    align: "center",
  });
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(220, 223, 227);
  doc.roundedRect(48, 92, 114, 114, 6, 6, "FD");
  doc.addImage(qrData, "PNG", 55, 99, 100, 100, undefined, "FAST");
  doc.setTextColor(...BRAND_RED);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("ACESSE O CARDÁPIO", PAGE_WIDTH / 2, 224, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.setFontSize(8.5);
  doc.text(doc.splitTextToSize(normalizedUrl, 150), PAGE_WIDTH / 2, 237, {
    align: "center",
  });
  doc.setFillColor(...BRAND_RED);
  doc.roundedRect(52, 258, 106, 13, 3, 3, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text("Cardápio sempre atualizado no seu celular", PAGE_WIDTH / 2, 266.5, {
    align: "center",
  });
  const fileName = `${fileSlug(settings.storeName)}-qr-code-cardapio.pdf`;
  if (download) doc.save(fileName);
  return { doc, fileName, pageCount: 1 };
}
