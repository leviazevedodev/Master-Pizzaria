import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const checkoutUrl = new URL("../src/pages/CheckoutPage.jsx", import.meta.url);

test("Card Payment Brick mantém configuração e callbacks estáveis", async () => {
  const source = await readFile(checkoutUrl, "utf8");

  assert.match(source, /const CARD_PAYMENT_CUSTOMIZATION = Object\.freeze/);
  assert.match(source, /const cardInitialization = useMemo/);
  assert.match(source, /const submitCard = useCallback/);
  assert.match(source, /const cardRequestRef = useRef\(null\)/);
  assert.match(source, /if \(cardRequestRef\.current\) return cardRequestRef\.current/);
  assert.match(source, /onApprovedRef\.current\?\.\(data\)/);
  assert.match(source, /Pagamento reiniciado pelo cliente/);
  assert.match(source, /onReady=\{handleCardReady\}/);
  assert.doesNotMatch(source, /onReady=\{\(\) => setPaymentMessage/);
});
