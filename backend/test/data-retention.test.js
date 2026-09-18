import test from "node:test";
import assert from "node:assert/strict";
import { retentionCutoffs } from "../src/data-retention.js";

test("retention cutoffs follow the configured business periods", () => {
  const now = new Date("2026-09-11T12:00:00.000Z");
  const cutoffs = retentionCutoffs(now);
  assert.equal(cutoffs.tableSessions.toISOString(), "2026-09-11T00:00:00.000Z");
  assert.equal(cutoffs.abandonedSessions.toISOString(), "2026-08-28T12:00:00.000Z");
  assert.equal(cutoffs.technicalLogs.toISOString(), "2026-09-04T12:00:00.000Z");
  assert.equal(cutoffs.personalData.toISOString(), "2026-03-11T12:00:00.000Z");
  assert.equal(cutoffs.financialData.toISOString(), "2021-09-11T12:00:00.000Z");
});
