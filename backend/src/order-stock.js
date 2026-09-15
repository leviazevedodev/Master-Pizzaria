import { collectOrderStockNeeds } from "./combos.js";

// Mesma trava usada por preparo/cancelamento; cobre também webhooks simultâneos.
export async function lockOrderStock(tx, orderId) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${orderId}))`;
}

export async function applyOrderStock(tx, orderId) {
  await lockOrderStock(tx, orderId);
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          flavors: true,
          options: true,
        },
      },
    },
  });
  if (!order || order.stockApplied) return;
  const { products: productNeeds, flavors: flavorNeeds, options: optionNeeds } = collectOrderStockNeeds(order.items);
  const ingredientNeeds = new Map();
  const productIds = [...productNeeds.keys()];
  const products = await tx.product.findMany({
    where: { id: { in: productIds } },
    include: { recipeItems: { include: { inventoryItem: true } } },
  });
  const map = new Map(products.map((p) => [p.id, p]));
  for (const [productId, quantity] of productNeeds) {
    const product = map.get(productId);
    if (!product) continue;
    for (const recipe of product.recipeItems || []) {
      const need = Number(recipe.quantity || 0) * quantity;
      ingredientNeeds.set(
        recipe.inventoryItemId,
        (ingredientNeeds.get(recipe.inventoryItemId) || 0) + need,
      );
    }
  }
  const [ingredients, flavors, options] = await Promise.all([
    ingredientNeeds.size
      ? tx.inventoryItem.findMany({
          where: { id: { in: [...ingredientNeeds.keys()] } },
        })
      : [],
    flavorNeeds.size
      ? tx.flavor.findMany({ where: { id: { in: [...flavorNeeds.keys()] } } })
      : [],
    optionNeeds.size
      ? tx.modifierOption.findMany({
          where: { id: { in: [...optionNeeds.keys()] } },
        })
      : [],
  ]);
  const ingredientMap = new Map(ingredients.map((row) => [row.id, row]));
  const flavorMapById = new Map(flavors.map((row) => [row.id, row]));
  const optionMapById = new Map(options.map((row) => [row.id, row]));
  // Baixas atômicas evitam estoque negativo se dois pedidos forem aceitos ao mesmo tempo.
  for (const [productId, need] of productNeeds) {
    const product = map.get(productId);
    if (product?.stockTracked) {
      const changed = await tx.product.updateMany({
        where: { id: productId, stockQuantity: { gte: need } },
        data: { stockQuantity: { decrement: need } },
      });
      if (changed.count !== 1)
        throw Object.assign(
          new Error(`Estoque insuficiente de ${product.name}.`),
          { code: "OUT_OF_STOCK" },
        );
      await tx.inventoryMovement.create({
        data: {
          productId,
          orderId,
          type: "PRODUCT_SALE",
          quantity: -need,
          note: `Pedido ${order.id.slice(-8).toUpperCase()}`,
        },
      });
    }
  }
  for (const [flavorId, need] of flavorNeeds) {
    const flavor = flavorMapById.get(flavorId);
    if (flavor?.stockTracked) {
      const changed = await tx.flavor.updateMany({
        where: { id: flavorId, stockQuantity: { gte: need } },
        data: { stockQuantity: { decrement: need } },
      });
      if (changed.count !== 1)
        throw Object.assign(
          new Error(`Estoque insuficiente do sabor ${flavor.name}.`),
          { code: "OUT_OF_STOCK" },
        );
    }
  }
  for (const [optionId, need] of optionNeeds) {
    const option = optionMapById.get(optionId);
    if (option?.stockTracked) {
      const changed = await tx.modifierOption.updateMany({
        where: { id: optionId, stockQuantity: { gte: need } },
        data: { stockQuantity: { decrement: need } },
      });
      if (changed.count !== 1)
        throw Object.assign(
          new Error(`Estoque insuficiente do adicional ${option.name}.`),
          { code: "OUT_OF_STOCK" },
        );
    }
  }
  for (const [inventoryItemId, need] of [...ingredientNeeds].sort(([a], [b]) => a.localeCompare(b))) {
    const ingredient = ingredientMap.get(inventoryItemId);
    const changed = await tx.inventoryItem.updateMany({
      where: { id: inventoryItemId, quantity: { gte: need } },
      data: { quantity: { decrement: need } },
    });
    if (changed.count !== 1)
      throw Object.assign(
        new Error(
          `Estoque real insuficiente: ${ingredient?.name || "insumo"}.`,
        ),
        { code: "INGREDIENT_OUT_OF_STOCK" },
      );
    await tx.inventoryMovement.create({
      data: {
        inventoryItemId,
        orderId,
        type: "RECIPE_SALE",
        quantity: -need,
        note: `Consumo do pedido ${order.id.slice(-8).toUpperCase()}`,
      },
    });
  }
  await tx.order.update({
    where: { id: orderId },
    data: {
      stockApplied: true,
      stockSnapshot: {
        products: [...productNeeds].filter(([id]) => map.get(id)?.stockTracked),
        ingredients: [...ingredientNeeds],
        flavors: [...flavorNeeds].filter(([id]) => flavorMapById.get(id)?.stockTracked),
        options: [...optionNeeds].filter(([id]) => optionMapById.get(id)?.stockTracked),
      },
    },
  });
}

export async function restoreOrderStock(tx, orderId) {
  await lockOrderStock(tx, orderId);
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          flavors: true,
          options: true,
        },
      },
    },
  });
  if (!order?.stockApplied) return;
  // Restaura exatamente o que foi baixado, mesmo se composição, ficha técnica
  // ou controle de estoque mudarem depois da venda.
  if (order.stockSnapshot && typeof order.stockSnapshot === "object") {
    for (const [key, model, field] of [
      ["products", "product", "stockQuantity"],
      ["ingredients", "inventoryItem", "quantity"],
      ["flavors", "flavor", "stockQuantity"],
      ["options", "modifierOption", "stockQuantity"],
    ]) {
      for (const [id, quantity] of order.stockSnapshot[key] || [])
        await tx[model].updateMany({ where: { id }, data: { [field]: { increment: quantity } } });
    }
    await tx.order.update({ where: { id: orderId }, data: { stockApplied: false } });
    return;
  }
  // Compatibilidade com pedidos anteriores ao registro das baixas.
  const { products: productNeeds, flavors: flavorNeeds, options: optionNeeds } = collectOrderStockNeeds(order.items);
  const ingredientNeeds = new Map();
  const products = await tx.product.findMany({
    where: { id: { in: [...productNeeds.keys()] } },
    include: { recipeItems: true },
  });
  const map = new Map(products.map((p) => [p.id, p]));
  for (const [productId, quantity] of productNeeds) {
    const p = map.get(productId);
    for (const r of p?.recipeItems || [])
      ingredientNeeds.set(
        r.inventoryItemId,
        (ingredientNeeds.get(r.inventoryItemId) || 0) +
          Number(r.quantity || 0) * quantity,
      );
  }
  for (const [productId, qty] of productNeeds) {
    const product = map.get(productId);
    if (product?.stockTracked)
      await tx.product.update({
        where: { id: productId },
        data: { stockQuantity: { increment: qty } },
      });
  }
  for (const [flavorId, qty] of flavorNeeds) {
    const flavor = await tx.flavor.findUnique({
      where: { id: flavorId },
      select: { stockTracked: true },
    });
    if (flavor?.stockTracked)
      await tx.flavor.update({
        where: { id: flavorId },
        data: { stockQuantity: { increment: qty } },
      });
  }
  for (const [optionId, qty] of optionNeeds) {
    const option = await tx.modifierOption.findUnique({
      where: { id: optionId },
      select: { stockTracked: true },
    });
    if (option?.stockTracked)
      await tx.modifierOption.update({
        where: { id: optionId },
        data: { stockQuantity: { increment: qty } },
      });
  }
  for (const [inventoryItemId, qty] of ingredientNeeds)
    await tx.inventoryItem.update({
      where: { id: inventoryItemId },
      data: { quantity: { increment: qty } },
    });
  await tx.order.update({
    where: { id: orderId },
    data: { stockApplied: false },
  });
}
