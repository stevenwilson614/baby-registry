import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA =
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

function extractAsin(url: string): string | null {
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

function amazonImageCandidates(asin: string): string[] {
  return [
    `https://m.media-amazon.com/images/P/${asin}.01._SL500_.jpg`,
    `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.L.jpg`,
    `https://images-na.ssl-images-amazon.com/images/P/${asin}.01._SCLZZZZZZZ_.jpg`,
  ];
}

function isBadImage(url: string): boolean {
  return !url || url.startsWith("data:") || url.includes("1x1") || url.includes("error/logo");
}

function isAmazonAsinThumb(url: string): boolean {
  return /\/images\/P\/[A-Z0-9]{10}\./i.test(url);
}

async function isImageReachable(url: string): Promise<boolean> {
  if (isBadImage(url)) return false;
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": UA, Range: "bytes=0-8192" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return false;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.startsWith("image/") && !ct.includes("octet-stream")) return false;

    const len = parseInt(res.headers.get("content-length") ?? "0", 10);
    if (ct.includes("gif") && len > 0 && len < 2048) return false;

    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length < 512) return false;
    if (ct.includes("gif") && buf.length < 2048 && isAmazonAsinThumb(url)) return false;

    return true;
  } catch {
    return false;
  }
}

async function firstReachable(urls: string[]): Promise<string | null> {
  for (const url of urls) {
    if (await isImageReachable(url)) return url;
  }
  return null;
}

function imagesFromHtml(html: string): string[] {
  const found: string[] = [];
  const patterns = [
    /https:\/\/m\.media-amazon\.com\/images\/I\/[A-Za-z0-9+_.-]+(?:\._AC_[A-Z0-9_]+)?\.jpg/gi,
    /"hiRes"\s*:\s*"([^"]+)"/g,
    /"large"\s*:\s*"([^"]+)"/g,
    /property=["']og:image["'][^>]+content=["']([^"']+)["']/gi,
    /content=["']([^"']+)["'][^>]+property=["']og:image["']/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    const r = new RegExp(re.source, re.flags);
    while ((m = r.exec(html))) {
      const url = m[1] || m[0];
      if (url && !isBadImage(url) && !found.includes(url)) found.push(url);
    }
  }
  return found;
}

async function scrapeProductImages(productUrl: string): Promise<string[]> {
  if (!productUrl) return [];
  try {
    const res = await fetch(productUrl, {
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    return imagesFromHtml(await res.text());
  } catch {
    return [];
  }
}

async function fetchMicrolinkImage(productUrl: string): Promise<string | null> {
  if (!productUrl) return null;
  try {
    const res = await fetch(`https://api.microlink.io?url=${encodeURIComponent(productUrl)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const url = json?.data?.image?.url;
    if (typeof url === "string" && !isBadImage(url)) return url;
  } catch { /* ignore */ }
  return null;
}

async function duckDuckGoImageSearch(query: string): Promise<string | null> {
  try {
    const q = encodeURIComponent(query);
    const landing = await fetch(`https://duckduckgo.com/?q=${q}&iax=images&ia=images`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(8000),
    });
    const html = await landing.text();
    const vqd = html.match(/vqd=([\d-]+)/)?.[1];
    if (!vqd) return null;

    const imgRes = await fetch(
      `https://duckduckgo.com/i.js?l=us-en&o=json&q=${q}&vqd=${vqd}&f=,,,,,&p=1`,
      { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) },
    );
    if (!imgRes.ok) return null;
    const data = JSON.parse(await imgRes.text());
    for (const hit of data.results ?? []) {
      const url = hit.image as string | undefined;
      if (url && await isImageReachable(url)) return url;
    }
  } catch { /* ignore */ }
  return null;
}

async function googleImageSearch(query: string): Promise<string | null> {
  const key = Deno.env.get("GOOGLE_API_KEY");
  const cx = Deno.env.get("GOOGLE_CSE_ID");
  if (!key || !cx) return duckDuckGoImageSearch(query);

  try {
    const res = await fetch(
      `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&searchType=image&num=5&safe=active&q=${encodeURIComponent(query)}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return duckDuckGoImageSearch(query);
    const json = await res.json();
    for (const item of json.items ?? []) {
      const url = item.link as string | undefined;
      if (url && await isImageReachable(url)) return url;
    }
  } catch { /* ignore */ }
  return duckDuckGoImageSearch(query);
}

async function resolveBestImage(body: {
  title?: string;
  product_url?: string;
  image_url?: string;
  force_search?: boolean;
}): Promise<string | null> {
  const title = (body.title || "").trim();
  const productUrl = (body.product_url || "").trim();
  const current = (body.image_url || "").trim();
  const forceSearch = !!body.force_search;

  const candidates: string[] = [];
  const push = (u?: string | null) => {
    if (u && !isBadImage(u) && !candidates.includes(u)) candidates.push(u);
  };

  const scraped = await scrapeProductImages(productUrl);
  scraped.forEach(push);

  if (!forceSearch) {
    push(current);
    const asin = extractAsin(productUrl || current);
    if (asin) amazonImageCandidates(asin).forEach(push);
    const micro = await fetchMicrolinkImage(productUrl);
    push(micro);
  }

  const local = await firstReachable(candidates);
  if (local && !isAmazonAsinThumb(local)) return local;
  if (local && !forceSearch) {
    const searchQuery = [title, "baby product"].filter(Boolean).join(" ").trim();
    if (searchQuery.length > 4) {
      const searched = await googleImageSearch(searchQuery);
      if (searched) return searched;
    }
    return local;
  }

  const searchQuery = [title, "baby product amazon"].filter(Boolean).join(" ").trim();
  if (searchQuery.length > 4) {
    return await googleImageSearch(searchQuery);
  }
  return local;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const body = await req.json();
    const image_url = await resolveBestImage(body);
    if (!image_url) {
      return new Response(JSON.stringify({ error: "No image found" }), {
        status: 422,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ image_url }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not resolve image";
    return new Response(JSON.stringify({ error: message }), {
      status: 422,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
