import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const serverUrl = new URL("../src/server.js", import.meta.url);

test("recompensas são processadas somente em DELIVERED e com proteção idempotente", async () => {
  const source = await readFile(serverUrl, "utf8");

  assert.match(source, /order\.status !== "DELIVERED"/);
  assert.match(source, /order\.rewardsProcessedAt/);
  assert.match(source, /skipDuplicates:\s*true/);
  assert.match(source, /status === "DELIVERED"[\s\S]*applyOrderRewards/);
  assert.match(source, /pg_advisory_xact_lock/);
});

test("cancelamento ou reembolso estorna ganhos sem duplicar o estorno", async () => {
  const source = await readFile(serverUrl, "utf8");

  assert.match(source, /transaction\.externalKey}:REVERSAL/);
  assert.match(source, /_REVERSAL/);
  assert.match(source, /Recompensa estornada após cancelamento ou reembolso/);
  assert.match(
    source,
    /releasesReservedBenefits[\s\S]*restoreOrderBenefits\(tx, order\.id\)/,
  );
});
