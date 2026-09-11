import test from "node:test";
import assert from "node:assert/strict";
import {
  readStoredJson,
  readStoredStringArray,
  writeStoredJson,
} from "../src/lib/storage.js";

class MemoryStorage {
  constructor(entries = {}) {
    this.entries = new Map(Object.entries(entries));
  }

  getItem(key) {
    return this.entries.get(key) ?? null;
  }

  setItem(key, value) {
    this.entries.set(key, String(value));
  }
}

test("invalid JSON and invalid shapes safely use the fallback", () => {
  const storage = new MemoryStorage({ broken: "{", object: '{"ok":false}' });

  assert.deepEqual(readStoredJson(storage, "broken", []), []);
  assert.equal(
    readStoredJson(storage, "object", null, (value) => value.ok === true),
    null,
  );
});

test("writes JSON without throwing when storage is available", () => {
  const storage = new MemoryStorage();

  assert.equal(writeStoredJson(storage, "cart", [{ id: "pizza" }]), true);
  assert.deepEqual(readStoredJson(storage, "cart", []), [{ id: "pizza" }]);
});

test("stored string lists discard invalid values and respect their limit", () => {
  const storage = new MemoryStorage({
    orders: JSON.stringify(["ABC", "", null, "DEF", 123, "GHI"]),
  });

  assert.deepEqual(readStoredStringArray(storage, "orders", 2), ["ABC", "DEF"]);
});
