import test from "node:test";
import assert from "node:assert/strict";
import { settleWithConcurrency } from "../src/lib/async.js";

test("executa tarefas sem ultrapassar o limite e preserva a ordem", async () => {
  let active = 0;
  let peak = 0;
  const task = (value, reject = false) => async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    if (reject) throw new Error(value);
    return value;
  };
  const entries = [
    ["a", task("a")],
    ["b", task("b", true)],
    ["c", task("c")],
  ];

  const results = await settleWithConcurrency(entries, 2);

  assert.equal(peak, 2);
  assert.deepEqual(
    results.map((result) => result.status),
    ["fulfilled", "rejected", "fulfilled"],
  );
  assert.equal(results[0].value, "a");
  assert.equal(results[2].value, "c");
});
