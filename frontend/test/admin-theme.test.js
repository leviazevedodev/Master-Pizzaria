import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_THEME_KEY, fullscreenThemeClass, readAdminDarkTheme } from "../src/lib/adminTheme.js";

test("tela cheia usa o tema salvo pelo painel antes da primeira renderização", () => {
  const storage = { getItem: (key) => key === ADMIN_THEME_KEY ? "light" : null };
  assert.equal(fullscreenThemeClass(readAdminDarkTheme(storage)), "theme-light");
  storage.getItem = () => "dark";
  assert.equal(fullscreenThemeClass(readAdminDarkTheme(storage)), "theme-dark");
});
