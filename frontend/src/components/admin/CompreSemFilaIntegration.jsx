import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link2, RefreshCw, ShoppingBag, Unplug } from "lucide-react";
import { api } from "../../lib/api";

function formatDate(value) {
  if (!value) return "Ainda não executado";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Data indisponível"
    : date.toLocaleString("pt-BR");
}

function providerError(error, fallback) {
  return error?.response?.data?.message || error?.message || fallback;
}

export default function CompreSemFilaIntegration({ headers, notify }) {
  const [status, setStatus] = useState(null);
  const [links, setLinks] = useState([]);
  const [providerProducts, setProviderProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [statusResponse, linksResponse] = await Promise.all([
        api.get("/admin/compre-sem-fila/status", headers),
        api.get("/admin/compre-sem-fila/products", headers),
      ]);
      setStatus(statusResponse.data);
      setLinks(Array.isArray(linksResponse.data) ? linksResponse.data : []);
    } catch (requestError) {
      setError(
        providerError(
          requestError,
          "Não foi possível carregar a integração Compre Sem Fila.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => {
    load();
  }, [load]);

  const providerOptions = useMemo(
    () =>
      providerProducts.map((product) => ({
        value: String(product.id),
        label: `${product.name || "Produto sem nome"} (#${product.id})`,
      })),
    [providerProducts],
  );

  async function run(kind) {
    setBusy(kind);
    setError("");
    try {
      const endpoint =
        kind === "products"
          ? "/admin/compre-sem-fila/products/sync"
          : "/admin/compre-sem-fila/orders/sync";
      const { data } = await api.post(endpoint, {}, headers);
      notify?.(
        kind === "products"
          ? `${data.succeeded || 0} produto(s) sincronizado(s).`
          : `${data.succeeded || 0} pedido(s) processado(s).`,
      );
      await load();
    } catch (requestError) {
      setError(providerError(requestError, "A sincronização falhou."));
    } finally {
      setBusy("");
    }
  }

  async function loadProviderProducts() {
    setBusy("provider-products");
    setError("");
    try {
      const { data } = await api.get(
        "/admin/compre-sem-fila/provider-products",
        headers,
      );
      setProviderProducts(Array.isArray(data) ? data : []);
      notify?.(`${Array.isArray(data) ? data.length : 0} produto(s) encontrado(s) na CSF.`);
    } catch (requestError) {
      setError(providerError(requestError, "Não foi possível listar os produtos da CSF."));
    } finally {
      setBusy("");
    }
  }

  async function saveLink(row, patch) {
    setBusy(`save-${row.id}`);
    setError("");
    try {
      const { data } = await api.patch(
        `/admin/compre-sem-fila/products/${row.id}`,
        patch,
        headers,
      );
      setLinks((current) =>
        current.map((item) =>
          item.id === row.id
            ? {
                ...item,
                ...data,
                effectiveBarcode: data.barcode || item.effectiveBarcode,
              }
            : item,
        ),
      );
    } catch (requestError) {
      setError(providerError(requestError, "Não foi possível salvar o produto."));
    } finally {
      setBusy("");
    }
  }

  async function connectProduct(row, csfProductId) {
    if (!csfProductId) return;
    setBusy(`link-${row.id}`);
    setError("");
    try {
      const { data } = await api.post(
        `/admin/compre-sem-fila/products/${row.id}/link`,
        { csfProductId: Number(csfProductId) },
        headers,
      );
      setLinks((current) =>
        current.map((item) =>
          item.id === row.id ? { ...item, csfProductId: data.csfProductId } : item,
        ),
      );
      notify?.("Produto vinculado ao Compre Sem Fila.");
    } catch (requestError) {
      setError(providerError(requestError, "Não foi possível vincular o produto."));
    } finally {
      setBusy("");
    }
  }

  if (loading)
    return (
      <section className="store-automation-card csf-integration-card">
        <p>Carregando integração Compre Sem Fila…</p>
      </section>
    );

  return (
    <section className="store-automation-card csf-integration-card">
      <div className="panel-title compact">
        <div>
          <span>Integração externa</span>
          <h3>Compre Sem Fila</h3>
          <p>
            Envia catálogo e estoque, importa pedidos compatíveis e mantém os
            status sincronizados.
          </p>
        </div>
        {status?.enabled ? <ShoppingBag /> : <Unplug />}
      </div>

      <div className="csf-status-grid">
        <span className={status?.configured ? "ok" : "warn"}>
          <b>Credenciais</b>
          <small>
            {status?.configured
              ? `Configuradas para ${status.storeId}`
              : "Defina CSF_STORE_ID e CSF_API_KEY no backend"}
          </small>
        </span>
        <span className={status?.enabled ? "ok" : "warn"}>
          <b>Integração</b>
          <small>{status?.enabled ? "Ativa" : "Desativada no ambiente"}</small>
        </span>
        <span>
          <b>Produtos vinculados</b>
          <small>
            {status?.products?.linked || 0} de {status?.products?.total || 0}
          </small>
        </span>
        <span className={status?.pendingOrders ? "warn" : "ok"}>
          <b>Pedidos pendentes</b>
          <small>{status?.pendingOrders || 0}</small>
        </span>
      </div>

      {error && <div className="admin-inline-error">{error}</div>}

      <div className="csf-action-row">
        <button
          type="button"
          className="primary"
          disabled={!status?.enabled || Boolean(busy)}
          onClick={() => run("products")}
        >
          <RefreshCw size={17} />
          {busy === "products" ? "Sincronizando…" : "Sincronizar produtos"}
        </button>
        <button
          type="button"
          disabled={!status?.enabled || Boolean(busy)}
          onClick={() => run("orders")}
        >
          <ShoppingBag size={17} />
          {busy === "orders" ? "Consultando…" : "Consultar pedidos"}
        </button>
        <button
          type="button"
          disabled={!status?.configured || Boolean(busy)}
          onClick={loadProviderProducts}
        >
          <Link2 size={17} />
          {busy === "provider-products" ? "Buscando…" : "Buscar produtos CSF"}
        </button>
        <button type="button" disabled={Boolean(busy)} onClick={load}>
          Atualizar situação
        </button>
      </div>

      {status?.nextProductSyncAt && (
        <small className="csf-next-sync">
          Próxima sincronização de produtos permitida: {formatDate(status.nextProductSyncAt)}.
        </small>
      )}

      <details className="csf-product-links">
        <summary>Vínculos de produtos ({links.length})</summary>
        <p>
          Cada tamanho recebe um código interno numérico e um EAN-13 estável. Um
          código de barras real pode ser informado quando existir.
        </p>
        <div className="csf-link-list">
          {links.map((row) => (
            <ProductLinkRow
              key={row.id}
              row={row}
              options={providerOptions}
              disabled={Boolean(busy)}
              onSave={saveLink}
              onConnect={connectProduct}
            />
          ))}
        </div>
      </details>

      <details className="csf-sync-history">
        <summary>Histórico recente</summary>
        <div className="csf-run-list">
          {(status?.latestRuns || []).map((run) => (
            <span key={run.id} className={run.status === "FAILED" ? "warn" : "ok"}>
              <b>{run.kind === "PRODUCTS" ? "Produtos" : "Pedidos"}</b>
              <small>
                {run.status} · {run.succeeded}/{run.processed} · {formatDate(run.completedAt || run.startedAt)}
              </small>
            </span>
          ))}
          {!status?.latestRuns?.length && <p>Nenhuma sincronização executada.</p>}
        </div>
      </details>
    </section>
  );
}

function ProductLinkRow({ row, options, disabled, onSave, onConnect }) {
  const [barcode, setBarcode] = useState(row.barcode || "");
  const [providerId, setProviderId] = useState(
    row.csfProductId ? String(row.csfProductId) : "",
  );
  return (
    <div className="csf-link-row">
      <div>
        <b>
          {row.product?.name}
          {row.size?.name ? ` · ${row.size.name}` : ""}
        </b>
        <small>
          ID interno {row.id} · EAN {row.effectiveBarcode}
        </small>
      </div>
      <label>
        Código de barras
        <input
          value={barcode}
          placeholder={row.effectiveBarcode}
          disabled={disabled}
          onChange={(event) => setBarcode(event.target.value)}
          onBlur={() => {
            if ((row.barcode || "") !== barcode.trim())
              onSave(row, { barcode: barcode.trim() });
          }}
        />
      </label>
      <label>
        Produto na CSF
        {options.length ? (
          <select
            value={providerId}
            disabled={disabled}
            onChange={(event) => setProviderId(event.target.value)}
          >
            <option value="">Selecione</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="number"
            min="1"
            value={providerId}
            disabled={disabled}
            placeholder="ID fornecido pela CSF"
            onChange={(event) => setProviderId(event.target.value)}
          />
        )}
      </label>
      <button
        type="button"
        disabled={disabled || !providerId || Number(providerId) === row.csfProductId}
        onClick={() => onConnect(row, providerId)}
      >
        Vincular
      </button>
      <label className="csf-enabled-toggle">
        <input
          type="checkbox"
          checked={row.enabled !== false}
          disabled={disabled}
          onChange={(event) => onSave(row, { enabled: event.target.checked })}
        />
        Sincronizar
      </label>
    </div>
  );
}
