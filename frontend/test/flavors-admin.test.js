import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = () =>
  readFile(
    new URL("../src/components/admin/FlavorsAdmin.jsx", import.meta.url),
    "utf8",
  );

test("catálogo central de sabores cobre cadastro, edição e pausa", async () => {
  const component = await source();

  assert.match(component, /api\.post\("\/admin\/flavors"/);
  assert.match(component, /api\.patch\(`\/admin\/flavors\/\$\{editingFlavorId\}`/);
  assert.match(component, /toggleFlavor/);
  assert.match(component, /Ingredientes/);
  assert.match(component, /Permitir meio a meio/);
  assert.match(component, /Controlar estoque/);
  assert.match(component, /Disponibilidade e preço por tamanho/);
  assert.match(component, /<option value="FIXED">Preço fixo<\/option>/);
  assert.match(component, /<option value="SURCHARGE">Acréscimo<\/option>/);
});

test("grupos de sabor são administrados por categoria", async () => {
  const component = await source();

  assert.match(component, /api\.post\("\/admin\/flavor-groups"/);
  assert.match(
    component,
    /api\.patch\(`\/admin\/flavor-groups\/\$\{editingGroupId\}`/,
  );
  assert.match(component, /Categoria do cardápio/);
  assert.match(component, /Grupo ativo/);
  assert.match(component, /toggleGroup/);
});
