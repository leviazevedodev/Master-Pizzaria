const FALLBACK = Object.freeze({
  storeName: "Sua Pizzaria",
  shortName: "Pizzaria",
  primaryColor: "#e31b23",
  secondaryColor: "#111214",
  accentColor: "#ff323a",
});

const clean = (value, fallback = "") =>
  String(value || "").trim() || fallback;

export function safeBrandColor(value, fallback) {
  const color = clean(value);
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
}

export function safePublicUrl(value, baseUrl = "") {
  const raw = clean(value);
  if (!raw) return "";
  try {
    const parsed = new URL(raw, baseUrl || undefined);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
}

export function buildBranding(settings = {}, context = {}) {
  const storeName = clean(settings.storeName, FALLBACK.storeName);
  const shortName = clean(settings.shortName, storeName).slice(0, 30);
  const description = clean(
    settings.seoDescription,
    clean(settings.heroSubtitle, clean(settings.footerText, `Cardápio online de ${storeName}.`)),
  );
  const origin = safePublicUrl(context.origin);
  const pathname = clean(context.pathname, "/");
  const requestedCanonical = safePublicUrl(settings.seoCanonicalUrl);
  const canonical = requestedCanonical || safePublicUrl(pathname, origin);
  const logo = safePublicUrl(context.logoUrl || settings.logoImage, origin);
  const favicon = safePublicUrl(
    context.faviconUrl || settings.faviconImage || logo,
    origin,
  );
  const shareImage = safePublicUrl(
    context.shareImageUrl || settings.shareImage || logo,
    origin,
  );
  const adminPage = /^\/(gestao|admin)(\/|$)/i.test(pathname);
  const social = safePublicUrl(settings.instagramUrl);
  const title = clean(settings.seoTitle, storeName);
  const primaryColor = safeBrandColor(
    settings.primaryColor,
    FALLBACK.primaryColor,
  );
  const secondaryColor = safeBrandColor(
    settings.secondaryColor,
    FALLBACK.secondaryColor,
  );
  const accentColor = safeBrandColor(
    settings.accentColor,
    FALLBACK.accentColor,
  );
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: storeName,
    ...(canonical ? { url: canonical } : {}),
    ...(logo ? { logo, image: shareImage || logo } : {}),
    ...(clean(settings.phone) ? { telephone: clean(settings.phone) } : {}),
    ...(clean(settings.address)
      ? { address: { "@type": "PostalAddress", streetAddress: clean(settings.address) } }
      : {}),
    ...(social ? { sameAs: [social] } : {}),
  };

  return {
    storeName,
    shortName,
    title,
    description,
    canonical,
    logo,
    favicon,
    shareImage,
    primaryColor,
    secondaryColor,
    accentColor,
    robots: adminPage ? "noindex,nofollow,noarchive" : "index,follow",
    jsonLd,
  };
}

function ensureMeta(documentRef, selector, attributes) {
  let element = documentRef.head.querySelector(selector);
  if (!element) {
    element = documentRef.createElement("meta");
    documentRef.head.appendChild(element);
  }
  Object.entries(attributes).forEach(([name, value]) =>
    element.setAttribute(name, value),
  );
  return element;
}

function ensureLink(documentRef, rel) {
  let element = documentRef.head.querySelector(`link[rel="${rel}"]`);
  if (!element) {
    element = documentRef.createElement("link");
    element.setAttribute("rel", rel);
    documentRef.head.appendChild(element);
  }
  return element;
}

export function applyBrandingToDocument(documentRef, branding) {
  if (!documentRef?.head || !branding) return;
  documentRef.title = branding.title;
  const style = documentRef.documentElement?.style;
  style?.setProperty("--red", branding.primaryColor);
  style?.setProperty("--red-2", branding.accentColor);
  style?.setProperty("--brand-primary", branding.primaryColor);
  style?.setProperty("--brand-secondary", branding.secondaryColor);
  style?.setProperty("--brand-accent", branding.accentColor);

  ensureMeta(documentRef, 'meta[name="description"]', {
    name: "description",
    content: branding.description,
  });
  ensureMeta(documentRef, 'meta[name="robots"]', {
    name: "robots",
    content: branding.robots,
  });
  ensureMeta(documentRef, 'meta[name="theme-color"]', {
    name: "theme-color",
    content: branding.primaryColor,
  });
  ensureMeta(documentRef, 'meta[property="og:title"]', {
    property: "og:title",
    content: branding.title,
  });
  ensureMeta(documentRef, 'meta[property="og:description"]', {
    property: "og:description",
    content: branding.description,
  });
  ensureMeta(documentRef, 'meta[property="og:type"]', {
    property: "og:type",
    content: "website",
  });
  ensureMeta(documentRef, 'meta[name="twitter:card"]', {
    name: "twitter:card",
    content: branding.shareImage ? "summary_large_image" : "summary",
  });
  ensureMeta(documentRef, 'meta[name="twitter:title"]', {
    name: "twitter:title",
    content: branding.title,
  });
  ensureMeta(documentRef, 'meta[name="twitter:description"]', {
    name: "twitter:description",
    content: branding.description,
  });
  if (branding.shareImage) {
    ensureMeta(documentRef, 'meta[property="og:image"]', {
      property: "og:image",
      content: branding.shareImage,
    });
    ensureMeta(documentRef, 'meta[name="twitter:image"]', {
      name: "twitter:image",
      content: branding.shareImage,
    });
  }
  if (branding.favicon)
    ensureLink(documentRef, "icon").setAttribute("href", branding.favicon);
  if (branding.canonical)
    ensureLink(documentRef, "canonical").setAttribute(
      "href",
      branding.canonical,
    );

  let structured = documentRef.head.querySelector(
    'script[data-store-jsonld="true"]',
  );
  if (!structured) {
    structured = documentRef.createElement("script");
    structured.setAttribute("type", "application/ld+json");
    structured.setAttribute("data-store-jsonld", "true");
    documentRef.head.appendChild(structured);
  }
  structured.textContent = JSON.stringify(branding.jsonLd).replace(
    /</g,
    "\\u003c",
  );
}

export function buildDynamicManifest(branding) {
  const icon = branding.favicon || branding.logo;
  return {
    id: "/",
    name: branding.storeName,
    short_name: branding.shortName,
    start_url: "/",
    display: "standalone",
    background_color: branding.secondaryColor,
    theme_color: branding.primaryColor,
    ...(icon
      ? {
          icons: [
            {
              src: icon,
              sizes: "any",
              purpose: "any maskable",
            },
          ],
        }
      : {}),
  };
}
