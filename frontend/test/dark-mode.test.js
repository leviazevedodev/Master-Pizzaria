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
});
