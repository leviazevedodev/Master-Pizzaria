import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildReviewAnalytics } from "../src/review-analytics.js";

test("avaliações pendentes contam internamente, sem tratar pedidos sem nota como zero", () => {
  const now = new Date("2026-09-30T18:00:00Z");
  const reviews = [
    { status: "PENDING", foodRating: 5, deliveryRating: 4, createdAt: "2026-09-30T17:50:00Z", order: { id: "a", readyAt: "2026-09-30T13:30:00Z", fulfillmentType: "DELIVERY", assignedCourierId: "c1" } },
    { status: "APPROVED", foodRating: 3, deliveryRating: 5, order: { id: "b", readyAt: "2026-09-30T17:00:00Z", fulfillmentType: "DELIVERY", assignedCourierId: "c1" } },
    { status: "HIDDEN", foodRating: 4, deliveryRating: null, order: { id: "c", readyAt: "2026-09-30T16:00:00Z", fulfillmentType: "PICKUP", assignedCourierId: null } },
  ];
  const result = buildReviewAnalytics(reviews, [{ id: "c1", name: "João" }], { now });
  assert.deepEqual(result.food.map(({ hours, count, average }) => [hours, count, average]), [
    [null, 3, 4], [3, 2, 3.5], [6, 3, 4], [12, 3, 4],
  ]);
  assert.deepEqual(result.couriers[0], { id: "c1", name: "João", deliveriesRated: 2, reviewCount: 2, average: 4.5 });
});

test("média usa a hora do preparo, não a hora posterior da avaliação", () => {
  const now = new Date("2026-09-30T18:00:00Z");
  const result = buildReviewAnalytics([{
    foodRating: 5, deliveryRating: null, createdAt: "2026-09-30T17:59:00Z",
    order: { id: "old", readyAt: "2026-09-30T13:30:00Z", fulfillmentType: "PICKUP" },
  }], [], { now });
  assert.equal(result.food.find((row) => row.hours === 3).count, 0);
  assert.equal(result.food.find((row) => row.hours === 6).count, 1);
});

test("consultas da vitrine continuam exigindo aprovação para lista e média pública", async () => {
  const server = await readFile(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(server, /settings\.publicReviewsEnabled\s*\? prisma\.review\.findMany\(\{\s*where: \{ status: "APPROVED" \}/);
  assert.match(server, /settings\.publicReviewsEnabled\s*\? prisma\.review\.aggregate\(\{\s*where: \{ status: "APPROVED" \}/);
});
