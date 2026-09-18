export const booleanValue = (value) =>
  typeof value === "boolean"
    ? value
    : value === 1 ||
      value === "1" ||
      String(value).trim().toLowerCase() === "true";

export const validSlug = (value) =>
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(value || ""));

export function boundedInteger(value, min = -100_000, max = 100_000) {
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : null;
}
