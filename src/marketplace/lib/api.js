/**
 * Typed client for /api/marketplace/*.
 *
 * Every `_apicalls` module calls through this instead of hand-rolling fetch —
 * one place that knows the envelope shape, so a component never has to reach
 * into `json.data.items` and guess what happens on failure.
 *
 * Server components should call the query layer directly (`@/marketplace/db/
 * queries/*`); this exists for client components, which cannot.
 */

function buildQuery(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue;
    search.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Unwraps the {ok, data, error} envelope.
 *
 * Throws on a failed envelope so callers use one path — try/catch — rather than
 * checking `ok` on every call and silently rendering an empty list when the
 * server actually errored.
 */
async function request(path, { params, method = 'GET', body, signal } = {}) {
  const res = await fetch(`/api/marketplace/${path}${buildQuery(params)}`, {
    method,
    signal,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  let json = null;
  try {
    json = await res.json();
  } catch {
    throw new Error(`${method} ${path} returned ${res.status} with no JSON body`);
  }

  if (!json?.ok) {
    throw new Error(json?.error?.message ?? `${method} ${path} failed (${res.status})`);
  }
  return json.data;
}

export const marketplaceApi = {
  // ── catalog ──
  brands: (opts) => request('brands', opts),
  models: (brand, opts) => request('models', { ...opts, params: { brand, ...opts?.params } }),
  trims: (model, opts) => request('trims', { ...opts, params: { model, ...opts?.params } }),
  years: (opts) => request('years', opts),
  colors: (opts) => request('colors', opts),
  specs: (opts) => request('specs', opts),

  /** kind omitted → every list grouped by kind. */
  attributes: (kind, opts) => request('attributes', { ...opts, params: { kind, ...opts?.params } }),

  createCatalogEntry: (payload) => request('catalog/create', { method: 'POST', body: payload }),

  // ── browse ──
  cars: (filters, opts) => request('cars', { ...opts, params: { ...filters, ...opts?.params } }),
  carFacets: (opts) => request('cars/facets', opts),
  listings: (filters, opts) => request('listings', { ...opts, params: { ...filters, ...opts?.params } }),
  listing: (slug, opts) => request(`listings/${slug}`, opts),
  vendors: (filters, opts) => request('vendors', { ...opts, params: { ...filters, ...opts?.params } }),
  categories: (opts) => request('categories', opts),

  // ── seller ──
  sellerStats: (vendor, opts) => request('seller/stats', { ...opts, params: { vendor, ...opts?.params } }),
  sellerListings: (vendor, filters, opts) =>
    request('seller/listings', { ...opts, params: { vendor, ...filters, ...opts?.params } }),

  // ── media ──
  media: (vendor, filters, opts) => request('media', { ...opts, params: { vendor, ...filters, ...opts?.params } }),
  deleteMedia: (id) => request(`upload?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),

  /**
   * Uploads bypass `request` — multipart, not JSON, so the Content-Type header
   * must be left for the browser to set with its own boundary.
   */
  async upload(file, { vendorId, kind = 'photo', listingId } = {}) {
    const body = new FormData();
    body.append('file', file);
    body.append('vendorId', vendorId);
    body.append('kind', kind);
    if (listingId) body.append('listingId', listingId);

    const res = await fetch('/api/marketplace/upload', { method: 'POST', body });
    const json = await res.json().catch(() => null);
    if (!json?.ok) throw new Error(json?.error?.message ?? `Upload failed (${res.status})`);
    return json.data.asset;
  },
};

export default marketplaceApi;
