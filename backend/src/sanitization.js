export const cleanText = (value, max = 120) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

export function safeExternalUrl(value, max = 600) {
  const cleaned = cleanText(value, max);
  if (!cleaned) return "";
  try {
    const url = new URL(cleaned);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
}

export function safeMediaUrl(value) {
  const cleaned = cleanText(value, 600);
  if (!cleaned) return "";
  if (/^\/api\/media\/[A-Za-z0-9_-]{5,100}$/.test(cleaned)) return cleaned;
  if (
    /^\/images\/(?:products|modifiers)\/[A-Za-z0-9_-]+\.(?:webp|png|jpe?g)$/i.test(
      cleaned,
    )
  ) return cleaned;
  return safeExternalUrl(cleaned, 600);
}
