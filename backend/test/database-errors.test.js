import test from "node:test";
import assert from "node:assert/strict";
import { isDatabaseAvailabilityError } from "../src/database-errors.js";

test("classifica indisponibilidade e esgotamento do pool do Prisma", () => {
  for (const code of ["P1001", "P1002", "P1008", "P1017", "P2024"])
    assert.equal(isDatabaseAvailabilityError({ code }), true, code);

  assert.equal(isDatabaseAvailabilityError(new Error("jwt expired")), false);
  assert.equal(isDatabaseAvailabilityError({ code: "P2002" }), false);
});
