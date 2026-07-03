/* Product image fallbacks + server-side image search when URLs break */
'use strict';

const imageCache = new Map();
const imageResolving = new Set();
const CATALOG_IMG_KEY = 'br_catalog_images';

function loadCatalogImageCache() {
  try {
    const raw = localStorage.getItem(CATALOG_IMG_KEY);
    if (!raw) return;
    Object.entries(JSON.parse(raw)).forEach(([id, url]) => {
      if (id && url) imageCache.set(id, url);
    });
  } catch { /* ignore */ }
}

function saveCatalogImageCache(id, url) {
  if (!id || !url) return;
  imageCache.set(id, url);
  try {
    const cache = JSON.parse(localStorage.getItem(CATALOG_IMG_KEY) || '{}');
    cache[id] = url;
    localStorage.setItem(CATALOG_IMG_KEY, JSON.stringify(cache));
  } catch { /* ignore */ }
}

loadCatalogImageCache();

function extractAsin(url) {
  if (!url) return null;
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

function isLikelyBrokenAmazonThumb(url) {
  return /\/images\/P\/[A-Z0-9]{10}\./i.test(url || '');
}

function localImageCandidates(item) {
  const urls = [];
  const push = (u) => { if (u && !urls.includes(u)) urls.push(u); };

  push(imageCache.get(item.id));
  if (item.image_url && !isLikelyBrokenAmazonThumb(item.image_url)) push(item.image_url);

  const asin = extractAsin(item.product_url || item.image_url || '');
  if (asin && !urls.length) {
    push(`https://m.media-amazon.com/images/P/${asin}.01._SL500_.jpg`);
  }

  return urls.filter(Boolean);
}

function escAttr(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function productImageHTML(item, { persist = true } = {}) {
  const candidates = localImageCandidates(item);
  const src = candidates[0] || '';
  const encoded = candidates.map((u) => encodeURIComponent(u)).join('|');
  return `<img class="product-img" src="${escAttr(src)}" alt="${escAttr(item.title || 'Product')}" loading="lazy"
    data-item-id="${escAttr(item.id)}" data-title="${escAttr(item.title || '')}"
    data-product-url="${escAttr(item.product_url || '')}" data-candidates="${encoded}"
    data-no-persist="${persist ? '0' : '1'}" data-attempt="0">`;
}

function catalogImageHTML(item) {
  return productImageHTML(item, { persist: false });
}

function getCachedImage(id) {
  return imageCache.get(id) || null;
}

async function resolveImageRemote(item, { forceSearch = false } = {}) {
  const { data, error } = await sb.functions.invoke('resolve-image', {
    body: {
      title: item.title,
      product_url: item.product_url || '',
      image_url: item.image_url || '',
      force_search: forceSearch,
    },
  });
  if (error || !data?.image_url) return null;
  return data.image_url;
}

async function persistItemImage(itemId, imageUrl) {
  if (!imageUrl) return;
  imageCache.set(itemId, imageUrl);
  const item = state.items.find((i) => i.id === itemId);
  if (!item || item.image_url === imageUrl) return;
  item.image_url = imageUrl;
  await sb.from('registry_items').update({ image_url: imageUrl }).eq('id', itemId);
}

function hydrateProductImage(img) {
  if (!img || img.dataset.resolved === '1' || img.dataset.wired === '1') return;
  img.dataset.wired = '1';

  const itemId = img.dataset.itemId;
  const title = img.dataset.title || '';
  const productUrl = img.dataset.productUrl || '';
  const noPersist = img.dataset.noPersist === '1';
  const getCandidates = () => (img.dataset.candidates || '').split('|').map(decodeURIComponent).filter(Boolean);
  let attempt = parseInt(img.dataset.attempt || '0', 10);

  const tryNext = () => {
    const candidates = getCandidates();
    while (attempt < candidates.length) {
      const next = candidates[attempt++];
      img.dataset.attempt = String(attempt);
      if (next !== img.src) {
        img.src = next;
        return true;
      }
    }
    return false;
  };

  img.onload = () => {
    if (img.naturalWidth <= 1 || img.naturalHeight <= 1) {
      img.onerror?.();
      return;
    }
    img.dataset.resolved = '1';
    if (itemId && img.src && noPersist) saveCatalogImageCache(itemId, img.src);
    else if (itemId && img.src && !noPersist) {
      imageCache.set(itemId, img.src);
      persistItemImage(itemId, img.src);
    } else if (itemId && img.src) {
      imageCache.set(itemId, img.src);
    }
  };

  img.onerror = async () => {
    if (tryNext()) return;

    if (imageResolving.has(itemId)) return;
    imageResolving.add(itemId);

    try {
      const remote = await resolveImageRemote({
        id: itemId,
        title,
        product_url: productUrl,
        image_url: img.src,
      }, { forceSearch: noPersist || isLikelyBrokenAmazonThumb(img.src) });
      if (remote) {
        img.dataset.resolved = '1';
        img.onerror = null;
        img.src = remote;
        if (noPersist) saveCatalogImageCache(itemId, remote);
        else {
          imageCache.set(itemId, remote);
          await persistItemImage(itemId, remote);
        }
        return;
      }
    } catch (e) {
      console.warn('Image resolve failed:', itemId, e);
    } finally {
      imageResolving.delete(itemId);
    }

    img.onerror = null;
    img.classList.add('product-img-failed');
    const wrap = img.closest('.card-media, .catalog-card-media');
    if (wrap && !wrap.querySelector('.placeholder, .catalog-card-ph')) {
      img.replaceWith(Object.assign(document.createElement('div'), {
        className: wrap.classList.contains('catalog-card-media') ? 'catalog-card-ph' : 'placeholder',
        innerHTML: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="8" width="18" height="4"/><path d="M5 12v8h14v-8M12 8v12"/></svg>',
      }));
    }
  };

  if (!img.getAttribute('src')) tryNext();
  else if (img.complete && img.naturalWidth === 0) img.onerror();
}

function wireProductImages(root) {
  (root || document).querySelectorAll('.product-img:not([data-wired])').forEach(hydrateProductImage);
}

function primeItemImages(items) {
  items.forEach((item) => {
    const best = localImageCandidates(item)[0];
    if (best) imageCache.set(item.id, best);
  });
}

async function primeCatalogImages(items) {
  const pending = items.filter((item) => {
    const cached = imageCache.get(item.id);
    if (cached && !isLikelyBrokenAmazonThumb(cached)) return false;
    if (item.image_url && !isLikelyBrokenAmazonThumb(item.image_url)) {
      imageCache.set(item.id, item.image_url);
      return false;
    }
    return true;
  });

  for (let i = 0; i < pending.length; i += 2) {
    await Promise.all(pending.slice(i, i + 2).map(async (item) => {
      if (imageResolving.has(item.id)) return;
      imageResolving.add(item.id);
      try {
        const url = await resolveImageRemote(item, { forceSearch: true });
        if (url) saveCatalogImageCache(item.id, url);
      } catch { /* ignore */ } finally {
        imageResolving.delete(item.id);
      }
    }));
  }
}
