import React, { useMemo, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import ProductCard from "../components/ProductCard";
import Footer from "../components/Footer";

export default function MenuPage({
  products,
  categories,
  subcategories,
  settings,
  onAdd,
  digitalMode = false,
  cartCount = 0,
}) {
  const [params] = useSearchParams();
  const [category, setCategory] = useState(params.get("categoria") || "todos");
  const [subcategory, setSubcategory] = useState("todos");
  const [search, setSearch] = useState("");
  const activeSubs = useMemo(
    () =>
      category === "todos"
        ? []
        : subcategories.filter(
            (item) =>
              item.category?.slug === category ||
              item.categoryId ===
                categories.find((cat) => cat.slug === category)?.id,
          ),
    [category, subcategories, categories],
  );
  const filtered = useMemo(
    () =>
      products.filter((product) => {
        const categoryOk =
          category === "todos" || product.category?.slug === category;
        const subOk =
          subcategory === "todos" || product.subcategory?.slug === subcategory;
        const term = search.trim().toLowerCase();
        return (
          categoryOk &&
          subOk &&
          (!term ||
            `${product.name} ${product.description}`
              .toLowerCase()
              .includes(term))
        );
      }),
    [products, category, subcategory, search],
  );
  function selectCategory(slug) {
    setCategory(slug);
    setSubcategory("todos");
  }

  return (
    <div className="page-shell full-menu-page">
      <main className="container full-menu-wrap">
        <div className="page-top">
          <Link to={digitalMode ? "/" : "/#cardapio"}>
            <ArrowLeft size={16} /> Voltar ao início
          </Link>
        </div>
        {digitalMode && (
          <section className="digital-table-hero">
            <div>
              <span className="eyebrow">ATENDIMENTO NO SALÃO</span>
              <h1>Peça direto da sua mesa.</h1>
              <p>
                Escolha os itens agora. Na finalização, informe seu nome e a
                mesa; o pagamento será feito somente depois de você ser servido.
              </p>
            </div>
            <Link className="primary-btn" to="/cardapio-digital/finalizar">
              Finalizar na mesa {cartCount ? `(${cartCount})` : ""}
            </Link>
          </section>
        )}
        <div className="section-heading">
          <div>
            <span className="eyebrow dark">Cardápio completo</span>
            <h1 className="page-title">
              Tudo em um <em>só lugar.</em>
            </h1>
            <p>
              Use categorias, subcategorias e busca para encontrar rapidamente o
              que deseja.
            </p>
          </div>
          <label className="search-box">
            <Search size={18} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar produto ou ingrediente"
            />
          </label>
        </div>
        <div className="category-tabs">
          <button
            className={category === "todos" ? "active" : ""}
            onClick={() => selectCategory("todos")}
          >
            Todos
          </button>
          {categories.map((item) => (
            <button
              key={item.id}
              className={category === item.slug ? "active" : ""}
              onClick={() => selectCategory(item.slug)}
            >
              {item.name}
            </button>
          ))}
        </div>
        {activeSubs.length > 0 && (
          <div className="subcategory-tabs">
            <button
              className={subcategory === "todos" ? "active" : ""}
              onClick={() => setSubcategory("todos")}
            >
              Todos da categoria
            </button>
            {activeSubs.map((item) => (
              <button
                key={item.id}
                className={subcategory === item.slug ? "active" : ""}
                onClick={() => setSubcategory(item.slug)}
              >
                {item.name}
              </button>
            ))}
          </div>
        )}
        <div className="full-menu-meta">
          <b>{filtered.length}</b>
          <span>
            {filtered.length === 1
              ? "produto encontrado"
              : "produtos encontrados"}
          </span>
        </div>
        <div className="product-grid">
          {filtered.map((product) => (
            <ProductCard key={product.id} product={product} onAdd={onAdd} />
          ))}
        </div>
        {!filtered.length && (
          <div className="empty-state">
            <Search />
            <h3>Nenhum produto encontrado</h3>
            <p>Tente outra busca ou categoria.</p>
          </div>
        )}
      </main>
      <Footer settings={settings} />
    </div>
  );
}
