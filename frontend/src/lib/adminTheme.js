export const ADMIN_THEME_KEY = "master-pizza-admin-theme";

export function readAdminDarkTheme(storage = globalThis.localStorage) {
  try { return storage?.getItem(ADMIN_THEME_KEY) === "dark"; }
  catch { return false; }
}

export function fullscreenThemeClass(dark) {
  return dark ? "theme-dark" : "theme-light";
}
