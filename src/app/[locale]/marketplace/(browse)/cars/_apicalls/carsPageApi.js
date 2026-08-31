import { cache } from 'react';
import { getCars, getCarFacets } from '@/marketplace/db/queries/cars';
import { getCardSpecs } from '@/marketplace/db/queries/specs';
import { normalizeListing } from '@/marketplace/lib/listing';

export const PAGE_SIZE = 12;

/**
 * Turns raw searchParams into the filter object getCars() expects.
 *
 * The URL is the single source of truth for filter state — no client store, no
 * context. That keeps every filtered view shareable, bookmarkable and
 * server-rendered, which a client-side filter store gives up.
 */
export function parseCarFilters(searchParams = {}, locale = 'ar') {
  const one = (key) => {
    const v = searchParams[key];
    return Array.isArray(v) ? v[0] : v;
  };
  const many = (key) => {
    const v = searchParams[key];
    if (v == null || v === '') return undefined;
    return (Array.isArray(v) ? v : String(v).split(',')).filter(Boolean);
  };
  const num = (key) => {
    const v = one(key);
    if (v == null || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  const page = Math.max(1, num('page') ?? 1);

  /**
   * A vendor id has to LOOK like a uuid before it reaches the query.
   *
   * vendor_id is a uuid column, so Postgres rejects anything else outright
   * with "invalid input syntax for type uuid" — which is an exception, not an
   * empty result set. Without this guard `?vendor=abc` took the whole results
   * section down into the error boundary, and the page is one hand-edited
   * address bar away from that. Anything that is not a uuid now filters by
   * nothing, which is what a filter naming no showroom should do.
   *
   * `city` needs no such guard: it is text, so a nonsense value simply matches
   * no rows.
   */
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const uuids = (key) => {
    const vals = (many(key) ?? []).filter((v) => UUID.test(v));
    return vals.length ? vals : undefined;
  };

  /**
   * Catalog references — brand, model, trim, colour — which may be an id OR a
   * slug.
   *
   * These were uuid-only for the reason above, and that guard is no longer the
   * right one. Catalog rows are private per showroom (schema.sql §30), so a
   * make is several rows sharing one slug and the SLUG is the public key:
   * `?brand=toyota` is the honest way to name a make, and the uuid names one
   * showroom's private row.
   *
   * Still safe against the crash the guard existed to stop. slugSiblings() in
   * queries/cars.js sorts values by shape and only ever compares a uuid against
   * a uuid column, so nothing here can reach Postgres as the wrong type.
   *
   * Slug shape is deliberately narrow — lowercase, digits, hyphens, bounded —
   * so this stays a filter rather than a way to post arbitrary text into a
   * query.
   */
  const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
  const refs = (key) => {
    const vals = (many(key) ?? [])
      .map((v) => String(v).trim())
      .filter((v) => UUID.test(v) || SLUG.test(v.toLowerCase()));
    return vals.length ? vals : undefined;
  };

  /**
   * The generic catalog attributes, out of `attr_<kind>=a,b`.
   *
   * Read off the raw params rather than a fixed list, because the whole point
   * of the kinds table is that a new attribute needs no code change. Kind slugs
   * are bounded so a hand-edited URL cannot turn into an unbounded key.
   */
  const dynamicKinds = () => {
    const out = {};
    for (const [key, raw] of Object.entries(searchParams)) {
      if (!key.startsWith('attr_')) continue;
      const kind = key.slice(5);
      if (!kind || kind.length > 40) continue;
      const values = (Array.isArray(raw) ? raw : String(raw ?? '').split(','))
        .filter(Boolean)
        .slice(0, 20);
      if (values.length) out[kind] = values;
    }
    return Object.keys(out).length ? out : undefined;
  };

  /**
   * Spec-sheet filters, out of `spec_<slug>=a,b`.
   *
   * A separate prefix from attr_ because they are a separate table with a
   * separate slug namespace — `spec_transmission` and `attr_transmission` can
   * legitimately both exist and mean different things, and collapsing them
   * would make one silently shadow the other.
   */
  const specFilters = () => {
    const out = {};
    for (const [key, raw] of Object.entries(searchParams)) {
      // `spec_<slug>_range` is a numeric range, handled separately — read as a
      // value list it becomes a filter on an attribute named "<slug>_range",
      // which nothing has, so it could only ever return zero cars.
      if (!key.startsWith('spec_') || key.endsWith('_range')) continue;
      const slug = key.slice(5);
      if (!slug || slug.length > 60) continue;
      const values = (Array.isArray(raw) ? raw : String(raw ?? '').split(','))
        .map((v) => v.trim())
        .filter(Boolean)
        .slice(0, 20);
      if (values.length) out[slug] = values;
    }
    return Object.keys(out).length ? out : undefined;
  };

  /** `spec_<slug>_range=min-max`, either end optional. */
  const specRangeFilters = () => {
    const out = {};
    for (const [key, raw] of Object.entries(searchParams)) {
      if (!key.startsWith('spec_') || !key.endsWith('_range')) continue;
      const slug = key.slice(5, -'_range'.length);
      if (!slug || slug.length > 60) continue;
      const [minRaw, maxRaw] = String(Array.isArray(raw) ? raw[0] : raw ?? '').split('-');
      const min = Number(minRaw);
      const max = Number(maxRaw);
      const entry = {};
      if (Number.isFinite(min) && minRaw !== '') entry.min = min;
      if (Number.isFinite(max) && maxRaw !== '') entry.max = max;
      if (Object.keys(entry).length) out[slug] = entry;
    }
    return Object.keys(out).length ? out : undefined;
  };

  const vendorRaw = one('vendor');
  const vendorId =
    typeof vendorRaw === 'string' && UUID.test(vendorRaw) ? vendorRaw : undefined;

  return {
    q: one('q') || undefined,
    city: one('city') || undefined,
    vendorId,
    minPrice: num('min_price'),
    maxPrice: num('max_price'),
    minYear: num('min_year'),
    maxYear: num('max_year'),
    year: many('year'),
    maxMileage: num('max_mileage'),
    condition: many('condition'),
    transmission: many('transmission'),
    fuel: many('fuel'),
    // Catalog relations. brand/model/color are uuid columns, so each value is
    // shape-checked for the same reason vendorId is above — a nonsense value
    // reaching a uuid column is an exception, not an empty result.
    brand: refs('brand'),
    model: refs('model'),
    trim: refs('trim'),
    color: refs('color'),
    seats: many('seats'),
    offer: many('offer'),
    // Present only when true, so `?has_offer=0` is not a filter that matches
    // nothing — it is simply not a filter.
    hasOffer: one('has_offer') === '1' || undefined,
    isFeatured: one('featured') === '1' || undefined,
    // Generic catalog attributes: attr_<kind>=a,b
    kinds: dynamicKinds(),
    // Spec-sheet facets: spec_<slug>=Diesel,CVT and spec_<slug>_range=1.4-2.0
    specs: specFilters(),
    specRanges: specRangeFilters(),
    locale,
    sort: one('sort') || 'newest',
    page,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  };
}

/**
 * Facets and results are read separately, not in one Promise.all.
 *
 * The page renders the filter rail and the result grid behind their own
 * Suspense boundaries, and they have no data in common: facets are the same
 * for every visitor regardless of filters, while the grid depends entirely on
 * them. Kept together, the rail would wait on the (much slower) filtered
 * query for no reason; kept apart, each paints the moment its own query lands.
 */

/**
 * Filter rail options. Independent of the current filters.
 *
 * Memoised per request because THREE places need it and none of them can get
 * it from the others: the desktop rail, the mobile filter sheet (a separate
 * Suspense boundary, since its trigger sits in the results column) and the
 * selected-filter chips, which turn a `vendor=<uuid>` in the URL back into a
 * showroom's name. Without cache() that is the same query three times.
 */
/**
 * `scopeKey` is the scope as JSON, not as an object.
 *
 * React's cache() keys on argument IDENTITY, so `{ brand: [id] }` built fresh
 * in each of the three callers would be three different keys and three
 * identical queries. A string is compared by value, so the rail, the phone's
 * filter sheet and the chips share one entry the way they always have.
 */
export const getCarsFacets = cache(async (locale = 'ar', scopeKey = '') =>
  getCarFacets(locale, scopeKey ? JSON.parse(scopeKey) : null));

/**
 * The filtered, paged result set.
 *
 * `lock` is what the PATH already decided — the brand on /brands/changan, the
 * condition on /cars/new. It is spread last, so it wins over anything the query
 * string says: a hand-edited `?brand=<toyota>` on Changan's page filters to
 * Changan, because the page is Changan. The rail hides the sections a lock
 * covers (see FilterSidebar's `hide`) so the two cannot disagree on screen.
 */
export async function getCarsResults(searchParams, locale, lock = null) {
  const filters = { ...parseCarFilters(searchParams, locale), ...(lock ?? {}) };
  const { items, total } = await getCars(filters);

  // Which facts a card shows is a catalog decision — the specifications
  // flagged "show on card". One read for the whole page: doing it per card
  // would be a round trip each for a four-icon row.
  // Sequential and not parallel, unavoidably: it needs the ids the first read
  // returns. A missing spec row is a card without its icon strip, never a
  // failed page.
  const cardSpecs = await getCardSpecs(items.map((r) => r.id), locale).catch(() => new Map());

  return {
    filters,
    total,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    cars: items.map((row) => normalizeListing(row, locale)),
    cardSpecs: Object.fromEntries(cardSpecs),
  };
}
