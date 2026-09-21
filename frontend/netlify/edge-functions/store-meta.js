const SOCIAL_CRAWLER =
  /WhatsApp|facebookexternalhit|Facebot|Twitterbot|LinkedInBot|TelegramBot|Discordbot|Slackbot/i;

const clean = (value, fallback = "") =>
  String(value || "").trim() || fallback;

function safeColor(value, fallback) {
  const color = clean(value);
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
}

function safeHttpUrl(value, baseUrl) {
  const raw = clean(value);
  if (!raw) return "";
  try {
    const parsed = new URL(raw, baseUrl);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
}

function publicMediaUrl(value, apiUrl, siteUrl) {
  const raw = clean(value);
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return safeHttpUrl(raw, siteUrl);
  if (raw.startsWith("/api/") && apiUrl) {
    try {
      return safeHttpUrl(raw, new URL(apiUrl).origin);
    } catch {
      return "";
    }
  }
  return safeHttpUrl(raw, siteUrl);
}

function htmlEscape(value) {
  return clean(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function replaceTitle(html, title) {
  return html.replace(
    /<title>[^<]*<\/title>/i,
    `<title>${htmlEscape(title)}</title>`,
  );
}

function upsertMeta(html, attribute, key, content) {
  if (!content) return html;
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `<meta\\s+[^>]*${attribute}=["']${escapedKey}["'][^>]*>`,
    "i",
  );
  const tag = `<meta ${attribute}="${htmlEscape(key)}" content="${htmlEscape(content)}" />`;
  return pattern.test(html)
    ? html.replace(pattern, tag)
    : html.replace("</head>", `    ${tag}\n  </head>`);
}

async function loadStoreSettings(siteUrl) {
  const configuredApi = clean(
    globalThis.Netlify?.env?.get("VITE_API_URL"),
    "/api",
  );
  const apiUrl = safeHttpUrl(configuredApi, siteUrl);
  if (!apiUrl) return { apiUrl: "", settings: null };
  const endpoint = `${apiUrl.replace(/\/$/, "")}/settings`;
  try {
    const response = await fetch(endpoint, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return { apiUrl, settings: null };
    return { apiUrl, settings: await response.json() };
  } catch {
    return { apiUrl, settings: null };
  }
}

function storeIdentity(settings, apiUrl, siteUrl) {
  const storeName = clean(settings?.storeName, "Pizzaria");
  const description = clean(
    settings?.seoDescription,
    clean(settings?.heroSubtitle, `Cardápio online de ${storeName}.`),
  );
  const logo = publicMediaUrl(settings?.logoImage, apiUrl, siteUrl);
  const squareIcon = publicMediaUrl(
    settings?.faviconImage,
    apiUrl,
    siteUrl,
  );
  const shareImage =
    publicMediaUrl(settings?.shareImage, apiUrl, siteUrl) || logo;
  return {
    storeName,
    pageTitle: clean(settings?.seoTitle, storeName),
    socialTitle: storeName,
    description,
    logo,
    icon:
      squareIcon ||
      logo ||
      safeHttpUrl("/images/store-placeholder.svg", siteUrl),
    hasSquareIcon: Boolean(squareIcon),
    shareImage,
    primaryColor: safeColor(settings?.primaryColor, "#e31b23"),
    secondaryColor: safeColor(settings?.secondaryColor, "#111214"),
  };
}

function manifestResponse(identity) {
  return new Response(
    JSON.stringify({
      id: "/",
      name: identity.storeName,
      short_name: identity.storeName,
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: identity.secondaryColor,
      theme_color: identity.primaryColor,
      icons: [
        {
          src: identity.icon,
          sizes: identity.hasSquareIcon ? "512x512" : "any",
          purpose: "any",
        },
      ],
    }),
    {
      headers: {
        "content-type": "application/manifest+json; charset=utf-8",
        "cache-control": "public, max-age=60, must-revalidate",
      },
    },
  );
}

export default async function storeMeta(request, context) {
  const url = new URL(request.url);
  const wantsManifest = url.pathname === "/manifest.webmanifest";
  const isSocialCrawler = SOCIAL_CRAWLER.test(
    request.headers.get("user-agent") || "",
  );
  const isHtmlPath =
    !/\.[a-z0-9]+$/i.test(url.pathname) || url.pathname.endsWith(".html");
  if (
    !wantsManifest &&
    (!isSocialCrawler || request.method !== "GET" || !isHtmlPath)
  )
    return;

  const { apiUrl, settings } = await loadStoreSettings(url.origin);
  const identity = storeIdentity(settings, apiUrl, url.origin);
  if (wantsManifest) return manifestResponse(identity);

  const response = await context.next();
  if (
    !response.ok ||
    !response.headers.get("content-type")?.includes("text/html")
  )
    return response;

  let html = replaceTitle(await response.text(), identity.pageTitle);
  html = upsertMeta(html, "name", "description", identity.description);
  html = upsertMeta(html, "property", "og:title", identity.socialTitle);
  html = upsertMeta(html, "property", "og:description", identity.description);
  html = upsertMeta(html, "property", "og:type", "website");
  html = upsertMeta(html, "property", "og:url", url.href);
  html = upsertMeta(html, "property", "og:image", identity.shareImage);
  html = upsertMeta(html, "name", "twitter:title", identity.socialTitle);
  html = upsertMeta(html, "name", "twitter:description", identity.description);
  html = upsertMeta(
    html,
    "name",
    "twitter:card",
    identity.shareImage ? "summary_large_image" : "summary",
  );
  html = upsertMeta(html, "name", "twitter:image", identity.shareImage);

  const headers = new Headers(response.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "public, max-age=60, must-revalidate");
  headers.delete("content-length");
  return new Response(html, { status: response.status, headers });
}

export const config = {
  path: "/*",
  onError: "bypass",
};
