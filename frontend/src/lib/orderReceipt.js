import { mediaUrl } from "./api";
import { STATUS_LABEL, paymentLabel } from "./adminOrders";
import { comboSnapshotText } from "./comboSnapshot";

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
const brl = (value) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));
export function printOrderReceipt(order, settings = {}) {
  const popup = window.open("", "_blank", "width=460,height=720");
  if (!popup) return false;
  const isTable = order.fulfillmentType === "DINE_IN";
  const operation = isTable
    ? order.table?.name || `Mesa ${order.table?.number || "—"}`
    : order.fulfillmentType === "PICKUP"
      ? "Retirada na loja"
      : [order.street, order.addressNumber, order.neighborhood, order.city]
          .filter(Boolean)
          .join(", ");
  const logo = mediaUrl(settings.logoImage);
  const itemRows = (order.items || [])
    .map((item) => {
      const details = [
        ...(Array.isArray(item.comboItems)
          ? item.comboItems.map(
              (component) =>
                `Combo: ${comboSnapshotText(component, item.quantity)}`,
            )
          : []),
        item.flavors?.length
          ? `Sabores: ${item.flavors.map((flavor) => flavor.name).join(" / ")}`
          : "",
        item.options?.length
          ? `Adicionais: ${item.options
              .map((option) => `${option.groupName}: ${option.optionName}`)
              .join(" / ")}`
          : "",
        item.notes ? `Obs.: ${item.notes}` : "",
      ]
        .filter(Boolean)
        .map((detail) => `<small>${escapeHtml(detail)}</small>`)
        .join("");
      return `<div class="item"><div><b>${escapeHtml(item.quantity)}× ${escapeHtml(item.name)}</b>${details}</div><strong>${escapeHtml(brl(Number(item.unitPrice) * Number(item.quantity)))}</strong></div>`;
    })
    .join("");
  popup.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Pedido #${escapeHtml(order.shortCode)}</title><style>
    @page{size:80mm auto;margin:4mm}*{box-sizing:border-box}body{width:72mm;margin:0 auto;color:#111;font:12px/1.4 Arial,sans-serif}header{text-align:center;border-bottom:2px solid #111;padding-bottom:10px}header img{display:block;max-width:48mm;max-height:20mm;object-fit:contain;margin:0 auto 6px}h1{font-size:18px;margin:0}header p,.meta p{margin:2px 0}.code{font-size:19px;margin:12px 0 4px}.meta{border-bottom:1px dashed #555;padding:0 0 10px}.item{display:flex;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px dashed #888}.item div{min-width:0}.item b,.item small{display:block}.item small{color:#333;margin-top:2px}.item strong{white-space:nowrap}.totals{padding-top:9px}.totals span,.totals b{display:flex;justify-content:space-between;margin:3px 0}.totals b{font-size:16px;border-top:2px solid #111;padding-top:7px}.footer{text-align:center;border-top:1px dashed #555;margin-top:12px;padding-top:9px;font-size:10px}.no-print{display:block;width:100%;margin:16px 0;padding:9px;border:0;background:#111;color:#fff;font-weight:bold;border-radius:6px}@media print{.no-print{display:none}}
  </style></head><body><header>${logo ? `<img src="${escapeHtml(logo)}" alt="">` : ""}<h1>${escapeHtml(settings.storeName || "Master Pizzaria")}</h1><p>${escapeHtml(settings.phone || "")}</p></header><section class="meta"><h2 class="code">PEDIDO #${escapeHtml(order.shortCode)}</h2><p><b>${escapeHtml(order.customerName)}</b></p><p>${escapeHtml(operation)}</p><p>${escapeHtml(new Date(order.createdAt).toLocaleString("pt-BR"))}</p><p>Status: <b>${escapeHtml(STATUS_LABEL[order.status] || order.status)}</b></p><p>Pagamento: <b>${escapeHtml(paymentLabel(order) || "A definir")}</b></p></section><main>${itemRows}</main><section class="totals"><span>Subtotal <strong>${escapeHtml(brl(order.subtotal))}</strong></span>${Number(order.deliveryFee || 0) ? `<span>Entrega <strong>${escapeHtml(brl(order.deliveryFee))}</strong></span>` : ""}<b>Total <strong>${escapeHtml(brl(order.total))}</strong></b></section>${order.notes ? `<p><b>Observação:</b> ${escapeHtml(order.notes)}</p>` : ""}<div class="footer">Documento de conferência • sem valor fiscal</div><button class="no-print" onclick="window.print()">Imprimir pedido</button><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));<\/script></body></html>`);
  popup.document.close();
  return true;
}
