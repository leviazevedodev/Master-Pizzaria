const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const PAGE_MARGIN = 12;
const HEADER_BOTTOM = 35;
const CONTENT_BOTTOM = 272;
const BRAND_RED = [227, 27, 35];
const GOLD = [232, 184, 87];
const NIGHT = [13, 15, 18];
const NIGHT_SOFT = [24, 27, 32];
const INK = [247, 244, 237];
const MUTED = [174, 180, 190];
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
    url.hash = "";
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
    const price = promotional ? Math.max(0, row.base - discount) : row.base;
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
      (product) => product && product.available !== false && !product.deletedAt,
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
  ].sort((left, right) => {
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

  return categoryIds.map((categoryId) => {
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
      const scale = Math.min(width / image.width, height / image.height);
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;
      context.drawImage(
        image,
        (width - drawWidth) / 2,
        (height - drawHeight) / 2,
        drawWidth,
        drawHeight,
      );
      return canvas.toDataURL("image/jpeg", 0.88);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  })().catch(() => null);
  imageCache.set(key, pending);
  return pending;
}

function paintPage(doc, settings, logoData, page) {
  doc.setFillColor(...NIGHT);
  doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, "F");
  doc.setFillColor(...BRAND_RED);
  doc.rect(0, 0, 5, PAGE_HEIGHT, "F");
  doc.setFillColor(7, 8, 10);
  doc.rect(5, 0, PAGE_WIDTH - 5, 31, "F");
  if (logoData) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(PAGE_MARGIN, 7, 32, 17, 2, 2, "F");
    doc.addImage(logoData, "JPEG", PAGE_MARGIN + 2, 9, 28, 13, undefined, "FAST");
  } else {
    doc.setFillColor(...BRAND_RED);
    doc.roundedRect(PAGE_MARGIN, 7, 32, 17, 2, 2, "F");
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("MENU", PAGE_MARGIN + 16, 17.6, { align: "center" });
  }
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text(cleanLine(settings.storeName) || "Cardápio", 49, 15);
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  const subtitle = page === 1 ? "SABORES DA CASA" : "CONTINUAÇÃO DO CARDÁPIO";
  doc.text(subtitle, 49, 21.5);
  doc.setTextColor(...GOLD);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text(`PÁGINA ${page} / 2`, PAGE_WIDTH - PAGE_MARGIN, 16, {
    align: "right",
  });
  doc.setDrawColor(57, 61, 68);
  doc.line(
    PAGE_MARGIN,
    HEADER_BOTTOM - 2,
    PAGE_WIDTH - PAGE_MARGIN,
    HEADER_BOTTOM - 2,
  );
}

function makeRows(doc, sections, includePromotions, columnWidth, descriptions) {
  const rows = [];
  const productTextWidth = columnWidth * 0.61;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.8);
  for (const section of sections) {
    rows.push({ type: "category", text: cleanLine(section.name), height: 9 });
    for (const group of section.groups) {
      const showGroup =
        section.groups.length > 1 || group.name.toLowerCase() !== "outros";
      if (showGroup)
        rows.push({ type: "group", text: cleanLine(group.name), height: 6 });
      for (const product of group.products) {
        const nameLines = doc
          .splitTextToSize(cleanLine(product.name), productTextWidth)
          .slice(0, 2);
        const descriptionLines =
          descriptions && cleanLine(product.description)
            ? doc
                .splitTextToSize(cleanLine(product.description), productTextWidth)
                .slice(0, 2)
            : [];
        const prices = printedPriceRows(product, includePromotions);
        const textHeight =
          nameLines.length * 3.5 + descriptionLines.length * 2.8;
        const priceHeight = Math.max(1, prices.length) * 3.15;
        rows.push({
          type: "product",
          product,
          nameLines,
          descriptionLines,
          prices,
          category: cleanLine(section.name),
          group: showGroup ? cleanLine(group.name) : "",
          height: Math.max(8.2, 3.2 + textHeight, 3.2 + priceHeight),
        });
      }
    }
  }
  return rows;
}

function minimumPartitionCapacity(rows, partitions) {
  const weights = rows.map((row) => row.height);
  let low = Math.max(...weights);
  let high = weights.reduce((sum, value) => sum + value, 0);
  const needed = (capacity) => {
    let count = 1;
    let used = 0;
    for (const weight of weights) {
      if (used && used + weight > capacity) {
        count += 1;
        used = 0;
      }
      used += weight;
    }
    return count;
  };
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const middle = (low + high) / 2;
    if (needed(middle) <= partitions) high = middle;
    else low = middle;
  }
  return high;
}

function partitionRows(rows, partitions, capacity) {
  const columns = Array.from({ length: partitions }, () => []);
  let column = 0;
  let used = 0;
  rows.forEach((row, index) => {
    const remainingRows = rows.length - index;
    const remainingColumns = partitions - column;
    const mustLeaveOnePerColumn = remainingRows === remainingColumns;
    if (
      column < partitions - 1 &&
      used > 0 &&
      (used + row.height > capacity || mustLeaveOnePerColumn)
    ) {
      column += 1;
      used = 0;
    }
    columns[column].push(row);
    used += row.height;
  });
  return columns;
}

function drawMenuColumn(doc, rows, x, width, scale) {
  let y = HEADER_BOTTOM;
  const pad = 2.4 * scale;
  const firstProduct = rows.find((row) => row.type === "product");
  if (rows[0]?.type === "product" && firstProduct) {
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.6 * scale);
    doc.text(
      [firstProduct.category, firstProduct.group]
        .filter(Boolean)
        .join("  •  ")
        .toUpperCase(),
      x,
      y + 2.5 * scale,
    );
    y += 4.2 * scale;
  }
  for (const row of rows) {
    const height = row.height * scale;
    if (row.type === "category") {
      doc.setFillColor(...BRAND_RED);
      doc.roundedRect(
        x,
        y + 0.8 * scale,
        width,
        6.8 * scale,
        1.5,
        1.5,
        "F",
      );
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.4 * scale);
      doc.text(row.text.toUpperCase(), x + 2.7 * scale, y + 5.35 * scale);
    } else if (row.type === "group") {
      doc.setTextColor(...GOLD);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7 * scale);
      doc.text(row.text.toUpperCase(), x + 1.2 * scale, y + 3.5 * scale);
      doc.setDrawColor(71, 66, 51);
      doc.line(
        x + 1.2 * scale,
        y + 4.8 * scale,
        x + width,
        y + 4.8 * scale,
      );
    } else {
      const priceWidth = width * 0.35;
      const textX = x + pad;
      const priceX = x + width - pad;
      doc.setFillColor(...NIGHT_SOFT);
      doc.roundedRect(
        x,
        y + 0.35 * scale,
        width,
        height - 0.7 * scale,
        1.5,
        1.5,
        "F",
      );
      doc.setTextColor(...INK);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.8 * scale);
      doc.text(row.nameLines, textX, y + 3.35 * scale);
      if (row.product.badge) {
        doc.setTextColor(...BRAND_RED);
        doc.setFontSize(5.1 * scale);
        doc.text(
          cleanLine(row.product.badge).toUpperCase(),
          textX,
          y + (3.35 + row.nameLines.length * 3.25) * scale,
        );
      }
      if (row.descriptionLines.length) {
        doc.setTextColor(...MUTED);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(5.2 * scale);
        const descriptionY =
          y +
          (3.35 +
            row.nameLines.length * 3.2 +
            (row.product.badge ? 2.1 : 0)) *
            scale;
        doc.text(row.descriptionLines, textX, descriptionY);
      }
      row.prices.forEach((price, priceIndex) => {
        const lineY = y + (3.25 + priceIndex * 3.05) * scale;
        const label = price.label ? `${cleanLine(price.label)}  ` : "";
        doc.setFont("helvetica", "normal");
        doc.setFontSize(5.3 * scale);
        doc.setTextColor(...MUTED);
        if (label)
          doc.text(label, priceX - priceWidth + 1, lineY, { align: "left" });
        if (price.promotional) {
          doc.setFontSize(4.7 * scale);
          doc.text(formatPrice(price.base), priceX - 16 * scale, lineY, {
            align: "right",
          });
          doc.setDrawColor(...MUTED);
          doc.line(
            priceX - 29 * scale,
            lineY - 1.1 * scale,
            priceX - 16 * scale,
            lineY - 1.1 * scale,
          );
          doc.setTextColor(...GOLD);
        } else doc.setTextColor(...INK);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(5.9 * scale);
        doc.text(formatPrice(price.price), priceX, lineY, { align: "right" });
      });
    }
    y += height;
  }
}

function drawFooter(doc, settings, menuUrl, qrData, page) {
  doc.setFillColor(8, 9, 11);
  doc.rect(
    5,
    CONTENT_BOTTOM + 3,
    PAGE_WIDTH - 5,
    PAGE_HEIGHT - CONTENT_BOTTOM - 3,
    "F",
  );
  doc.addImage(
    qrData,
    "PNG",
    PAGE_MARGIN,
    CONTENT_BOTTOM + 5,
    16,
    16,
    undefined,
    "FAST",
  );
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.2);
  doc.text("CARDÁPIO DIGITAL", PAGE_MARGIN + 20, CONTENT_BOTTOM + 10);
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.6);
  doc.text(
    "Aponte a câmera para ver o menu sempre atualizado.",
    PAGE_MARGIN + 20,
    CONTENT_BOTTOM + 14,
  );
  const contact = [cleanLine(settings.phone), cleanLine(settings.address)]
    .filter(Boolean)
    .join("  •  ");
  if (contact)
    doc.text(
      doc.splitTextToSize(contact, 92).slice(0, 2),
      PAGE_WIDTH - PAGE_MARGIN,
      CONTENT_BOTTOM + 9,
      { align: "right" },
    );
  doc.setTextColor(...GOLD);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.2);
  doc.text(`PÁGINA ${page} DE 2`, PAGE_WIDTH - PAGE_MARGIN, CONTENT_BOTTOM + 19, {
    align: "right",
  });
  doc.setTextColor(120, 126, 136);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(4.8);
  doc.text(
    doc.splitTextToSize(menuUrl, 105)[0] || "",
    PAGE_MARGIN + 20,
    CONTENT_BOTTOM + 19,
  );
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
  if (!normalizedUrl) throw new Error("O endereço público do cardápio é inválido.");
  const printable = printableMenuProducts(products);
  if (!printable.length)
    throw new Error("Não há produtos ativos para incluir no cardápio.");
  const [{ jsPDF }, { default: QRCode }] = await Promise.all([
    import("jspdf"),
    import("qrcode"),
  ]);
  const sections = buildMenuSections(printable, categories, subcategories);
  const [logoData, qrData] = await Promise.all([
    imageData(settings.logoImage, 700, 320),
    QRCode.toDataURL(normalizedUrl, {
      errorCorrectionLevel: "H",
      margin: 1,
      width: 800,
      color: { dark: "#0d0f12", light: "#ffffff" },
    }),
  ]);
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  doc.setProperties({
    title: `Cardápio - ${cleanLine(settings.storeName) || "Restaurante"}`,
    subject: "Cardápio de produtos e preços",
    author: cleanLine(settings.storeName) || "Restaurante",
    creator: "Master Pizza",
  });

  const columnsPerPage =
    printable.length > 70 ? 3 : printable.length > 34 ? 2 : 1;
  const columnGap = columnsPerPage === 3 ? 4 : 6;
  const columnWidth =
    (PAGE_WIDTH - PAGE_MARGIN * 2 - columnGap * (columnsPerPage - 1)) /
    columnsPerPage;
  const slots = columnsPerPage * 2;
  let rows = makeRows(doc, sections, includePromotions, columnWidth, true);
  let capacity = minimumPartitionCapacity(rows, slots);
  const availableHeight = CONTENT_BOTTOM - HEADER_BOTTOM;
  if (availableHeight / capacity < 0.78) {
    rows = makeRows(doc, sections, includePromotions, columnWidth, false);
    capacity = minimumPartitionCapacity(rows, slots);
  }
  const scale = Math.min(1.35, availableHeight / capacity);
  const columns = partitionRows(rows, slots, capacity);

  doc.addPage("a4", "portrait");
  for (let page = 1; page <= 2; page += 1) {
    doc.setPage(page);
    paintPage(doc, settings, logoData, page);
    for (let index = 0; index < columnsPerPage; index += 1) {
      const slot = (page - 1) * columnsPerPage + index;
      const x = PAGE_MARGIN + index * (columnWidth + columnGap);
      drawMenuColumn(doc, columns[slot] || [], x, columnWidth, scale);
    }
    drawFooter(doc, settings, normalizedUrl, qrData, page);
  }

  const fileName = `${fileSlug(settings.storeName)}-cardapio.pdf`;
  if (download) doc.save(fileName);
  return { doc, fileName, pageCount: 2 };
}

export async function createQrCodePdf({
  settings = {},
  menuUrl,
  download = true,
}) {
  const normalizedUrl = normalizeMenuUrl(menuUrl);
  if (!normalizedUrl) throw new Error("O endereço público do cardápio é inválido.");
  const [{ jsPDF }, { default: QRCode }] = await Promise.all([
    import("jspdf"),
    import("qrcode"),
  ]);
  const [logoData, qrData] = await Promise.all([
    imageData(settings.logoImage, 700, 320),
    QRCode.toDataURL(normalizedUrl, {
      errorCorrectionLevel: "H",
      margin: 1,
      width: 1200,
      color: { dark: "#0d0f12", light: "#ffffff" },
    }),
  ]);
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  doc.setProperties({
    title: `QR Code do cardápio - ${cleanLine(settings.storeName) || "Restaurante"}`,
    subject: "Acesso direto ao cardápio digital",
    author: cleanLine(settings.storeName) || "Restaurante",
    creator: "Master Pizza",
  });
  doc.setFillColor(...NIGHT);
  doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, "F");
  doc.setFillColor(...BRAND_RED);
  doc.rect(0, 0, 7, PAGE_HEIGHT, "F");
  if (logoData) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(69, 23, 72, 31, 4, 4, "F");
    doc.addImage(logoData, "JPEG", 73, 27, 64, 23, undefined, "FAST");
  }
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(25);
  doc.text(
    cleanLine(settings.storeName) || "Nosso cardápio",
    PAGE_WIDTH / 2 + 3,
    74,
    { align: "center" },
  );
  doc.setTextColor(...GOLD);
  doc.setFontSize(10);
  doc.text("ESCOLHA. PEÇA. APROVEITE.", PAGE_WIDTH / 2 + 3, 84, {
    align: "center",
  });
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(48, 96, 120, 120, 7, 7, "F");
  doc.addImage(qrData, "PNG", 57, 105, 102, 102, undefined, "FAST");
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("APONTE A CÂMERA", PAGE_WIDTH / 2 + 3, 236, { align: "center" });
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    "Este QR Code abre somente o cardápio digital da loja.",
    PAGE_WIDTH / 2 + 3,
    246,
    { align: "center" },
  );
  doc.setTextColor(...BRAND_RED);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text(doc.splitTextToSize(normalizedUrl, 160), PAGE_WIDTH / 2 + 3, 258, {
    align: "center",
  });
  const fileName = `${fileSlug(settings.storeName)}-qr-code-cardapio.pdf`;
  if (download) doc.save(fileName);
  return { doc, fileName, pageCount: 1 };
}
