const SDK_URL = "https://sdk.mercadopago.com/js/v2";
let sdkPromise;
let brickQueue = Promise.resolve();

export class CardSetupError extends Error {
  constructor(code) {
    super(code);
    this.name = "CardSetupError";
    this.code = code;
  }
}

export function loadMercadoPagoSdk(doc = globalThis.document, win = globalThis.window) {
  if (typeof win.MercadoPago === "function") return Promise.resolve(win.MercadoPago);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = doc.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.dataset.mercadoPagoCardSdk = "true";
    const timeout = win.setTimeout(() => fail("CARD_SDK_NETWORK_TIMEOUT"), 15000);
    function cleanup() {
      win.clearTimeout(timeout);
      script.removeEventListener("load", loaded);
      script.removeEventListener("error", failed);
      doc.removeEventListener("securitypolicyviolation", blocked);
    }
    function fail(code) {
      cleanup();
      script.remove();
      reject(new CardSetupError(code));
    }
    function loaded() {
      cleanup();
      if (typeof win.MercadoPago === "function") resolve(win.MercadoPago);
      else fail("CARD_SDK_UNAVAILABLE");
    }
    function failed() { fail("CARD_SDK_LOAD_FAILED"); }
    function blocked(event) {
      if (String(event.blockedURI || "").startsWith(SDK_URL)) fail("CARD_SDK_CSP_BLOCKED");
    }
    script.addEventListener("load", loaded);
    script.addEventListener("error", failed);
    doc.addEventListener("securitypolicyviolation", blocked);
    (doc.head || doc.body).appendChild(script);
  }).catch((error) => {
    sdkPromise = null;
    throw error;
  });
  return sdkPromise;
}

export function mountMercadoPagoCard({ container, publicKey, amount, payerEmail, callbacks, doc = globalThis.document, win = globalThis.window }) {
  let disposed = false;
  let release;
  const closed = new Promise((resolve) => { release = resolve; });
  const ready = brickQueue.catch(() => {}).then(async () => {
    if (disposed) return;
    if (!publicKey) throw new CardSetupError("CARD_PUBLIC_KEY_MISSING");
    if (!container?.id || !container.isConnected) throw new CardSetupError("CARD_CONTAINER_MISSING");
    const MercadoPago = await loadMercadoPagoSdk(doc, win);
    if (disposed) return;
    let controller;
    let watchdog;
    let creationTimer;
    let creationTimedOut = false;
    let signaled = false;
    try {
      const instance = new MercadoPago(publicKey, { locale: "pt-BR" });
      const builder = instance.bricks();
      watchdog = win.setTimeout(() => {
        if (!signaled && !disposed && controller) callbacks.onError(new CardSetupError("CARD_BRICK_NOT_READY"));
      }, 20000);
      const creation = Promise.resolve().then(() => builder.create("cardPayment", container.id, {
        initialization: { amount: Number(amount), payer: { email: payerEmail } },
        customization: { paymentMethods: { minInstallments: 1, maxInstallments: 12 } },
        locale: "pt-BR",
        callbacks: {
          onReady: () => { signaled = true; win.clearTimeout(watchdog); if (!disposed) callbacks.onReady(); },
          onError: (error) => { signaled = true; win.clearTimeout(watchdog); if (!disposed) callbacks.onError(error); },
          onSubmit: (data) => callbacks.onSubmit(data),
        },
      }));
      creation.then((lateController) => {
        if (creationTimedOut) return lateController?.unmount?.();
      }).catch(() => {
        if (creationTimedOut) console.warn("O SDK recusou a criação do cartão após o prazo de inicialização.");
      });
      controller = await Promise.race([
        creation,
        new Promise((_, reject) => { creationTimer = win.setTimeout(() => {
          creationTimedOut = true;
          reject(new CardSetupError("CARD_BRICK_NOT_READY"));
        }, 20000); }),
      ]);
      win.clearTimeout(creationTimer);
      if (!controller?.unmount) throw new CardSetupError("CARD_BRICK_CONTROLLER_MISSING");
      if (!disposed) await closed;
    } finally {
      win.clearTimeout(watchdog);
      win.clearTimeout(creationTimer);
      await controller?.unmount?.();
    }
  });
  brickQueue = ready;
  ready.catch((error) => { if (!disposed) callbacks.onError(error); });
  return () => { disposed = true; release(); };
}
