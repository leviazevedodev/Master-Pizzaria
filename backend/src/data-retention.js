const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const RETENTION_POLICY = Object.freeze({
  tableSessionsMs: 12 * HOUR_MS,
  abandonedSessionMs: 14 * DAY_MS,
  technicalLogsMs: 7 * DAY_MS,
  personalDataMonths: 6,
  financialDataYears: 5,
});

function subtractUtcCalendar(date, { years = 0, months = 0 } = {}) {
  const result = new Date(date);
  if (years) result.setUTCFullYear(result.getUTCFullYear() - years);
  if (months) result.setUTCMonth(result.getUTCMonth() - months);
  return result;
}

export function retentionCutoffs(now = new Date()) {
  const current = new Date(now);
  if (Number.isNaN(current.getTime())) throw new TypeError("Data inválida.");
  return {
    tableSessions: new Date(current.getTime() - RETENTION_POLICY.tableSessionsMs),
    abandonedSessions: new Date(
      current.getTime() - RETENTION_POLICY.abandonedSessionMs,
    ),
    technicalLogs: new Date(
      current.getTime() - RETENTION_POLICY.technicalLogsMs,
    ),
    personalData: subtractUtcCalendar(current, {
      months: RETENTION_POLICY.personalDataMonths,
    }),
    financialData: subtractUtcCalendar(current, {
      years: RETENTION_POLICY.financialDataYears,
    }),
  };
}
