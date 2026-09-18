import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const stylesUrl = new URL("../src/styles.css", import.meta.url);

test("controles de upload mantêm o seletor de arquivo clicável", async () => {
  const css = await readFile(stylesUrl, "utf8");
  const rule = css.match(
    /\.media-upload-standard input\[type="file"\]\s*\{([^}]*)\}/,
  );

  assert.ok(rule, "o controle padronizado precisa expor o input de arquivo");
  assert.match(rule[1], /display:\s*block\s*!important/);
  assert.match(rule[1], /position:\s*absolute\s*!important/);
  assert.match(rule[1], /opacity:\s*0\s*!important/);
  assert.doesNotMatch(
    css,
    /\.media-upload-standard input\s*\{[^}]*display:\s*none/,
  );
});
