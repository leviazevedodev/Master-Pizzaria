const DATABASE_AVAILABILITY_CODES = new Set([
  "P1001", // banco inacessivel
  "P1002", // conexao expirou
  "P1008", // operacao expirou
  "P1017", // servidor encerrou a conexao
  "P2024", // pool de conexoes esgotado
]);

export const isDatabaseSchemaError = (error) => ["P2021", "P2022"].includes(error?.code);

export function isDatabaseAvailabilityError(error) {
  if (DATABASE_AVAILABILITY_CODES.has(error?.code)) return true;
  return (
    error?.code === "P2028" &&
    /expired transaction|transaction already closed|timeout/i.test(
      String(error?.meta?.error || error?.message || ""),
    )
  );
}
