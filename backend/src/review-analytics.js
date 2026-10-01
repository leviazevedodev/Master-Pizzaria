const WINDOWS = [null, 3, 6, 12];

function average(values) {
  return values.length
    ? Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 10) / 10
    : null;
}

export function buildReviewAnalytics(reviews, couriers, { now = new Date(), deliveredByOrder = new Map() } = {}) {
  const courierRows = new Map(couriers.map((courier) => [courier.id, {
    id: courier.id,
    name: courier.name,
    deliveriesRated: 0,
    reviewCount: 0,
    average: null,
    ratings: [],
  }]));
  const food = WINDOWS.map((hours) => ({ hours, count: 0, average: null, ratings: [] }));
  for (const review of reviews) {
    const order = review.order;
    if (!order) continue;
    const foodRating = Number(review.foodRating ?? review.rating);
    const readyAt = order.readyAt ? new Date(order.readyAt).getTime() : NaN;
    if (Number.isInteger(foodRating) && foodRating >= 1 && foodRating <= 5 && Number.isFinite(readyAt)) {
      for (const row of food) {
        if (row.hours == null || (readyAt <= now.getTime() && readyAt > now.getTime() - row.hours * 3_600_000))
          row.ratings.push(foodRating);
      }
    }
    const courierId = order.assignedCourierId || deliveredByOrder.get(order.id)?.changedByUserId;
    const deliveryRating = Number(review.deliveryRating);
    if (order.fulfillmentType === "DELIVERY" && courierRows.has(courierId) &&
        Number.isInteger(deliveryRating) && deliveryRating >= 1 && deliveryRating <= 5) {
      const row = courierRows.get(courierId);
      row.ratings.push(deliveryRating);
    }
  }
  return {
    food: food.map(({ ratings, ...row }) => ({ ...row, count: ratings.length, average: average(ratings) })),
    couriers: [...courierRows.values()].map(({ ratings, ...row }) => ({
      ...row, deliveriesRated: ratings.length, reviewCount: ratings.length, average: average(ratings),
    })),
  };
}
