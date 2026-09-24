import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../prisma/migrations/20260923000000_compre_sem_fila_integration/migration.sql",
  import.meta.url,
);

test("migration da CSF é expansiva e preserva pedidos e produtos existentes", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /CREATE TABLE "CompreSemFilaProductLink"/);
  assert.match(sql, /CREATE TABLE "CompreSemFilaOrder"/);
  assert.match(sql, /CREATE TABLE "CompreSemFilaSyncRun"/);
  assert.match(sql, /ON DELETE CASCADE/);
  assert.match(sql, /ON DELETE SET NULL/);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DELETE FROM "(?:Order|Product)"/i);
});
