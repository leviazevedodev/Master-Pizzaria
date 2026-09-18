import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

dotenv.config({ quiet: true });

const prisma = new PrismaClient();

const categories = [
  { name: "Pizzas", slug: "pizzas", sortOrder: 1, active: true },
  { name: "Combos", slug: "combos", sortOrder: 2, active: true },
  { name: "Bebidas", slug: "bebidas", sortOrder: 3, active: true },
  { name: "Sobremesas", slug: "sobremesas", sortOrder: 4, active: true },
];

const products = [
  {
    name: "Frango Cremoso",
    slug: "frango-cremoso",
    description: "Frango temperado, requeijão cremoso, muçarela e milho verde.",
    price: 49.9,
    category: "pizzas",
    isFlavorOption: true,
    sortOrder: 1,
    image: "/images/products/frango-cremoso.webp",
  },
  {
    name: "Portuguesa",
    slug: "portuguesa",
    description:
      "Presunto, ovos, cebola, ervilha, muçarela, tomate e azeitonas.",
    price: 51.9,
    category: "pizzas",
    isFlavorOption: true,
    sortOrder: 2,
    image: "/images/products/portuguesa.webp",
  },
  {
    name: "Quatro Queijos",
    slug: "quatro-queijos",
    description:
      "Muçarela, provolone, parmesão e requeijão cremoso em equilíbrio perfeito.",
    price: 52.9,
    category: "pizzas",
    isFlavorOption: true,
    sortOrder: 3,
    image: "/images/products/quatro-queijos.webp",
  },
  {
    name: "Margherita",
    slug: "margherita",
    description:
      "Molho de tomates, muçarela, tomate fresco, manjericão e azeite.",
    price: 44.9,
    category: "pizzas",
    isFlavorOption: true,
    sortOrder: 4,
    image: "/images/products/margherita.webp",
  },
  {
    name: "Sorvete",
    slug: "sorvete",
    description: "Sorvete cremoso servido com cobertura de chocolate.",
    price: 12.9,
    category: "sobremesas",
    sortOrder: 5,
    image: "/images/products/sorvete.webp",
  },
  {
    name: "Guaraná 2L",
    slug: "guarana-2l",
    description: "Guaraná Antarctica 2 litros para acompanhar seu pedido.",
    price: 12.0,
    category: "bebidas",
    sortOrder: 6,
    image: "/images/products/guarana-2l.webp",
  },
  {
    name: "Calabresa",
    slug: "calabresa",
    description: "Muçarela, calabresa, cebola roxa, azeitonas e orégano.",
    price: 46.9,
    category: "pizzas",
    isFlavorOption: true,
    featured: true,
    badge: "Destaque",
    sortOrder: 10,
    image: "/images/products/calabresa.webp",
  },
  {
    name: "Pepsi 2L",
    slug: "pepsi-2l",
    description: "Refrigerante Pepsi 2 litros, servido gelado.",
    price: 12.0,
    category: "bebidas",
    sortOrder: 8,
    image: "/images/products/pepsi-2l.webp",
  },
  {
    name: "Coca-Cola 2L",
    slug: "coca-cola-2l",
    description: "Refrigerante Coca-Cola 2 litros, servido gelado.",
    price: 14.0,
    category: "bebidas",
    sortOrder: 9,
    image: "/images/products/coca-cola-2l.webp",
  },
  {
    name: "Brownie Master",
    slug: "brownie-master",
    description:
      "Brownie intenso de chocolate com casquinha crocante e centro macio.",
    price: 15.9,
    category: "sobremesas",
    badge: "Doce final",
    sortOrder: 7,
    image: "/images/products/brownie-master.webp",
  },
  {
    name: "Combo Master",
    slug: "combo-master",
    description:
      "Pizza Calabresa + Guaraná 2L + Brownie Master em uma oferta completa.",
    price: 74.8,
    category: "combos",
    isCombo: true,
    badge: "Combo",
    sortOrder: 11,
    image: "/images/products/combo-calabresa-guarana-brownie.webp",
  },
];

const sizes = [
  {
    name: "Pequena",
    slug: "pequena",
    diameterCm: 25,
    maxFlavors: 1,
    sortOrder: 1,
    active: true,
  },
  {
    name: "Média",
    slug: "media",
    diameterCm: 30,
    maxFlavors: 2,
    sortOrder: 2,
    active: true,
  },
  {
    name: "Grande",
    slug: "grande",
    diameterCm: 35,
    maxFlavors: 3,
    sortOrder: 3,
    active: true,
  },
  {
    name: "Família",
    slug: "familia",
    diameterCm: 40,
    maxFlavors: 4,
    sortOrder: 4,
    active: true,
  },
];

const deliveryAreas = [
  "Barreiro",
  "Eduardo Gomes",
  "Jardim Loreto",
  "Jardim Universitário",
  "Jardim Universitário 2",
  "Lafaiete Coutinho",
  "Loteamento Nosso Lar (Quilombo)",
  "Luiz Alves 1",
  "Luiz Alves 2",
  "Madre Paulina",
  "Marcelo Déda",
  "Maria do Carmo 3",
  "Nosso Lar",
  "Novo Horizonte",
  "Porto Poxim",
  "Recanto dos Pássaros",
  "Rosa do Oeste",
  "Rosa Elze",
  "Rosa Maria",
  "Tijuquinha",
  "Tijuquinha (Paraguai)",
];
const dayLabels = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

async function main() {
  const forceDefaults = process.env.SEED_FORCE_DEFAULTS === "true";
  const promoteExisting = process.env.ADMIN_SEED_PROMOTE_EXISTING === "true";
  const catalogWasEmpty = (await prisma.product.count()) === 0;
  const adminEmail = String(process.env.ADMIN_SEED_EMAIL || "")
    .trim()
    .toLowerCase();
  let adminPhone = String(process.env.ADMIN_SEED_PHONE || "").replace(
    /\D/g,
    "",
  );
  if (adminPhone.length === 13 && adminPhone.startsWith("55"))
    adminPhone = adminPhone.slice(2);
  adminPhone = adminPhone || null;
  const adminPassword = String(process.env.ADMIN_SEED_PASSWORD || "");
  const adminName =
    String(process.env.ADMIN_SEED_NAME || "Administrador")
      .trim()
      .slice(0, 80) || "Administrador";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(adminEmail))
    throw new Error(
      "Defina ADMIN_SEED_EMAIL com um e-mail válido antes de executar o seed.",
    );
  if (adminPhone && !/^\d{10,11}$/.test(adminPhone))
    throw new Error(
      "ADMIN_SEED_PHONE deve conter 10 ou 11 dígitos, incluindo DDD.",
    );
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });
  if (existingAdmin && !existingAdmin.isAdmin && !promoteExisting)
    throw new Error(
      "ADMIN_SEED_EMAIL pertence a um cliente. Para promovê-lo conscientemente, defina ADMIN_SEED_PROMOTE_EXISTING=true.",
    );
  if (
    !existingAdmin &&
    (!adminPassword || adminPassword.length < 12 || adminPassword.length > 128)
  )
    throw new Error(
      "Defina ADMIN_SEED_PASSWORD com pelo menos 12 caracteres para criar o administrador inicial.",
    );
  const rotatePassword = process.env.ADMIN_SEED_ROTATE_PASSWORD === "true";
  if (
    rotatePassword &&
    (!adminPassword || adminPassword.length < 12 || adminPassword.length > 128)
  )
    throw new Error(
      "Para rotacionar a senha, ADMIN_SEED_PASSWORD deve ter entre 12 e 128 caracteres.",
    );
  const update = {
    isAdmin: true,
    staffActive: true,
    name: adminName,
    ...(adminPhone ? { phone: adminPhone } : {}),
    ...(rotatePassword
      ? {
          passwordHash: await bcrypt.hash(adminPassword, 12),
          sessionVersion: { increment: 1 },
        }
      : {}),
  };
  const create = {
    name: adminName,
    email: adminEmail,
    phone: adminPhone,
    passwordHash:
      existingAdmin?.passwordHash || (await bcrypt.hash(adminPassword, 12)),
    isAdmin: true,
  };
  await prisma.user.upsert({ where: { email: adminEmail }, update, create });

  const categoryMap = {};
  for (const category of categories) {
    const saved = await prisma.category.upsert({
      where: { slug: category.slug },
      update: forceDefaults ? category : {},
      create: category,
    });
    categoryMap[category.slug] = saved.id;
  }
  const pizzaSubDefaults = { name: "Tradicionais", sortOrder: 1, active: true };
  const pizzaSub = await prisma.subcategory.upsert({
    where: {
      categoryId_slug: { categoryId: categoryMap.pizzas, slug: "tradicionais" },
    },
    update: forceDefaults ? pizzaSubDefaults : {},
    create: {
      ...pizzaSubDefaults,
      slug: "tradicionais",
      categoryId: categoryMap.pizzas,
    },
  });

  const savedProducts = [];
  const createdProductIds = new Set();
  for (const product of products) {
    const isPizza = product.category === "pizzas";
    const data = {
      name: product.name,
      description: product.description,
      price: product.price,
      image: product.image,
      badge: product.badge || null,
      featured: Boolean(product.featured),
      sortOrder: product.sortOrder,
      available: true,
      categoryId: categoryMap[product.category],
      subcategoryId: isPizza ? pizzaSub.id : null,
      allowFlavorSplit: isPizza,
      isFlavorOption: Boolean(product.isFlavorOption),
      isCombo: Boolean(product.isCombo),
      maxFlavors: isPizza ? 4 : 1,
      flavorPricingMode: "MAX",
      deletedAt: null,
    };
    let saved = await prisma.product.findUnique({
      where: { slug: product.slug },
    });
    if (!saved && product.slug === "portuguesa")
      saved = await prisma.product.findUnique({
        where: { slug: "portuguesa-master" },
      });
    if (!saved && product.slug === "calabresa")
      saved = await prisma.product.findUnique({
        where: { slug: "calabresa-suprema" },
      });
    if (saved && forceDefaults)
      saved = await prisma.product.update({
        where: { id: saved.id },
        data: { ...data, slug: product.slug },
      });
    if (!saved) {
      saved = await prisma.product.create({
        data: { ...data, slug: product.slug },
      });
      createdProductIds.add(saved.id);
    }
    savedProducts.push(saved);
  }
  // Alterações destrutivas de catálogo só são feitas em banco vazio ou com confirmação explícita.
  const calabresa = savedProducts.find((p) => p.slug === "calabresa");
  if (catalogWasEmpty || forceDefaults)
    await prisma.product.updateMany({
      where: { id: { not: calabresa.id } },
      data: { featured: false },
    });

  const sizeMap = {};
  for (const size of sizes) {
    const saved = await prisma.pizzaSize.upsert({
      where: { slug: size.slug },
      update: forceDefaults ? size : {},
      create: size,
    });
    sizeMap[size.slug] = saved;
  }
  for (const product of savedProducts.filter(
    (p) => p.categoryId === categoryMap.pizzas,
  )) {
    const existingSizeCount = await prisma.productSize.count({
      where: { productId: product.id },
    });
    if (
      !forceDefaults &&
      !createdProductIds.has(product.id) &&
      existingSizeCount > 0
    )
      continue;
    const base = Number(product.price);
    const priceBySize = {
      pequena: Math.max(0, base - 10),
      media: base,
      grande: base + 10,
      familia: base + 20,
    };
    if (forceDefaults)
      await prisma.productSize.deleteMany({ where: { productId: product.id } });
    for (const size of sizes) {
      await prisma.productSize.create({
        data: {
          productId: product.id,
          sizeId: sizeMap[size.slug].id,
          price: priceBySize[size.slug],
          sortOrder: size.sortOrder,
        },
      });
    }
  }

  // O catálogo central é a identidade estável dos sabores. sourceProductId
  // mantém compatibilidade com estoque, promoções e pedidos de versões antigas.
  const traditionalFlavorGroup = await prisma.flavorGroup.upsert({
    where: {
      categoryId_slug: {
        categoryId: categoryMap.pizzas,
        slug: "tradicionais",
      },
    },
    update: forceDefaults
      ? {
          name: "Tradicionais",
          description: "Sabores tradicionais da casa.",
          active: true,
          sortOrder: 1,
        }
      : {},
    create: {
      name: "Tradicionais",
      slug: "tradicionais",
      description: "Sabores tradicionais da casa.",
      categoryId: categoryMap.pizzas,
      active: true,
      sortOrder: 1,
    },
  });
  const flavorByProductId = new Map();
  for (const product of savedProducts.filter(
    (row) => row.categoryId === categoryMap.pizzas,
  )) {
    const defaults = {
      name: product.name,
      slug: product.slug,
      description: product.description,
      ingredients: [],
      groupId: traditionalFlavorGroup.id,
      price: Number(product.price),
      image: product.image,
      active: product.available && !product.deletedAt,
      featured: Boolean(product.featured),
      allowHalfAndHalf: true,
      sortOrder: product.sortOrder,
      stockTracked: product.stockTracked,
      stockQuantity: product.stockQuantity,
      stockLowThreshold: product.stockLowThreshold,
    };
    const flavor = await prisma.flavor.upsert({
      where: { sourceProductId: product.id },
      update: forceDefaults ? defaults : { groupId: traditionalFlavorGroup.id },
      create: { ...defaults, sourceProductId: product.id },
    });
    flavorByProductId.set(product.id, flavor);
    const productSizes = await prisma.productSize.findMany({
      where: { productId: product.id },
      include: { size: true },
    });
    for (const row of productSizes)
      await prisma.flavorSize.upsert({
        where: {
          flavorId_sizeId: { flavorId: flavor.id, sizeId: row.sizeId },
        },
        update: forceDefaults
          ? {
              pricingMode: "FIXED",
              price: row.price,
              available: row.size.active,
              sortOrder: row.sortOrder,
            }
          : {},
        create: {
          flavorId: flavor.id,
          sizeId: row.sizeId,
          pricingMode: "FIXED",
          price: row.price,
          available: row.size.active,
          sortOrder: row.sortOrder,
        },
      });
  }
  const selectableFlavorProducts = savedProducts.filter(
    (row, index) =>
      row.categoryId === categoryMap.pizzas &&
      (products[index]?.isFlavorOption || row.isFlavorOption),
  );
  for (const base of savedProducts.filter(
    (row) => row.categoryId === categoryMap.pizzas && row.allowFlavorSplit,
  )) {
    const eligible = [base, ...selectableFlavorProducts].filter(
      (row, index, rows) => rows.findIndex((item) => item.id === row.id) === index,
    );
    for (const [index, source] of eligible.entries()) {
      const flavor = flavorByProductId.get(source.id);
      if (!flavor) continue;
      await prisma.productFlavor.upsert({
        where: {
          productId_flavorId: { productId: base.id, flavorId: flavor.id },
        },
        update: forceDefaults ? { sortOrder: index } : {},
        create: { productId: base.id, flavorId: flavor.id, sortOrder: index },
      });
    }
  }

  // Borda é uma escolha obrigatória para todas as pizzas. Tradicional vem sem acréscimo.
  const crustGroup = await prisma.modifierGroup.upsert({
    where: { name: "Borda da pizza" },
    update: forceDefaults
      ? {
          description: "Escolha 1 borda para sua pizza.",
          required: true,
          minSelect: 1,
          maxSelect: 1,
          active: true,
          sortOrder: 1,
        }
      : {},
    create: {
      name: "Borda da pizza",
      description: "Escolha 1 borda para sua pizza.",
      required: true,
      minSelect: 1,
      maxSelect: 1,
      active: true,
      sortOrder: 1,
    },
  });
  const crustOptions = [
    {
      name: "Catupiry",
      description: "Borda recheada com creme de requeijão tipo Catupiry.",
      price: 6,
      image: "/images/modifiers/borda-catupiry.webp",
      sortOrder: 1,
    },
    {
      name: "Tradicional",
      description: "Borda tradicional, sem recheio e sem acréscimo.",
      price: 0,
      image: "/images/modifiers/borda-tradicional.webp",
      sortOrder: 2,
    },
    {
      name: "Cheddar",
      description: "Borda recheada com cheddar cremoso.",
      price: 6,
      image: "/images/modifiers/borda-cheddar.webp",
      sortOrder: 3,
    },
  ];
  for (const option of crustOptions) {
    await prisma.modifierOption.upsert({
      where: { groupId_name: { groupId: crustGroup.id, name: option.name } },
      update: forceDefaults
        ? {
            description: option.description,
            price: option.price,
            image: option.image,
            active: true,
            sortOrder: option.sortOrder,
          }
        : {},
      create: { groupId: crustGroup.id, ...option, active: true },
    });
  }
  for (const product of savedProducts.filter(
    (p) => p.categoryId === categoryMap.pizzas,
  )) {
    await prisma.productModifierGroup.upsert({
      where: {
        productId_groupId: { productId: product.id, groupId: crustGroup.id },
      },
      update: forceDefaults ? { sortOrder: 1 } : {},
      create: { productId: product.id, groupId: crustGroup.id, sortOrder: 1 },
    });
  }

  const bySlug = Object.fromEntries(
    products.map((definition, index) => [
      definition.slug,
      savedProducts[index],
    ]),
  );
  const defaultCombo = bySlug["combo-master"];
  if (createdProductIds.has(defaultCombo.id)) {
    const defaultComboItems = [
      {
        product: bySlug.calabresa,
        sizeId: sizeMap.media.id,
        quantity: 1,
      },
      { product: bySlug["guarana-2l"], sizeId: null, quantity: 1 },
      { product: bySlug["brownie-master"], sizeId: null, quantity: 1 },
    ];
    await prisma.$transaction(async (tx) => {
      await tx.comboItem.createMany({
        data: defaultComboItems.map((entry, sortOrder) => ({
          comboId: defaultCombo.id,
          productId: entry.product.id,
          sizeId: entry.sizeId,
          quantity: entry.quantity,
          sortOrder,
        })),
      });
      for (const [sortOrder, entry] of defaultComboItems.entries())
        await tx.comboSlot.create({
          data: {
            comboId: defaultCombo.id,
            type: "FIXED_PRODUCT",
            name: entry.product.name,
            quantity: entry.quantity,
            sortOrder,
            products: {
              create: {
                productId: entry.product.id,
                sizeId: entry.sizeId,
                priceAdjustment: 0,
                sortOrder: 0,
              },
            },
          },
        });
    });
  }
  const desiredPromotions = [
    {
      productId: bySlug["combo-master"].id,
      title: "Combo Master",
      subtitle: "Calabresa + Guaraná 2L + Brownie Master.",
      image: "/images/products/combo-calabresa-guarana-brownie.webp",
      originalPrice: 74.8,
      promoPrice: 59.9,
      sortOrder: 1,
    },
    {
      productId: bySlug["frango-cremoso"].id,
      title: "Frango Cremoso em oferta",
      subtitle: "Uma das favoritas da casa com preço especial.",
      image: "/images/products/frango-cremoso.webp",
      originalPrice: 49.9,
      promoPrice: 42.9,
      sortOrder: 2,
    },
    {
      productId: bySlug["sorvete"].id,
      title: "Sorvete em promoção",
      subtitle: "Sobremesa gelada para fechar o pedido.",
      image: "/images/products/sorvete.webp",
      originalPrice: 12.9,
      promoPrice: 9.9,
      sortOrder: 3,
    },
  ];
  if (catalogWasEmpty || forceDefaults)
    await prisma.promotion.deleteMany({
      where: {
        productId: { notIn: desiredPromotions.map((p) => p.productId) },
      },
    });
  for (const promo of desiredPromotions) {
    await prisma.promotion.upsert({
      where: { productId: promo.productId },
      update: forceDefaults
        ? { ...promo, active: true, startAt: null, endAt: null }
        : {},
      create: { ...promo, active: true },
    });
  }

  for (let index = 0; index < deliveryAreas.length; index += 1) {
    const neighborhood = deliveryAreas[index],
      defaults = { fee: 4, active: true, sortOrder: index + 1 };
    await prisma.deliveryArea.upsert({
      where: {
        city_neighborhood: { city: "São Cristóvão - SE", neighborhood },
      },
      update: forceDefaults ? defaults : {},
      create: { city: "São Cristóvão - SE", neighborhood, ...defaults },
    });
  }
  for (let day = 0; day < 7; day += 1) {
    const defaults = {
      label: dayLabels[day],
      openTime: "18:00",
      closeTime: "23:00",
      closed: false,
      sortOrder: day,
    };
    await prisma.storeHour.upsert({
      where: { dayOfWeek: day },
      update: forceDefaults ? defaults : {},
      create: { dayOfWeek: day, ...defaults },
    });
  }

  const defaultSettings = {
    storeName: "Master Pizzaria",
    phone: "+5579988725557",
    whatsappPrimary: "+5579988725557",
    whatsappSecondary: "+5579988725557",
    whatsappSecondaryVisible: false,
    instagram: "leviazevedo.dev",
    instagramUrl: "https://www.instagram.com/leviazevedo.dev",
    address: "São Cristóvão-SE",
    openingHours: "Consulte os horários no topo do site",
    deliveryFee: 4,
    freeDeliveryThreshold: 0,
    deliveryPricingMode: "AREA",
    deliveryPricePerKm: 1,
    deliveryMinimumKm: 10,
    deliveryMinimumFee: 4,
    deliveryMaxDistanceKm: 15,
    estimatedDeliveryMin: 30,
    estimatedDeliveryMax: 45,
    customerDailyOrderLimit: 5,
    heroTitle: "Pizza artesanal, feita para impressionar.",
    heroSubtitle:
      "Massa leve, ingredientes selecionados e forno quente. Seu pedido chega bonito, saboroso e do jeito certo.",
    menuTitle: "Escolha o seu próximo favorito.",
    menuSubtitle: "Sabores clássicos e especiais, preparados quando você pede.",
    homeProductLimit: 8,
    deliveryEnabled: true,
    pickupEnabled: true,
    isOpen: true,
  };
  await prisma.businessSettings.upsert({
    where: { id: "default" },
    update: forceDefaults ? defaultSettings : {},
    create: { id: "default", ...defaultSettings },
  });

  console.log(`Seed concluído. Admin: ${adminEmail}`);
  if (existingAdmin && !rotatePassword)
    console.log(
      "A senha do administrador existente foi preservada. Use ADMIN_SEED_ROTATE_PASSWORD=true para rotacioná-la explicitamente.",
    );
  if (!forceDefaults)
    console.log(
      "Dados existentes foram preservados. Use SEED_FORCE_DEFAULTS=true somente se quiser restaurar os padrões do catálogo.",
    );
}
main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
