import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("migração adiciona opções da vitrine sem perder avaliações aprovadas", async () => {
  const [schema, migration] = await Promise.all([
    read("../prisma/schema.prisma"),
    read("../prisma/migrations/20260921000000_storefront_reviews_layout/migration.sql"),
  ]);

  assert.match(schema, /homeCatalogLayout\s+String\s+@default\("GRID"\)/);
  assert.match(schema, /deliveredOrdersCounterEnabled\s+Boolean\s+@default\(true\)/);
  assert.match(schema, /orderId\s+String\?\s+@unique/);
  assert.match(schema, /onDelete: SetNull/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "homeCatalogLayout"/);
  assert.match(migration, /ON DELETE SET NULL/);
});

test("retenção remove só avaliações não aprovadas após 30 dias", async () => {
  const [server, retention] = await Promise.all([
    read("../src/server.js"),
    read("../src/data-retention.js"),
  ]);

  assert.match(retention, /unapprovedReviewsMs: 30 \* DAY_MS/);
  assert.match(server, /status: "PENDING"[\s\S]*createdAt: \{ lt: cutoffs\.unapprovedReviews \}/);
  assert.match(server, /status: "HIDDEN"[\s\S]*hiddenAt: \{ lt: cutoffs\.unapprovedReviews \}/);
  assert.match(server, /app\.delete\("\/api\/admin\/reviews\/:id"/);
});
