import assert from "node:assert/strict";
import test from "node:test";
import { compactCount } from "../src/lib/format.js";

test("contador abrevia sem alterar o valor original", () => {
  const values = [950, 1200, 2345, 14230, 999999, 1200000, 14000000];
  assert.deepEqual(values.map(compactCount), ["950", "1,2k", "2,3k", "14k", "999k", "1,2M", "14M"]);
  assert.equal(values[1], 1200);
});
