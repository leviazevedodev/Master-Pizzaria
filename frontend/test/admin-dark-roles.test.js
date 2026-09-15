import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const cssUrl = new URL("../src/styles/admin-v228.css", import.meta.url);

test("tema escuro define contraste próprio para garçom, equipe e entregador", async () => {
  const css = await readFile(cssUrl, "utf8");

  assert.match(css, /admin-dark \.delivery-role-note/);
  assert.match(css, /staff-create-permissions label\.selected/);
  assert.match(css, /courier-capacity-list strong:not\(\.full\)/);
  assert.match(css, /courier-capacity-list strong\.full/);
});
