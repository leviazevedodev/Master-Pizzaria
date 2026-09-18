function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível ler a imagem."));
    };
    img.src = url;
  });
}

export async function fitImageFile(
  file,
  {
    aspect = 1,
    maxWidth = 1200,
    maxHeight = 1200,
    padding = 0,
    fit = "cover",
  } = {},
) {
  if (!file) return null;
  if (file.size > 12 * 1024 * 1024)
    throw new Error("A imagem original deve ter no máximo 12 MB.");
  const img = await loadImage(file);
  const safeAspect = Number(aspect) > 0 ? Number(aspect) : 1;
  let width = Math.min(maxWidth, Math.max(640, img.naturalWidth || 1200));
  let height = Math.round(width / safeAspect);
  if (height > maxHeight) {
    height = maxHeight;
    width = Math.round(height * safeAspect);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  const pad = Math.round(
    Math.min(width, height) * Math.max(0, Math.min(0.12, padding)),
  );
  const availW = Math.max(1, width - pad * 2),
    availH = Math.max(1, height - pad * 2);
  const scales = [
    availW / (img.naturalWidth || 1),
    availH / (img.naturalHeight || 1),
  ];
  const scale = fit === "contain" ? Math.min(...scales) : Math.max(...scales);
  const drawW = Math.round((img.naturalWidth || 1) * scale),
    drawH = Math.round((img.naturalHeight || 1) * scale);
  const x = Math.round((width - drawW) / 2),
    y = Math.round((height - drawH) / 2);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, x, y, drawW, drawH);
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.86),
  );
  if (!blob) throw new Error("Não foi possível ajustar a imagem.");
  const base =
    (file.name || "imagem")
      .replace(/\.[^.]+$/g, "")
      .replace(/[^a-z0-9_-]+/gi, "-")
      .slice(0, 60) || "imagem";
  return new File([blob], `${base}-ajustada.webp`, { type: "image/webp" });
}
