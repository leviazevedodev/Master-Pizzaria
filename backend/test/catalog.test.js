import test from "node:test";
import assert from "node:assert/strict";
import {
  isProductAvailableAt,
  parseClock,
  startOfZonedDay,
  zonedDateKey,
} from "../src/catalog.js";

test("parseClock accepts only valid 24-hour times", () => {
  assert.equal(parseClock("00:00"), 0);
  assert.equal(parseClock("23:59"), 1439);
  assert.equal(parseClock("24:00"), null);
  assert.equal(parseClock("9:30"), null);
});

test("product availability respects pauses and same-day windows", () => {
  const fridayEvening = new Date("2026-09-04T19:00:00.000Z");
  assert.equal(
    isProductAvailableAt(
      {
        available: true,
        availableDays: [5],
        availableStartTime: "18:00",
        availableEndTime: "23:00",
      },
      fridayEvening,
      "UTC",
    ),
    true,
  );
  assert.equal(
    isProductAvailableAt(
      {
        available: true,
        availableDays: [5],
        availableStartTime: "20:00",
        availableEndTime: "23:00",
      },
      fridayEvening,
      "UTC",
    ),
    false,
  );
  assert.equal(
    isProductAvailableAt(
      { available: true, pausedUntil: "2026-09-04T20:00:00.000Z" },
      fridayEvening,
      "UTC",
    ),
    false,
  );
});

test("overnight windows use the day on which the window started", () => {
  const saturdayOneAm = new Date("2026-09-05T01:00:00.000Z");
  const product = {
    available: true,
    availableDays: [5],
    availableStartTime: "18:00",
    availableEndTime: "02:00",
  };
  assert.equal(isProductAvailableAt(product, saturdayOneAm, "UTC"), true);
  assert.equal(
    isProductAvailableAt(product, new Date("2026-09-05T03:00:00.000Z"), "UTC"),
    false,
  );
});

test("store-day boundaries respect the configured timezone", () => {
  const instant = new Date("2026-09-04T15:00:00.000Z");
  assert.equal(zonedDateKey(instant, "America/Sao_Paulo"), "2026-09-04");
  assert.equal(
    startOfZonedDay(instant, "America/Sao_Paulo").toISOString(),
    "2026-09-04T03:00:00.000Z",
  );
  assert.equal(
    startOfZonedDay(instant, "UTC").toISOString(),
    "2026-09-04T00:00:00.000Z",
  );
});
