import { spawnSync } from "node:child_process";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

try {
  loadEnvFile();
} catch {}

const args = process.argv.slice(2);
if (!args.length) {
  console.error("Uso: node scripts/prisma-direct.js <comando prisma...>");
  process.exit(2);
}

function buildDirectDatabaseUrl() {
  const configuredDirect = String(process.env.DIRECT_URL || "").trim();
  const runtimeUrl = String(process.env.DATABASE_URL || "").trim();

  if (!runtimeUrl && !configuredDirect) {
    throw new Error("DATABASE_URL não está configurada.");
  }

  const source = configuredDirect || runtimeUrl;
  let url;
  try {
    url = new URL(source);
  } catch {
    throw new Error("DATABASE_URL/DIRECT_URL possui formato inválido.");
  }

  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error(
      "DATABASE_URL/DIRECT_URL deve usar o protocolo PostgreSQL.",
    );
  }

  // Não tente adivinhar o endpoint direto do Neon: nomes de host podem mudar.
  // Uma URL incorreta aqui pode aplicar migrations no banco errado.
  if (!configuredDirect && url.hostname.includes("-pooler.")) {
    throw new Error(
      "DATABASE_URL usa o pooler do Neon. Defina DIRECT_URL com a URL direta exibida pelo Neon antes de executar migrations.",
    );
  } else if (configuredDirect) {
    console.log(
      `[prisma] Usando DIRECT_URL para operações de schema: ${url.hostname}`,
    );
  }

  // Ajuda quando o compute do Neon estava em idle e precisa acordar.
  if (!url.searchParams.has("connect_timeout")) {
    url.searchParams.set("connect_timeout", "30");
  }

  return url.toString();
}

const migrationUrl = buildDirectDatabaseUrl();
const env = {
  ...process.env,
  DATABASE_URL: migrationUrl,
};

const prismaCli =
  process.env.PRISMA_CLI_PATH ||
  fileURLToPath(
    new URL("../node_modules/prisma/build/index.js", import.meta.url),
  );
const maxAttempts = 3;

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    env,
    encoding: "utf8",
    shell: false,
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.error) {
    console.error(`[prisma] Falha ao executar Prisma: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status === 0) {
    process.exit(0);
  }

  const combined = `${result.stdout || ""}\n${result.stderr || ""}`;
  const advisoryLockTimeout =
    /P1002|advisory lock|Timed out trying to acquire/i.test(combined);

  if (!advisoryLockTimeout || attempt === maxAttempts) {
    process.exit(result.status ?? 1);
  }

  console.warn(
    `[prisma] Advisory lock ocupado. Tentativa ${attempt}/${maxAttempts}; aguardando 12s antes de tentar novamente...`,
  );
  const sleeper = spawnSync(
    process.execPath,
    ["-e", "setTimeout(()=>{},12000)"],
    { stdio: "ignore" },
  );
  if (sleeper.error) process.exit(result.status ?? 1);
}
