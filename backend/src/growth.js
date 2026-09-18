const money = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

export function rewardsMode(settings = {}) {
  const explicit = String(settings.rewardsMode || "").toUpperCase();
  if (["DISABLED", "POINTS", "CASHBACK"].includes(explicit)) return explicit;
  if (settings.cashbackEnabled) return "CASHBACK";
  if (settings.loyaltyEnabled) return "POINTS";
  return "DISABLED";
}

export function calculateRewardEarning(total, settings = {}) {
  const eligible = Math.max(0, Number(total || 0));
  const mode = rewardsMode(settings);
  if (mode === "POINTS") {
    const rate = Math.max(0, Number(settings.loyaltyPointsPerReal || 0));
    return { mode, points: Math.floor(eligible * rate), amount: 0 };
  }
  if (mode === "CASHBACK") {
    const percent = Math.max(0, Math.min(100, Number(settings.cashbackPercent || 0)));
    return { mode, points: 0, amount: money((eligible * percent) / 100) };
  }
  return { mode: "DISABLED", points: 0, amount: 0 };
}

export function calculateRewardRedemption({
  subtotal,
  points = 0,
  cashback = 0,
  settings = {},
}) {
  const limit = Math.max(0, Number(subtotal || 0));
  const mode = rewardsMode(settings);
  if (mode === "POINTS") {
    const threshold = Math.max(1, Math.trunc(Number(settings.loyaltyRewardPoints || 0)));
    const reward = Math.max(0, Number(settings.loyaltyRewardValue || 0));
    const blocks = Math.min(
      Math.floor(Math.max(0, Number(points || 0)) / threshold),
      reward > 0 ? Math.floor(limit / reward) : 0,
    );
    const amount = money(Math.min(limit, blocks * reward));
    return { mode, amount, pointsUsed: blocks * threshold };
  }
  if (mode === "CASHBACK") {
    return {
      mode,
      amount: money(Math.min(limit, Math.max(0, Number(cashback || 0)))),
      pointsUsed: 0,
    };
  }
  return { mode: "DISABLED", amount: 0, pointsUsed: 0 };
}

export function calculateReferralReward(value, settings = {}) {
  const reward = Math.max(0, Number(value || 0));
  const mode = rewardsMode(settings);
  if (mode === "POINTS")
    return { mode, points: Math.floor(reward), amount: 0 };
  if (mode === "CASHBACK")
    return { mode, points: 0, amount: money(reward) };
  return { mode: "DISABLED", points: 0, amount: 0 };
}

function anniversaryForYear(birthday, year) {
  const date = new Date(birthday);
  if (Number.isNaN(date.getTime())) return null;
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)));
}

export function birthdayBenefitState(user, settings = {}, now = new Date()) {
  if (!settings.birthdayCampaignEnabled || !user?.birthday)
    return { eligible: false, year: null, expiresAt: null };
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const validityDays = Math.max(1, Math.min(31, Number(settings.birthdayValidityDays || 7)));
  for (const year of [today.getUTCFullYear(), today.getUTCFullYear() - 1]) {
    const startsAt = anniversaryForYear(user.birthday, year);
    if (!startsAt) continue;
    const expiresAt = new Date(startsAt.getTime() + validityDays * 86400000);
    if (today >= startsAt && today < expiresAt) {
      return {
        eligible: Number(user.birthdayBenefitYear || 0) !== year,
        year,
        startsAt,
        expiresAt,
      };
    }
  }
  return { eligible: false, year: today.getUTCFullYear(), expiresAt: null };
}

export function calculateBirthdayDiscount(subtotal, settings = {}) {
  const eligible = Math.max(0, Number(subtotal || 0));
  if (eligible < Math.max(0, Number(settings.birthdayMinimumOrder || 0))) return 0;
  const value = Math.max(0, Number(settings.birthdayDiscountValue || 0));
  const discount =
    settings.birthdayDiscountType === "FIXED" ? value : (eligible * Math.min(100, value)) / 100;
  return money(Math.min(eligible, discount));
}

export function campaignIsActive(campaign, now = new Date()) {
  if (!campaign?.active) return false;
  if (campaign.startsAt && new Date(campaign.startsAt) > now) return false;
  if (campaign.endsAt && new Date(campaign.endsAt) < now) return false;
  return true;
}

export function productIsNew(product, settings = {}, now = new Date()) {
  if (!settings.newProductsEnabled) return false;
  if (product?.isNew) return true;
  const created = new Date(product?.createdAt || 0);
  if (Number.isNaN(created.getTime())) return false;
  const days = Math.max(1, Math.min(365, Number(settings.newProductDays || 30)));
  return now.getTime() - created.getTime() <= days * 86400000;
}

export function publicReviewSummary(rows = []) {
  if (!rows.length) return { average: 0, count: 0 };
  const total = rows.reduce((sum, row) => sum + Number(row.rating || 0), 0);
  return { average: Math.round((total / rows.length) * 10) / 10, count: rows.length };
}
