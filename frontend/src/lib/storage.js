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

export function readExpiringStoredJson(
  storage,
  key,
  fallback,
  maxAgeMs,
  validate = () => true,
  now = Date.now(),
) {
  try {
    const updatedAt = Number(storage?.getItem(`${key}:updated-at`));
    if (
      Number.isFinite(updatedAt) &&
      updatedAt > 0 &&
      Number.isFinite(maxAgeMs) &&
      now - updatedAt >= maxAgeMs
    ) {
      storage?.removeItem(key);
      storage?.removeItem(`${key}:updated-at`);
      return fallback;
    }
    return readStoredJson(storage, key, fallback, validate);
  } catch {
    return fallback;
  }
}

export function writeExpiringStoredJson(storage, key, value, now = Date.now()) {
  if (!writeStoredJson(storage, key, value)) return false;
  try {
    storage?.setItem(`${key}:updated-at`, String(now));
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
