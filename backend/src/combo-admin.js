import { booleanValue, boundedInteger } from "./input-validation.js";
import { cleanText, safeMediaUrl } from "./sanitization.js";

const invalidCombo = (message) =>
  Object.assign(new Error(message), { code: "INVALID_COMBO" });

export const comboSlugBase = (value) =>
  String(value || "combo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 82) || "combo";

async function uniqueComboSlug(tx, name, excludeId = null) {
  const base = comboSlugBase(name);
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const slug = suffix ? `${base}-${suffix + 1}` : base;
    const existing = await tx.product.findFirst({
      where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    if (!existing) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

async function ensureComboCategory(tx) {
  let category = await tx.category.findFirst({
    where: { OR: [{ slug: "combos" }, { name: "Combos" }] },
  });
  if (category) {
    return category.active
      ? category
      : tx.category.update({ where: { id: category.id }, data: { active: true } });
  }
  const last = await tx.category.aggregate({ _max: { sortOrder: true } });
  return tx.category.create({
    data: {
      name: "Combos",
      slug: "combos",
      sortOrder: Number(last._max.sortOrder || 0) + 1,
      active: true,
    },
  });
}

export async function validateComboItems(tx, rawItems, comboId = null) {
  const items = (Array.isArray(rawItems) ? rawItems : [])
    .map((entry, sortOrder) => ({
      productId: cleanText(entry?.productId, 80),
      sizeId: cleanText(entry?.sizeId, 80) || null,
      quantity: boundedInteger(entry?.quantity ?? 1, 1, 20),
      sortOrder,
    }))
    .filter((entry) => entry.productId);

  if (items.some((entry) => entry.quantity == null)) {
    throw invalidCombo("A quantidade de um item do combo é inválida.");
  }
  if (items.some((entry) => entry.productId === comboId)) {
    throw invalidCombo("Um combo não pode conter ele mesmo.");
  }
  if (new Set(items.map((entry) => entry.productId)).size !== items.length) {
    throw invalidCombo("Não repita o mesmo produto: ajuste sua quantidade no combo.");
  }
  if (items.length < 2 || items.length > 20) {
    throw invalidCombo("Escolha entre 2 e 20 produtos diferentes para o combo.");
  }

  const products = await tx.product.findMany({
    where: {
      id: { in: items.map((entry) => entry.productId) },
      isCombo: false,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      productSizes: { include: { size: true } },
    },
  });
  if (products.length !== items.length) {
    throw invalidCombo("O combo contém produto inexistente, arquivado ou outro combo.");
  }

  const productsById = new Map(products.map((product) => [product.id, product]));
  for (const item of items) {
    const product = productsById.get(item.productId);
    const sizes = product.productSizes.filter((row) => row.size.active);
    const validSize = item.sizeId
      ? sizes.some((row) => row.sizeId === item.sizeId)
      : sizes.length === 0;
    if (!validSize) {
      throw invalidCombo(`Escolha um tamanho válido para ${product.name} no combo.`);
    }
  }
  return items;
}

async function syncComboItems(tx, comboId, items) {
  await tx.comboItem.deleteMany({ where: { comboId } });
  await tx.comboItem.createMany({
    data: items.map((entry) => ({ ...entry, comboId })),
  });
}

function readComboFields(body, { partial = false } = {}) {
  const data = {};
  if (!partial || body?.name !== undefined) {
    const name = cleanText(body?.name, 100);
    if (name.length < 2) throw invalidCombo("Informe um nome válido para o combo.");
    data.name = name;
  }
  if (!partial || body?.description !== undefined) {
    const description = cleanText(body?.description, 350);
    if (!description) throw invalidCombo("Informe a descrição do combo.");
    data.description = description;
  }
  if (!partial || body?.price !== undefined) {
    const price = Number(body?.price);
    if (!Number.isFinite(price) || price < 0 || price > 99_999_999.99) {
      throw invalidCombo("Informe um preço válido para o combo.");
    }
    data.price = price;
  }
  if (!partial || body?.image !== undefined) {
    const image = safeMediaUrl(body?.image) || null;
    if (body?.image && !image) throw invalidCombo("A imagem do combo é inválida.");
    data.image = image;
  }
  if (body?.available !== undefined) data.available = booleanValue(body.available);
  return data;
}

export function registerComboAdminRoutes({
  app,
  prisma,
  auth,
  admin,
  productInclude,
  serializeProduct,
  writeAdminLog,
}) {
  const include = productInclude;

  app.get("/api/admin/combos", auth, admin, async (req, res) => {
    const rows = await prisma.product.findMany({
      where: req.query.archived === "1"
        ? { isCombo: true }
        : { isCombo: true, deletedAt: null },
      include,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });
    res.json(rows.map(serializeProduct));
  });

  app.post("/api/admin/combos", auth, admin, async (req, res) => {
    const fields = readComboFields(req.body);
    const combo = await prisma.$transaction(async (tx) => {
      const items = await validateComboItems(tx, req.body?.items);
      const category = await ensureComboCategory(tx);
      const sort = await tx.product.aggregate({
        where: { isCombo: true },
        _max: { sortOrder: true },
      });
      const product = await tx.product.create({
        data: {
          ...fields,
          slug: await uniqueComboSlug(tx, fields.name),
          badge: "Combo",
          isCombo: true,
          categoryId: category.id,
          available: fields.available ?? true,
          sortOrder: Number(sort._max.sortOrder || 0) + 1,
        },
      });
      await syncComboItems(tx, product.id, items);
      return tx.product.findUnique({ where: { id: product.id }, include });
    });
    await writeAdminLog(req, "CREATE_COMBO", "Product", combo.id, {
      name: combo.name,
      items: combo.comboItems.length,
    });
    res.status(201).json(serializeProduct(combo));
  });

  app.patch("/api/admin/combos/:id", auth, admin, async (req, res) => {
    const combo = await prisma.$transaction(async (tx) => {
      const current = await tx.product.findFirst({
        where: { id: req.params.id, isCombo: true },
      });
      if (!current) {
        throw Object.assign(new Error("Combo não encontrado."), { code: "P2025" });
      }
      const data = readComboFields(req.body, { partial: true });
      if (data.name) data.slug = await uniqueComboSlug(tx, data.name, current.id);
      const items = Array.isArray(req.body?.items)
        ? await validateComboItems(tx, req.body.items, current.id)
        : null;
      await tx.product.update({ where: { id: current.id }, data });
      if (items) await syncComboItems(tx, current.id, items);
      return tx.product.findUnique({ where: { id: current.id }, include });
    });
    await writeAdminLog(req, "UPDATE_COMBO", "Product", combo.id, { name: combo.name });
    res.json(serializeProduct(combo));
  });

  app.delete("/api/admin/combos/:id", auth, admin, async (req, res) => {
    const combo = await prisma.product.update({
      where: { id: req.params.id, isCombo: true },
      data: { available: false, deletedAt: new Date() },
    });
    await writeAdminLog(req, "ARCHIVE_COMBO", "Product", combo.id, { name: combo.name });
    res.json({ ok: true, id: combo.id, archived: true });
  });
}
