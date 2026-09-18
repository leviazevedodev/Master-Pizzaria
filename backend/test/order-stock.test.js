import assert from "node:assert/strict";
import test from "node:test";
import { restoreOrderStock } from "../src/order-stock.js";

test("restauração usa o snapshot e não devolve estoque duas vezes", async () => {
  const increments = [];
  const order = {
    id: "order-1",
    stockApplied: true,
    stockSnapshot: {
      products: [["product-1", 2]],
      ingredients: [["ingredient-1", 3]],
      flavors: [["flavor-1", 1]],
      options: [["option-1", 4]],
    },
    items: [],
  };
  const updater = (model) => ({
    updateMany: async ({ where, data }) => {
      increments.push([model, where.id, Object.values(data)[0].increment]);
      return { count: 1 };
    },
  });
  const tx = {
    $executeRaw: async () => 0,
    order: {
      findUnique: async () => ({ ...order }),
      update: async ({ data }) => {
        Object.assign(order, data);
        return order;
      },
    },
    product: updater("product"),
    inventoryItem: updater("inventoryItem"),
    flavor: updater("flavor"),
    modifierOption: updater("modifierOption"),
  };

  await restoreOrderStock(tx, order.id);
  await restoreOrderStock(tx, order.id);

  assert.deepEqual(increments, [
    ["product", "product-1", 2],
    ["inventoryItem", "ingredient-1", 3],
    ["flavor", "flavor-1", 1],
    ["modifierOption", "option-1", 4],
  ]);
  assert.equal(order.stockApplied, false);
});
