import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CRAWLER_UA =
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

type ProductMeta = {
  title: string | null;
  image_url: string | null;
  price: number | null;
  retailer: string | null;
};

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .trim();
}

function meta(html: string, keys: string[]): string {
  for (const key of keys) {
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`, "i"),
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m?.[1]) return decodeEntities(m[1]);
    }
  }
  return "";
}

function titleTag(html: string): string {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m?.[1] ? decodeEntities(m[1].replace(/\s*[|\-–—].*$/, "").trim()) : "";
}

function parsePrice(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return Math.round(raw * 100) / 100;
  const s = String(raw).replace(/[^0-9.,]/g, "");
  if (!s) return null;
  const normalized = s.includes(",") && !s.includes(".") ? s.replace(",", ".") : s.replace(/,/g, "");
  const n = parseFloat(normalized);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function walkJsonLd(node: unknown, out: { title?: string; image?: string; price?: number | null }) {
  if (!node) return;
  if (Array.isArray(node)) {
    node.forEach((n) => walkJsonLd(n, out));
    return;
  }
  if (typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  const type = String(obj["@type"] ?? "");
  const types = type ? [type] : [];
  if (Array.isArray(obj["@type"])) types.push(...obj["@type"].map(String));

  const isProduct = types.some((t) => /product/i.test(t));
  const isOffer = types.some((t) => /offer/i.test(t));

  if (isProduct) {
    if (!out.title && typeof obj.name === "string") out.title = obj.name.trim();
    if (!out.image) {
      const img = obj.image;
      if (typeof img === "string") out.image = img;
      else if (Array.isArray(img) && typeof img[0] === "string") out.image = img[0];
      else if (img && typeof img === "object" && typeof (img as { url?: string }).url === "string") {
        out.image = (img as { url: string }).url;
      }
    }
    if (obj.offers) walkJsonLd(obj.offers, out);
  }

  if (isOffer && out.price == null) {
    const p = parsePrice(obj.price ?? obj.lowPrice ?? obj.highPrice);
    if (p != null) out.price = p;
  }

  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") walkJsonLd(v, out);
  }
}

function jsonLd(html: string): { title?: string; image?: string; price?: number | null } {
  const out: { title?: string; image?: string; price?: number | null } = {};
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      walkJsonLd(JSON.parse(m[1]), out);
    } catch {
      /* skip malformed blocks */
    }
  }
  return out;
}

function priceFromText(text: string): number | null {
  if (!text) return null;
  const patterns = [
    /\$\s*(\d{1,4}(?:,\d{3})*(?:\.\d{2})?)/,
    /USD\s*(\d{1,4}(?:,\d{3})*(?:\.\d{2})?)/i,
    /"price"\s*:\s*"?(\d+(?:\.\d{2})?)"?/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    const p = parsePrice(m?.[1]);
    if (p != null) return p;
  }
  return null;
}
function amazonPrice(html: string): number | null {
  const patterns = [
    /"priceToPay"\s*:\s*\{[^}]*"amount"\s*:\s*([0-9.]+)/,
    /"priceAmount"\s*:\s*([0-9.]+)/,
    /class="a-price-whole"[^>]*>([0-9,]+)/,
    /id="priceblock_ourprice"[^>]*>\s*\$?([0-9.,]+)/,
    /id="priceblock_dealprice"[^>]*>\s*\$?([0-9.,]+)/,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    const p = parsePrice(m?.[1]);
    if (p != null) return p;
  }
  return priceFromText(html);
}

function cleanUrl(raw: string): string {
  try {
    const parsed = new URL(raw.trim());
    const drop = [
      /^utm_/i, /^gclid$/i, /^gclsrc$/i, /^gbraid$/i, /^gad_/i, /^cm_mmc$/i,
      /^fbclid$/i, /^msclkid$/i, /^mc_/i,
    ];
    [...parsed.searchParams.keys()].forEach((key) => {
      if (drop.some((re) => re.test(key))) parsed.searchParams.delete(key);
    });
    parsed.hash = "";
    return parsed.href;
  } catch {
    return raw.trim();
  }
}

function titleFromSlug(slug: string): string {
  return decodeURIComponent(slug)
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 120);
}

function inferFromUrl(url: URL): Partial<ProductMeta> {
  const out: Partial<ProductMeta> = { retailer: detectRetailer(url) || null };
  const parts = url.pathname.split("/").filter(Boolean);

  // carters.com/p/slug/id, target.com/p/name/-/A-123, amazon.com/Name/dp/ASIN
  const slugCandidates = parts.filter((p) =>
    p.length > 3 && !/^\d+$/.test(p) && !/^[A-Z0-9-]{5,15}$/.test(p) && p !== "p" && p !== "dp" && p !== "gp"
  );
  const slug = slugCandidates.sort((a, b) => b.length - a.length)[0];
  if (slug) out.title = titleFromSlug(slug);

  return out;
}

function cleanTitle(title: string, retailer: string): string {
  let t = title
    .replace(/\s*:\s*Amazon\.com.*$/i, "")
    .replace(/\s*[-|]\s*Target.*$/i, "")
    .replace(/\s*[-|]\s*Walmart\.com.*$/i, "")
    .replace(/\s*[-|]\s*Etsy.*$/i, "")
    .replace(/\s*[-|]\s*Amazon.*$/i, "")
    .replace(/\s*[-|]\s*Carter'?s.*$/i, "")
    .trim();
  if (retailer && t.toLowerCase().endsWith(` - ${retailer.toLowerCase()}`)) {
    t = t.slice(0, -(retailer.length + 3)).trim();
  }
  return t.slice(0, 120);
}

function detectRetailer(url: URL): string {
  const host = url.hostname.toLowerCase();
  const map: [string, string][] = [
    ["amazon.", "Amazon"],
    ["target.", "Target"],
    ["walmart.", "Walmart"],
    ["buybuybaby", "buybuy BABY"],
    ["babylist", "Babylist"],
    ["etsy.", "Etsy"],
    ["potterybarnkids", "Pottery Barn Kids"],
    ["crateandbarrel", "Crate & Kids"],
    ["costco", "Costco"],
    ["ikea", "IKEA"],
    ["carters", "Carter's"],
  ];
  const hit = map.find(([frag]) => host.includes(frag));
  if (hit) return hit[1];
  const bare = host.replace(/^www\./, "").split(".")[0];
  return bare ? bare.replace(/^\w/, (c) => c.toUpperCase()) : "";
}

function extractAmazonAsin(url: string): string | null {
  const patterns = [
    /\/dp\/([A-Z0-9]{10})/i,
    /\/gp\/product\/([A-Z0-9]{10})/i,
    /\/product\/([A-Z0-9]{10})/i,
    /[?&]asin=([A-Z0-9]{10})/i,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1].toUpperCase();
  }
  return null;
}

function amazonImageFromAsin(asin: string): string {
  return `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.L.jpg`;
}

function isPlaceholderImage(url: string, width?: number, height?: number): boolean {
  if (!url || url.startsWith("data:")) return true;
  if (width === 1 && height === 1) return true;
  return false;
}

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

function walmartPrice(html: string): number | null {
  const m = html.match(/"currentPrice":\{"price":([0-9.]+)/);
  return m ? parsePrice(m[1]) : null;
}

function parseHtmlProduct(url: string, html: string): Partial<ProductMeta> {
  if (/access to this page has been denied|px-captcha|perimeterx/i.test(html)) {
    throw new Error("Store blocked automated lookup");
  }
  const parsed = new URL(url);
  const retailer = detectRetailer(parsed);
  const ld = jsonLd(html);

  const title = cleanTitle(
    meta(html, ["og:title", "twitter:title"]) || ld.title || titleTag(html),
    retailer,
  );

  const image_url =
    meta(html, ["og:image", "twitter:image", "og:image:url"]) ||
    ld.image ||
    meta(html, ["product:image", "image"]) ||
    null;

  const price =
    ld.price ??
    parsePrice(meta(html, ["product:price:amount", "og:price:amount"])) ??
    walmartPrice(html) ??
    amazonPrice(html);

  return {
    title: title || null,
    image_url: image_url || null,
    price: price ?? null,
    retailer: retailer || null,
  };
}

async function fetchHtml(url: string, userAgent: string): Promise<string> {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": userAgent,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Store returned ${res.status}`);

  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("text/html") && !ct.includes("application/xhtml")) {
    throw new Error("Link did not return a product page");
  }
  return res.text();
}

async function scrapeHtml(url: string): Promise<Partial<ProductMeta>> {
  let html = await fetchHtml(url, CRAWLER_UA);
  let out = parseHtmlProduct(url, html);

  if (/walmart\.com/i.test(url) && (!out.image_url || !out.price)) {
    html = await fetchHtml(url, MOBILE_UA);
    out = { ...out, ...parseHtmlProduct(url, html) };
  }

  return out;
}

async function fetchMicrolink(url: string): Promise<Partial<ProductMeta>> {
  try {
    const res = await fetch(`https://api.microlink.io?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return {};
    const json = await res.json();
    if (json.status !== "success") return {};

    const data = json.data ?? {};
    const retailer = typeof data.publisher === "string" ? data.publisher : "";
    const out: Partial<ProductMeta> = {};

    if (typeof data.title === "string" && data.title.trim()) {
      out.title = cleanTitle(data.title.trim(), retailer);
    }
    if (data.price != null) out.price = parsePrice(data.price);
    else {
      const fromText = priceFromText(
        [data.title, data.description, data.url].filter(Boolean).join(" "),
      );
      if (fromText != null) out.price = fromText;
    }

    const image = data.image;
    if (image && typeof image.url === "string" && !isPlaceholderImage(image.url, image.width, image.height)) {
      out.image_url = image.url;
    }
    if (retailer) out.retailer = retailer;

    return out;
  } catch {
    return {};
  }
}

function mergeMeta(...sources: Partial<ProductMeta>[]): ProductMeta {
  const out: ProductMeta = { title: null, image_url: null, price: null, retailer: null };
  for (const src of sources) {
    if (!out.title && src.title) out.title = src.title;
    if (!out.image_url && src.image_url) out.image_url = src.image_url;
    if (out.price == null && src.price != null) out.price = src.price;
    if (!out.retailer && src.retailer) out.retailer = src.retailer;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { url: raw } = await req.json();
    if (!raw || typeof raw !== "string") {
      return new Response(JSON.stringify({ error: "Missing url" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    let parsed: URL;
    try {
      parsed = new URL(cleanUrl(raw));
    } catch {
      return new Response(JSON.stringify({ error: "Invalid URL" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return new Response(JSON.stringify({ error: "URL must be http or https" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const href = parsed.href;
    const inferred = inferFromUrl(parsed);
    const host = parsed.hostname.toLowerCase();
    const skipMicrolink = /carters\.com|crateandbarrel|potterybarn|buybuybaby/.test(host);
    const asin = extractAmazonAsin(href);
    const amazonFallback: Partial<ProductMeta> = asin
      ? { image_url: amazonImageFromAsin(asin), retailer: "Amazon" }
      : {};

    const [scraped, microlink] = await Promise.all([
      scrapeHtml(href).catch(() => ({})),
      skipMicrolink ? Promise.resolve({}) : fetchMicrolink(href),
    ]);

    const result = mergeMeta(scraped, microlink, amazonFallback, inferred, {
      retailer: detectRetailer(parsed) || null,
    });

    if (!result.title && !result.image_url && result.price == null) {
      return new Response(JSON.stringify({ error: "Could not read product details from that link" }), {
        status: 422,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ...result, partial: !(result.title && result.image_url && result.price != null) }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not read product page";
    return new Response(JSON.stringify({ error: message }), {
      status: 422,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
