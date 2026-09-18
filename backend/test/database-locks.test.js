import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("travas consultivas usam executeRaw porque PostgreSQL retorna void", async () => {
  const source = await readFile(new URL("../src/server.js", import.meta.url), "utf8");
  const advisoryCalls = source
    .split("\n")
    .filter((line) => line.includes("pg_advisory_xact_lock"));

  assert.ok(advisoryCalls.length > 0);
  assert.equal(
    advisoryCalls.some((line) => line.includes("$queryRaw")),
    false,
    "$queryRaw tenta desserializar o retorno void e causa o erro P2010",
  );
  assert.equal(
    advisoryCalls.every((line) => line.includes("$executeRaw")),
    true,
  );
});
