export function readStoredJson(storage, key, fallback, validate = () => true) {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return validate(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function writeStoredJson(storage, key, value) {
  try {
    storage?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function readStoredStringArray(storage, key, limit = 20) {
  return readStoredJson(storage, key, [], Array.isArray)
    .filter((value) => typeof value === "string" && value.trim())
    .slice(0, limit);
}
