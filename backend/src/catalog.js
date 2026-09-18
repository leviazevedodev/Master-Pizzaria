export function parseClock(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function zonedDateKey(date, timeZone = "America/Maceio") {
  const instant = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(instant.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function startOfZonedDay(
  date = new Date(),
  timeZone = "America/Maceio",
) {
  const dateKey = zonedDateKey(date, timeZone);
  return startOfZonedDateKey(dateKey, timeZone);
}

export function startOfZonedDateKey(
  dateKey,
  timeZone = "America/Maceio",
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ""))) return null;
  if (!dateKey) return null;
  const [year, month, day] = dateKey.split("-").map(Number);
  const verified = new Date(Date.UTC(year, month - 1, day));
  if (
    verified.getUTCFullYear() !== year ||
    verified.getUTCMonth() !== month - 1 ||
    verified.getUTCDate() !== day
  )
    return null;
  const targetWallTime = Date.UTC(year, month - 1, day);
  let candidate = targetWallTime;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      hourCycle: "h23",
    }).formatToParts(new Date(candidate));
    const get = (type) =>
      Number(parts.find((part) => part.type === type)?.value);
    const observedWallTime = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour") % 24,
      get("minute"),
      get("second"),
    );
    const correction = observedWallTime - targetWallTime;
    if (!correction) break;
    candidate -= correction;
  }
  return new Date(candidate);
}

function zonedDayAndMinute(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(date);
  const weekdays = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    day: weekdays[parts.find((part) => part.type === "weekday")?.value],
    minute:
      Number(parts.find((part) => part.type === "hour")?.value) * 60 +
      Number(parts.find((part) => part.type === "minute")?.value),
  };
}

export function isProductAvailableAt(
  product,
  target = new Date(),
  timeZone = "America/Maceio",
) {
  if (!product || product.available === false || product.deletedAt)
    return false;
  const instant = target instanceof Date ? target : new Date(target);
  if (Number.isNaN(instant.getTime())) return false;
  if (product.pausedUntil && new Date(product.pausedUntil) > instant)
    return false;

  const start = product.availableStartTime
    ? parseClock(product.availableStartTime)
    : null;
  const end = product.availableEndTime
    ? parseClock(product.availableEndTime)
    : null;
  const { day, minute } = zonedDayAndMinute(instant, timeZone);
  if (!Number.isInteger(day) || !Number.isFinite(minute)) return false;

  let scheduleDay = day;
  let insideWindow = true;
  if (start != null && end != null) {
    if (start <= end) insideWindow = minute >= start && minute <= end;
    else {
      insideWindow = minute >= start || minute <= end;
      if (insideWindow && minute <= end) scheduleDay = (day + 6) % 7;
    }
  } else if (start != null) insideWindow = minute >= start;
  else if (end != null) insideWindow = minute <= end;
  if (!insideWindow) return false;

  if (Array.isArray(product.availableDays) && product.availableDays.length) {
    const availableDays = new Set(
      product.availableDays
        .map(Number)
        .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6),
    );
    if (availableDays.size && !availableDays.has(scheduleDay)) return false;
  }
  return true;
}
