const CACHE = "master-pizza-static-v10";
const APP_SHELL = ["/"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key.startsWith("master-pizza-") && key !== CACHE)
              .map((key) => caches.delete(key)),
          ),
        ),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  )
    return;

  if (request.mode === "navigate") {
    event.respondWith(
      Promise.race([
        fetch(request).then((response) => {
          if (response.ok)
            caches
              .open(CACHE)
              .then((cache) => cache.put("/", response.clone()));
          return response;
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("navigation-timeout")), 3000),
        ),
      ]).catch(() => caches.match("/")),
    );
    return;
  }

  if (request.destination === "image" || request.destination === "manifest") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && response.type === "basic")
            caches
              .open(CACHE)
              .then((cache) => cache.put(request, response.clone()));
          return response;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

  if (!["script", "style", "font"].includes(request.destination))
    return;
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok && response.type === "basic")
            caches
              .open(CACHE)
              .then((cache) => cache.put(request, response.clone()));
          return response;
        }),
    ),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification?.data?.url || "/seus-pedidos";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => "focus" in client);
      if (existing) {
        existing.navigate(target);
        return existing.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    payload = { body: event.data?.text() || "O status do seu pedido mudou." };
  }
  const title = payload.title || "Pedido atualizado";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "O status do seu pedido mudou.",
      icon: payload.icon || "/images/store-placeholder.svg",
      badge: payload.badge || payload.icon || "/images/store-placeholder.svg",
      tag: payload.tag || "master-pizzaria-order-status",
      renotify: true,
      vibrate: [250, 100, 250, 100, 400],
      data: payload.data || { url: "/seus-pedidos" },
    }),
  );
});
