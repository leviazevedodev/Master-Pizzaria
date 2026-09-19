import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("migration preserva dados históricos e configura os dois combos", async () => {
  const sql = await source(
    "../prisma/migrations/20260919000000_requested_storefront_operations/migration.sql",
  );

  assert.match(sql, /^\s*--[\s\S]*?BEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "facebookName" TEXT/);
  assert.match(sql, /"birthdayCampaignEnabled" = false/);
  assert.match(sql, /"referralEnabled" = false/);
  assert.match(sql, /combo-master/);
  assert.match(sql, /combo-escolha-master/);
  assert.match(sql, /'CONFIGURABLE_PIZZA'/);
  assert.match(sql, /'FIXED_PRODUCT'/);
  assert.match(sql, /'PRODUCT_CHOICE'/);
  assert.doesNotMatch(sql, /DELETE FROM "ComboItem"|DROP TABLE|TRUNCATE/i);
});

test("avaliação é criada uma única vez e não aceita mais nota geral", async () => {
  const server = await source("../src/server.js");
  const route = server.slice(server.indexOf('app.post(\n  "/api/orders/:trackingCode/review"'));

  assert.match(route, /ORDER_ALREADY_REVIEWED/);
  assert.match(route, /prisma\.review\.create/);
  assert.match(route, /rating: foodRating/);
  assert.doesNotMatch(route, /prisma\.review\.upsert/);
  assert.doesNotMatch(route, /req\.body\?\.rating/);
});

test("benefícios retirados não continuam expostos nos fluxos públicos", async () => {
  const server = await source("../src/server.js");

  assert.doesNotMatch(server, /app\.patch\("\/api\/me\/birthday"/);
  assert.doesNotMatch(server, /ensureUserInviteCode/);
  assert.doesNotMatch(server, /calculateBirthdayDiscount/);
  assert.doesNotMatch(server, /calculateReferralReward/);
});
