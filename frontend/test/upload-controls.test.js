import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const stylesUrl = new URL("../src/styles.css", import.meta.url);
const srcUrl = new URL("../src/", import.meta.url);
const settingsUrl = new URL(
  "../src/components/admin/StoreSettings.jsx",
  import.meta.url,
);
const adminPageUrl = new URL("../src/pages/AdminPage.jsx", import.meta.url);

async function listSourceFiles(directoryUrl) {
  const files = [];
  const entries = await readdir(directoryUrl, { withFileTypes: true });
  for (const entry of entries) {
    const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directoryUrl);
    if (entry.isDirectory()) files.push(...(await listSourceFiles(entryUrl)));
    else if (/\.(?:js|jsx)$/.test(entry.name)) files.push(entryUrl);
  }
  return files;
}

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

test("configurações abre o seletor por um botão explícito e exibe falhas", async () => {
  const source = await readFile(settingsUrl, "utf8");

  assert.match(source, /function MediaUploadButton/);
  assert.match(source, /type="button"/);
  assert.match(source, /inputRef\.current\?\.click\(\)/);
  assert.match(source, /className="media-file-input"/);
  assert.match(source, /className="media-upload-error" role="alert"/);
});

test("todo upload administrativo exibe a resolução recomendada", async () => {
  const uploadFiles = [];
  for (const fileUrl of await listSourceFiles(srcUrl)) {
    const source = await readFile(fileUrl, "utf8");
    const uploadCount = (source.match(/type="file"/g) || []).length;
    if (!uploadCount) continue;
    uploadFiles.push(fileUrl.href.slice(srcUrl.href.length));
    const hintCount = (source.match(/className="upload-resolution-hint"/g) || []).length;
    assert.equal(
      hintCount,
      uploadCount,
      `${fileUrl.pathname} precisa de uma recomendação por input de arquivo`,
    );
  }

  assert.deepEqual(uploadFiles.sort(), [
    "components/CombosAdmin.jsx",
    "components/admin/AlterationsAdmin.jsx",
    "components/admin/FlavorsAdmin.jsx",
    "components/admin/MarketingAdmin.jsx",
    "components/admin/ProductEditorModal.jsx",
    "components/admin/PromotionsAdmin.jsx",
    "components/admin/StoreSettings.jsx",
  ]);
});

test("recomendações correspondem aos recortes e o envio continua usando postForm", async () => {
  const [settings, products, flavors, combos, promotions, additions, campaigns, adminPage] =
    await Promise.all([
      readFile(settingsUrl, "utf8"),
      readFile(new URL("../src/components/admin/ProductEditorModal.jsx", import.meta.url), "utf8"),
      readFile(new URL("../src/components/admin/FlavorsAdmin.jsx", import.meta.url), "utf8"),
      readFile(new URL("../src/components/CombosAdmin.jsx", import.meta.url), "utf8"),
      readFile(new URL("../src/components/admin/PromotionsAdmin.jsx", import.meta.url), "utf8"),
      readFile(new URL("../src/components/admin/AlterationsAdmin.jsx", import.meta.url), "utf8"),
      readFile(new URL("../src/components/admin/MarketingAdmin.jsx", import.meta.url), "utf8"),
      readFile(adminPageUrl, "utf8"),
    ]);

  for (const resolution of [
    "1200 × 525 px",
    "512 × 512 px",
    "1200 × 630 px",
    "1000 × 1050 px",
    "1200 × 900 px",
  ]) assert.match(settings, new RegExp(resolution));
  for (const source of [products, flavors, combos, additions])
    assert.match(source, /1200 × 900 px/);
  assert.match(promotions, /1200 × 675 px/);
  assert.match(campaigns, /1200 × 525 px/);
  assert.match(adminPage, /api\.postForm\("\/admin\/media"/);
  assert.match(adminPage, /"Imagem da promoção", 16 \/ 9/);
  assert.match(adminPage, /"Banner da campanha", 16 \/ 7/);
});
