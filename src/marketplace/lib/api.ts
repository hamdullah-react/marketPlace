import type { LooseRow } from '@/marketplace/lib/row';

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

function buildQuery(params: Record<string, unknown> | null | undefined = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
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
/** Everything `request` accepts past the path. */
export type RequestOpts = {
  params?: Record<string, unknown> | null;
  method?: string;
  body?: unknown;
  signal?: AbortSignal | null;
};

async function request(
  path: string,
  { params, method = 'GET', body, signal }: RequestOpts = {},
) {
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
  brands: (opts?: RequestOpts) => request('brands', opts),
  models: (brand: string, opts?: RequestOpts) => request('models', { ...opts, params: { brand, ...opts?.params } }),
  trims: (model: string, opts?: RequestOpts) => request('trims', { ...opts, params: { model, ...opts?.params } }),
  years: (opts?: RequestOpts) => request('years', opts),
  colors: (opts?: RequestOpts) => request('colors', opts),
  specs: (opts?: RequestOpts) => request('specs', opts),

  /** kind omitted → every list grouped by kind. */
  attributes: (kind?: string, opts?: RequestOpts) => request('attributes', { ...opts, params: { kind, ...opts?.params } }),

  createCatalogEntry: (payload: unknown) => request('catalog/create', { method: 'POST', body: payload }),

  // ── browse ──
  cars: (filters?: LooseRow, opts?: RequestOpts) => request('cars', { ...opts, params: { ...filters, ...opts?.params } }),
  carFacets: (opts?: RequestOpts) => request('cars/facets', opts),
  listings: (filters?: LooseRow, opts?: RequestOpts) => request('listings', { ...opts, params: { ...filters, ...opts?.params } }),
  listing: (slug: string, opts?: RequestOpts) => request(`listings/${slug}`, opts),
  vendors: (filters?: LooseRow, opts?: RequestOpts) => request('vendors', { ...opts, params: { ...filters, ...opts?.params } }),
  categories: (opts?: RequestOpts) => request('categories', opts),

  // ── seller ──
  sellerStats: (vendor: string, opts?: RequestOpts) => request('seller/stats', { ...opts, params: { vendor, ...opts?.params } }),
  sellerListings: (vendor: string, filters?: LooseRow, opts?: RequestOpts) =>
    request('seller/listings', { ...opts, params: { vendor, ...filters, ...opts?.params } }),

  // ── media ──
  media: (vendor: string, filters?: LooseRow, opts?: RequestOpts) => request('media', { ...opts, params: { vendor, ...filters, ...opts?.params } }),
  deleteMedia: (id: string) => request(`upload?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),

  /**
   * Uploads bypass `request` — multipart, not JSON, so the Content-Type header
   * must be left for the browser to set with its own boundary.
   */
  async upload(
    file: File | Blob,
    {
      vendorId,
      kind = 'photo',
      listingId,
    }: { vendorId?: string; kind?: string; listingId?: string } = {},
  ) {
    const body = new FormData();
    body.append('file', file);
    body.append('vendorId', vendorId ?? '');
    body.append('kind', kind);
    if (listingId) body.append('listingId', listingId);

    const res = await fetch('/api/marketplace/upload', { method: 'POST', body });
    const json = await res.json().catch(() => null);
    if (!json?.ok) throw new Error(json?.error?.message ?? `Upload failed (${res.status})`);
    return json.data.asset;
  },
};

export default marketplaceApi;
