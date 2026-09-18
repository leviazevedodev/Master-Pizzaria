import test from "node:test";
import assert from "node:assert/strict";
import {
  booleanValue,
  boundedInteger,
  validSlug,
} from "../src/input-validation.js";

test("boolean values are normalized without truthy string surprises", () => {
  assert.equal(booleanValue(true), true);
  assert.equal(booleanValue(" true "), true);
  assert.equal(booleanValue(1), true);
  assert.equal(booleanValue("false"), false);
  assert.equal(booleanValue("0"), false);
  assert.equal(booleanValue(2), false);
});

test("bounded integers reject empty, decimal and out-of-range values", () => {
  assert.equal(boundedInteger("12", 0, 20), 12);
  assert.equal(boundedInteger("", 0, 20), null);
  assert.equal(boundedInteger(1.5, 0, 20), null);
  assert.equal(boundedInteger(21, 0, 20), null);
});

test("slugs accept only normalized URL-safe identifiers", () => {
  assert.equal(validSlug("pizza-calabresa"), true);
  assert.equal(validSlug("Pizza Calabresa"), false);
  assert.equal(validSlug("pizza--calabresa"), false);
});
