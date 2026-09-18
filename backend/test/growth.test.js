import test from "node:test";
import assert from "node:assert/strict";
import {
  birthdayBenefitState,
  calculateBirthdayDiscount,
  calculateReferralReward,
  calculateRewardEarning,
  calculateRewardRedemption,
  campaignIsActive,
  productIsNew,
  publicReviewSummary,
} from "../src/growth.js";

test("pontos são calculados sobre o total entregue e resgatados em blocos", () => {
  const settings = {
    rewardsMode: "POINTS",
    loyaltyPointsPerReal: 2,
    loyaltyRewardPoints: 100,
    loyaltyRewardValue: 12.5,
  };
  assert.deepEqual(calculateRewardEarning(48.9, settings), {
    mode: "POINTS",
    points: 97,
    amount: 0,
  });
  assert.deepEqual(
    calculateRewardRedemption({ subtotal: 30, points: 250, settings }),
    { mode: "POINTS", amount: 25, pointsUsed: 200 },
  );
});

test("cashback respeita percentual, saldo e limite do subtotal", () => {
  const settings = { rewardsMode: "CASHBACK", cashbackPercent: 7.5 };
  assert.deepEqual(calculateRewardEarning(80, settings), {
    mode: "CASHBACK",
    points: 0,
    amount: 6,
  });
  assert.deepEqual(
    calculateRewardRedemption({ subtotal: 12, cashback: 19.99, settings }),
    { mode: "CASHBACK", amount: 12, pointsUsed: 0 },
  );
});

test("indicação acompanha o modo de recompensa configurado", () => {
  assert.deepEqual(
    calculateReferralReward(25.9, { rewardsMode: "POINTS" }),
    { mode: "POINTS", points: 25, amount: 0 },
  );
  assert.deepEqual(
    calculateReferralReward(7.5, { rewardsMode: "CASHBACK" }),
    { mode: "CASHBACK", points: 0, amount: 7.5 },
  );
  assert.deepEqual(
    calculateReferralReward(10, { rewardsMode: "DISABLED" }),
    { mode: "DISABLED", points: 0, amount: 0 },
  );
});

test("benefício de aniversário é anual, tem validade e respeita pedido mínimo", () => {
  const settings = {
    birthdayCampaignEnabled: true,
    birthdayValidityDays: 7,
    birthdayDiscountType: "PERCENT",
    birthdayDiscountValue: 15,
    birthdayMinimumOrder: 30,
  };
  const user = { birthday: "1995-09-15T12:00:00.000Z", birthdayBenefitYear: null };
  const available = birthdayBenefitState(user, settings, new Date("2026-09-18T18:00:00.000Z"));
  assert.equal(available.eligible, true);
  assert.equal(available.year, 2026);
  assert.equal(calculateBirthdayDiscount(100, settings), 15);
  assert.equal(calculateBirthdayDiscount(20, settings), 0);
  assert.equal(
    birthdayBenefitState(
      { ...user, birthdayBenefitYear: 2026 },
      settings,
      new Date("2026-09-18T18:00:00.000Z"),
    ).eligible,
    false,
  );
});

test("campanhas, novidades e resumo público usam apenas o período informado", () => {
  const now = new Date("2026-09-18T12:00:00.000Z");
  assert.equal(
    campaignIsActive(
      {
        active: true,
        startsAt: "2026-09-17T00:00:00.000Z",
        endsAt: "2026-09-19T00:00:00.000Z",
      },
      now,
    ),
    true,
  );
  assert.equal(
    productIsNew(
      { createdAt: "2026-09-10T00:00:00.000Z" },
      { newProductsEnabled: true, newProductDays: 10 },
      now,
    ),
    true,
  );
  assert.deepEqual(publicReviewSummary([{ rating: 5 }, { rating: 4 }, { rating: 3 }]), {
    average: 4,
    count: 3,
  });
});
