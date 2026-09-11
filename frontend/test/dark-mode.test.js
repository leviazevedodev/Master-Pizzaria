import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("modo escuro cobre o personalizador e os logs administrativos", async () => {
  const css = await readFile(
    new URL("../src/styles.css", import.meta.url),
    "utf8",
  );

  assert.match(css, /admin-shell\.admin-dark \.admin-log-list article/);
  assert.match(
    css,
    /admin-shell\.admin-dark \.customizer-product-summary/,
  );
  assert.match(css, /admin-shell\.admin-dark \.sticky-customizer-actions/);
  assert.match(
    css,
    /admin-shell\.admin-dark \.flavor-count-choice\.compact-count \{/,
  );
  assert.match(css, /admin-shell\.admin-dark \.table-payment-warning \{/);
  assert.match(css, /admin-shell\.admin-dark \.table-close-btn:disabled \{/);
  assert.match(css, /admin-shell\.admin-dark \.kitchen-table-badge \{/);
  assert.match(css, /kitchen-ticket-head > span \{/);
});

function luminance(hex) {
  const values = hex
    .match(/[a-f\d]{2}/gi)
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
}

function contrast(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test("cores corrigidas mantêm contraste AA para texto pequeno", () => {
  assert.ok(contrast("#f4f5f7", "#171b20") >= 4.5);
  assert.ok(contrast("#ffd978", "#352b12") >= 4.5);
  assert.ok(contrast("#ffb4b8", "#3a1e22") >= 4.5);
  assert.ok(contrast("#e6ebef", "#242a30") >= 4.5);
  assert.ok(contrast("#ffd6d8", "#5a2025") >= 4.5);
});
