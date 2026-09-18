import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readSource = (relativePath) =>
  readFile(new URL(relativePath, import.meta.url), "utf8");

test("valor recebido em dinheiro é opcional nos dois fechamentos de comanda", async () => {
  const [modal, tables] = await Promise.all([
    readSource("../src/components/TableOrderPaymentModal.jsx"),
    readSource("../src/components/TablesAdmin.jsx"),
  ]);

  assert.match(modal, /Valor recebido \(R\$\) — opcional/);
  assert.match(tables, /Valor recebido \(opcional\)/);
  assert.doesNotMatch(
    modal,
    /Valor recebido \(R\$\)[\s\S]{0,250}<input[\s\S]{0,250}\brequired\b/,
  );
  assert.doesNotMatch(
    tables,
    /Valor recebido \(opcional\)[\s\S]{0,250}\brequired\b/,
  );
});
