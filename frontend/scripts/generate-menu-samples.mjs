import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createMenuPdf, createQrCodePdf } from "../src/lib/menuPdf.js";

const here = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(here, "../../output/pdf");
const categories = [
  { id: "pizzas", name: "Pizzas", sortOrder: 1 },
  { id: "combos", name: "Combos", sortOrder: 2 },
  { id: "bebidas", name: "Bebidas", sortOrder: 3 },
  { id: "sobremesas", name: "Sobremesas", sortOrder: 4 },
];
const subcategories = [
  { id: "tradicionais", categoryId: "pizzas", name: "Tradicionais", sortOrder: 1 },
  { id: "especiais", categoryId: "pizzas", name: "Especiais", sortOrder: 2 },
  { id: "familia", categoryId: "combos", name: "Para compartilhar", sortOrder: 1 },
  { id: "refrigerantes", categoryId: "bebidas", name: "Refrigerantes", sortOrder: 1 },
  { id: "doces", categoryId: "sobremesas", name: "Doces", sortOrder: 1 },
];
const pizzaNames = [
  "Frango Cremoso",
  "Calabresa Especial",
  "Portuguesa da Casa",
  "Quatro Queijos",
  "Margherita",
  "Carne de Sol com Catupiry",
  "Bacon Crocante",
  "Frango com Cheddar",
  "Napolitana",
  "Moda do Pizzaiolo",
  "Pepperoni",
  "Vegetariana",
  "Lombo Canadense",
  "Milho com Bacon",
  "Atum com Cebola Roxa",
  "Camarão Cremoso",
];
const sizes = [
  { id: "p", name: "P", price: 29.9, sortOrder: 1 },
  { id: "m", name: "M", price: 39.9, sortOrder: 2 },
  { id: "g", name: "G", price: 49.9, sortOrder: 3 },
  { id: "gg", name: "GG", price: 59.9, sortOrder: 4 },
];
const products = pizzaNames.map((name, index) => ({
  id: `pizza-${index}`,
  name,
  description:
    index % 2
      ? "Molho artesanal, muçarela e ingredientes selecionados."
      : "Massa de fermentação lenta, molho da casa e finalização especial.",
  categoryId: "pizzas",
  subcategoryId: index < 10 ? "tradicionais" : "especiais",
  sortOrder: index + 1,
  price: 39.9 + index,
  available: true,
  availableSizes: sizes.map((size) => ({
    ...size,
    price: size.price + index * 0.75,
  })),
  promotion:
    index === 0
      ? {
          active: true,
          activeNow: true,
          originalPrice: 39.9,
          promoPrice: 34.9,
          sizePrices: { p: 24.9, m: 31.9, g: 39.9, gg: 49.9 },
        }
      : null,
}));

[
  ["combo-1", "Combo Família", "Pizza grande + refrigerante 2L + sobremesa.", "combos", "familia", 89.9],
  ["combo-2", "Noite em Dobro", "Duas pizzas médias com sabores à escolha.", "combos", "familia", 74.9],
  ["bebida-1", "Coca-Cola 2 litros", "Servida gelada.", "bebidas", "refrigerantes", 14],
  ["bebida-2", "Guaraná 2 litros", "Servido gelado.", "bebidas", "refrigerantes", 12],
  ["bebida-3", "Água mineral", "Com ou sem gás.", "bebidas", "refrigerantes", 5],
  ["doce-1", "Brownie Master", "Chocolate intenso e casquinha crocante.", "sobremesas", "doces", 14.9],
  ["doce-2", "Sorvete artesanal", "Duas bolas e cobertura da casa.", "sobremesas", "doces", 16.9],
].forEach(([id, name, description, categoryId, subcategoryId, price], index) =>
  products.push({
    id,
    name,
    description,
    categoryId,
    subcategoryId,
    price,
    sortOrder: 100 + index,
    available: true,
    availableSizes: [],
  }),
);

const settings = {
  storeName: "Master Pizzaria",
  phone: "(79) 99999-9999",
  address: "Av. Principal, 100 • Centro",
  logoImage: `data:image/png;base64,${(
    await readFile(resolve(here, "../public/images/master-pizzaria-logo.png"))
  ).toString("base64")}`,
};
const menuUrl = "https://masterpizzaria.netlify.app/cardapio-digital";

await mkdir(outputDir, { recursive: true });
const menu = await createMenuPdf({
  products,
  categories,
  subcategories,
  settings,
  menuUrl,
  includePromotions: true,
  download: false,
});
const qr = await createQrCodePdf({ settings, menuUrl, download: false });
const menuFile = "exemplo-cardapio-master-pizzaria.pdf";
const qrFile = "exemplo-qr-code-cardapio.pdf";
await Promise.all([
  writeFile(resolve(outputDir, menuFile), Buffer.from(menu.doc.output("arraybuffer"))),
  writeFile(resolve(outputDir, qrFile), Buffer.from(qr.doc.output("arraybuffer"))),
]);
console.log(JSON.stringify({ outputDir, menu: menuFile, pages: menu.pageCount, qr: qrFile }));
