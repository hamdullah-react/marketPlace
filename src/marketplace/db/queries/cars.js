import { cacheLife } from 'next/cache';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { attachOffers } from './offers';
import { getKindsWithOptions } from './attributes';
import { getSpecFacets, listingIdsMatchingSpecs } from './specs';

/**
 * Car-specific reads. Cars live in the same `listings` table as everything
 * else; these helpers just pin type='car' and understand the car keys inside
 * `attributes` (year, mileage_km, condition, transmission, fuel, trim).
 */

/**
 * `car_colors!color_id`, not a bare `car_colors`: the listings table points at
 * that table TWICE — color_id and interior_color_id — so PostgREST refuses to
 * guess which join is meant and the whole query fails with "Could not embed
 * because more than one relationship was found". The `!` names the foreign key
 * to follow.
 */
const SELECT = `
  id, slug, type, state, name, description,
  price, compare_at, vat_included, attributes, media, city, views, published_at,
  brand_id, model_id, color_id, trim_id, is_featured,
  vendors ( id, slug, name, verified, rating_avg, rating_count ),
  car_brands ( id, slug, name, logo_url ),
  car_models ( id, slug, name ),
  car_trims ( id, slug, name, model_id ),
  car_colors!color_id ( id, slug, name, hex ),
  categories ( id, slug, name )
`;

const SORTS = {
  newest: ['published_at', false],
  price_asc: ['price', true],
  price_desc: ['price', false],
  popular: ['views', false],
};

/**
 * Attribute filters are applied in memory, not in SQL.
 *
 * They live inside a jsonb column, and PostgREST can only express equality on
 * a jsonb path — not the ranges (year between, mileage under) the UI needs. The
 * car inventory is small enough that fetching the type='car' set and filtering
 * here is both correct and fast. Revisit if cars ever pass a few thousand rows;
 * the fix then is generated columns on year/mileage, not a bigger query string.
 */
/**
 * Widen a catalog filter value to every row that shares its slug.
 *
 * Catalog rows are private to a showroom (schema.sql §30), so there is a
 * `toyota` row per showroom that sells Toyotas. A filter of `?brand=<one uuid>`
 * would therefore return one showroom's cars and quietly hide the rest — the
 * brand page would show three of twelve Toyotas and look like the marketplace
 * had almost no stock.
 *
 * The slug is what those rows agree on, so a value is resolved to its slug and
 * then back to EVERY id carrying that slug. Ids and slugs are both accepted:
 * the rail and the brand page pass ids, and a hand-typed `?brand=toyota` is a
 * URL a person might reasonably write.
 *
 * Returns null for "no filter asked for", which is different from [] — an empty
 * array is a filter that matches nothing, and `.in('brand_id', [])` correctly
 * returns no cars.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function slugSiblings(table, values) {
  if (!values?.length) return null;

  const wanted = values.map(String).filter(Boolean);
  if (!wanted.length) return null;

  const db = getMarketplaceDb();

  /* Sorted by shape before querying, because `id` is a uuid column: asking
     PostgREST for `id.in.(toyota)` is not an empty result, it is a 400 that
     takes the whole car list down with it. */
  const ids = wanted.filter((v) => UUID.test(v));
  const slugsAsked = wanted.filter((v) => !UUID.test(v));

  const [byId, bySlug] = await Promise.all([
    ids.length
      ? db.from(table).select('id, slug').in('id', ids)
      : Promise.resolve({ data: [] }),
    slugsAsked.length
      ? db.from(table).select('id, slug').in('slug', slugsAsked)
      : Promise.resolve({ data: [] }),
  ]);

  const slugs = [...new Set(
    [...(byId.data ?? []), ...(bySlug.data ?? [])].map((r) => r.slug).filter(Boolean),
  )];

  /* Nothing matched. Return the uuids only — a slug that resolved to no row
     cannot be compared against `brand_id` without the same 400 — and an empty
     array is the honest answer: a filter for a brand that does not exist
     matches no cars, rather than quietly matching all of them. */
  if (!slugs.length) return ids;

  const { data: family } = await db.from(table).select('id').in('slug', slugs);
  const all = (family ?? []).map((r) => r.id);

  return all.length ? all : wanted;
}

export async function getCars(opts = {}) {
  const {
    city, vendorId, minPrice, maxPrice, q,
    minYear, maxYear, year, maxMileage, condition, transmission, fuel,
    brand, model, color, trim, seats, kinds, hasOffer, isFeatured, offer, specs, specRanges,
    locale = 'ar',
    sort = 'newest', limit = 24, offset = 0,
  } = opts;

  let query = getMarketplaceDb()
    .from('listings')
    .select(SELECT)
    .eq('state', 'live')
    .eq('type', 'car');

  // Cheap, indexable predicates stay in SQL.
  if (city) query = query.eq('city', city);
  if (vendorId) query = query.eq('vendor_id', vendorId);

  /* Brand, model and colour are real foreign keys, so they filter in SQL where
     the index is — unlike the jsonb attributes below. `in` rather than `eq`:
     these are multi-select, and a buyer comparing two makes wants both.

     Each value is widened to its slug's siblings first — see slugSiblings. */
  const [brandIds, modelIds, colorIds, trimIds] = await Promise.all([
    slugSiblings('car_brands', brand),
    slugSiblings('car_models', model),
    slugSiblings('car_colors', color),
    slugSiblings('car_trims', trim),
  ]);

  if (brandIds) query = query.in('brand_id', brandIds);
  if (modelIds) query = query.in('model_id', modelIds);
  if (colorIds) query = query.in('color_id', colorIds);
  if (trimIds) query = query.in('trim_id', trimIds);
  if (isFeatured) query = query.eq('is_featured', true);
  if (minPrice != null) query = query.gte('price', minPrice);
  if (maxPrice != null) query = query.lte('price', maxPrice);
  if (q) {
    const safe = q.replace(/[%,()]/g, ' ').trim();
    if (safe) query = query.or(`name->>ar.ilike.%${safe}%,name->>en.ilike.%${safe}%`);
  }

  const [column, ascending] = SORTS[sort] ?? SORTS.newest;
  query = query.order(column, { ascending, nullsFirst: false });

  /* Spec filters resolve to a set of listing ids first, because the values
     live one table over. Started BEFORE the listings query rather than after —
     neither needs the other's result, so they overlap instead of queueing. */
  const specIdsPromise = specs || specRanges
    ? listingIdsMatchingSpecs(specs, specRanges, locale).catch(() => null)
    : Promise.resolve(null);

  const [{ data, error }, specIds] = await Promise.all([query, specIdsPromise]);
  if (error) throw new Error(`getCars: ${error.message}`);

  const matches = (row) => {
    // null means no spec filter was asked for; an empty set means one was and
    // nothing matched. The two are not the same answer.
    if (specIds && !specIds.has(row.id)) return false;

    const a = row.attributes || {};
    if (minYear != null && Number(a.year) < minYear) return false;
    if (maxYear != null && Number(a.year) > maxYear) return false;
    // Picked years, as strings — the URL has no numbers in it.
    if (year?.length && !year.includes(String(a.year))) return false;
    if (maxMileage != null && Number(a.mileage_km ?? 0) > maxMileage) return false;
    if (condition?.length && !condition.includes(a.condition)) return false;
    if (transmission?.length && !transmission.includes(a.transmission)) return false;
    if (fuel?.length && !fuel.includes(a.fuel)) return false;
    // Seats live in the jsonb, and arrive from the URL as strings.
    if (seats?.length && !seats.includes(String(a.seats))) return false;

    /* Generic catalog attributes — whatever kinds the catalog defines beyond
       the ones with a section of their own. Every named kind must match, and a
       kind with several values picked matches on any of them: two DIFFERENT
       questions are an AND, two answers to the SAME question are an OR. */
    if (kinds) {
      for (const [kind, values] of Object.entries(kinds)) {
        if (!values?.length) continue;
        if (!values.includes(String(a[kind]))) return false;
      }
    }
    return true;
  };

  const filtered = (data ?? []).filter(matches);

  /**
   * "Has an offer" is the one filter that cannot be answered before the offers
   * are attached, so it costs the whole filtered set rather than a page. Only
   * when it is actually asked for: an unfiltered browse still attaches offers
   * to twelve rows, not to everything live.
   */
  if (hasOffer || offer?.length) {
    await attachOffers(filtered);

    const wanted = new Set(offer ?? []);
    const keep = filtered.filter((r) => {
      // attachOffers writes `listing_offers`, not `offers` — the shaping
      // layer renames it later, and reading the renamed one here found
      // nothing on every row.
      const list = r.listing_offers ?? [];
      if (!list.length) return false;
      if (!wanted.size) return true;
      // Matched on the offer's NAME, which is what the rail lists and what a
      // buyer who saw the campaign is actually looking for.
      return list.some((o) => wanted.has(o.label?.en) || wanted.has(o.label?.ar));
    });

    return {
      items: keep.slice(offset, offset + limit),
      total: keep.length,
    };
  }

  // Only the page being returned needs its offers, not the whole filtered set.
  const page = filtered.slice(offset, offset + limit);
  await attachOffers(page);
  return {
    items: page,
    total: filtered.length,
  };
}

/**
 * Facet values and counts for the sidebar, computed from the full live car set.
 * Counts reflect everything available, not the current result page — a facet
 * that shows 0 for an option you can still pick is worse than no count at all.
 *
 * ── `scope` ─────────────────────────────────────────────────────────────────
 *
 * The set the facets describe, when the page itself is already a slice of the
 * inventory: `{ brand: [id] }` on a brand page, `{ condition: ['new'] }` on the
 * new-cars page. Those pages are not "all cars with a filter applied" — the
 * slice is the page's identity, it is in the URL path rather than the query
 * string, and it cannot be unticked. So the rail beside them must describe the
 * slice: on Changan's page, "Year 2026 · 1" means one Changan from 2026, and
 * the makes with no Changan in them are not offered at all.
 *
 * Applied in memory rather than in SQL because this function already fetches
 * the whole live car set to tally it — the rows are here, and a second query
 * to narrow them would cost a round trip to save a filter over a few hundred
 * objects.
 */
export async function getCarFacets(locale = 'ar', scope = null) {
  /**
   * The catalog knows nothing about which cars are live, so it is started
   * BEFORE the listings query rather than after it. Every one of these reads
   * is a round trip to a remote database — roughly 300ms each — and this
   * function used to make five of them strictly in series, which is most of
   * why applying a filter felt slow.
   */
  const kindsPromise = getKindsWithOptions().catch(() => []);

  const { data, error } = await getMarketplaceDb()
    .from('listings')
    .select(`id, price, city, attributes, is_featured,
      vendors ( id, slug, name ),
      car_brands ( id, slug, name, logo_url ),
      car_models ( id, slug, name, brand_id ),
      car_trims ( id, slug, name, model_id ),
      car_colors!color_id ( id, slug, name, hex )`)
    .eq('state', 'live')
    .eq('type', 'car');

  if (error) throw new Error(`getCarFacets: ${error.message}`);

  const all = data ?? [];
  const rows = scope
    ? all.filter((r) => {
        /* Matched on the slug as well as the id. The brand page locks its
           scope with one row's id, and after §30 that row is one showroom's —
           so an id-only test would drop every other showroom's cars from the
           facet counts while the grid beside them showed the lot. */
        if (scope.brand?.length
            && !scope.brand.includes(r.car_brands?.id)
            && !scope.brand.includes(r.car_brands?.slug)) return false;
        if (scope.condition?.length && !scope.condition.includes(r.attributes?.condition)) return false;
        return true;
      })
    : all;

  const tally = (pick) => {
    const map = new Map();
    for (const row of rows) {
      const key = pick(row);
      if (key == null || key === '') continue;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
  };

  const prices = rows.map((r) => Number(r.price)).filter(Number.isFinite);
  const years = rows.map((r) => Number(r.attributes?.year)).filter(Number.isFinite);
  const mileages = rows.map((r) => Number(r.attributes?.mileage_km)).filter(Number.isFinite);

  const vendorMap = new Map();
  for (const row of rows) {
    const v = row.vendors;
    if (!v) continue;
    const entry = vendorMap.get(v.id) ?? { ...v, count: 0 };
    entry.count += 1;
    vendorMap.set(v.id, entry);
  }

  /**
   * Brands, each carrying the models actually listed under it.
   *
   * Built from the LISTINGS rather than from the catalog tables: the catalog
   * holds every brand the platform knows, and a rail offering forty makes with
   * no cars behind them is a list of dead ends. Models nest inside their brand
   * for the same reason the main site nests them — a flat list of models is
   * unreadable once more than one make is on the site.
   */
  /**
   * Keyed by SLUG, not by row id.
   *
   * Catalog rows are private to a showroom now (schema.sql §30), so three
   * showrooms selling Toyotas hold three `toyota` rows. Keying on the id put
   * Toyota in the rail three times, each with a third of the count, and ticking
   * one of them filtered to one showroom's stock.
   *
   * `id` is the SLUG for the same reason: it is what the checkbox writes into
   * `?brand=`, and the slug is the only value that means the make rather than
   * one showroom's row. parseCarFilters accepts both.
   */
  const brandMap = new Map();
  for (const row of rows) {
    const b = row.car_brands;
    if (!b?.slug) continue;

    const brand = brandMap.get(b.slug) ?? {
      id: b.slug, slug: b.slug, name: b.name, logoUrl: b.logo_url ?? null,
      count: 0, models: new Map(),
    };
    brand.count += 1;
    // The first logo wins, so a showroom that never uploaded one does not
    // decide the make is logo-less for everybody.
    if (!brand.logoUrl && b.logo_url) brand.logoUrl = b.logo_url;

    const m = row.car_models;
    if (m?.slug) {
      const model = brand.models.get(m.slug)
        ?? { id: m.slug, slug: m.slug, name: m.name, count: 0 };
      model.count += 1;
      brand.models.set(m.slug, model);
    }

    brandMap.set(b.slug, brand);
  }

  /**
   * Trims, grouped by the model they belong to — the main site's TrimsFilter
   * shape. A flat list would put "GT" and "GT" from two different models on the
   * same row with no way to tell which car either belongs to.
   */
  const trimModelMap = new Map();
  for (const row of rows) {
    const tr = row.car_trims;
    const m = row.car_models;
    if (!tr || !m) continue;

    const group = trimModelMap.get(m.id) ?? { id: m.id, slug: m.slug, name: m.name, trims: new Map() };
    const t = group.trims.get(tr.id) ?? { id: tr.id, slug: tr.slug, name: tr.name, count: 0 };
    t.count += 1;
    group.trims.set(tr.id, t);
    trimModelMap.set(m.id, group);
  }

  const colorMap = new Map();
  for (const row of rows) {
    const c = row.car_colors;
    if (!c) continue;
    const entry = colorMap.get(c.id) ?? {
      id: c.id, slug: c.slug, name: c.name,
      // Falls back to a neutral grey rather than transparent: a swatch with no
      // colour reads as a rendering fault, not as "this car's paint is unknown".
      hex: c.hex && c.hex !== 'false' ? c.hex : '#CCCCCC',
      count: 0,
    };
    entry.count += 1;
    colorMap.set(c.id, entry);
  }

  /**
   * Running offers, and how many cars each covers.
   *
   * Read separately and tolerantly, for the reason set out in offers.js: an
   * embed is resolved against the schema cache, so on a database where §25 has
   * not been applied the whole facets query would fail and take the rail with
   * it. A missing table here costs exactly what it should — no offers section.
   */
  const ids = rows.map((r) => r.id).filter(Boolean);
  const nowIso = new Date().toISOString();

  /**
   * The three id-scoped reads, together.
   *
   * They all need the listing ids and none of them needs each other, so they
   * go out at once instead of queueing. Each is independently tolerant: a
   * missing offers table costs the offers section, not the rail.
   */
  const [offerRows, specFacets, kinds] = await Promise.all([
    ids.length
      ? getMarketplaceDb()
          .from('listing_offers')
          .select('listing_id, label')
          .eq('active', true)
          .in('listing_id', ids)
          // Same window check as attachOffers — a rail listing an offer that
          // ended yesterday is a row that filters to cars showing a stale price.
          .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
          .or(`ends_at.is.null,ends_at.gte.${nowIso}`)
          .then(({ data, error }) => (error ? [] : data ?? []))
          .catch(() => [])
      : Promise.resolve([]),

    getSpecFacets(ids, locale).catch(() => []),

    kindsPromise,
  ]);

  const byLabel = new Map();
  const covered = new Set();
  for (const o of offerRows) {
    covered.add(o.listing_id);
    // An unnamed offer is an ordinary state (see listing_offers.label), so it
    // is counted but does not become a nameless row in the list.
    const key = o.label?.en || o.label?.ar;
    if (!key) continue;
    const entry = byLabel.get(key) ?? { value: key, label: o.label, count: 0 };
    entry.count += 1;
    byLabel.set(key, entry);
  }
  const offerCount = covered.size;
  const offerList = [...byLabel.values()].sort((a, b) => b.count - a.count);

  /**
   * Every OTHER catalog attribute kind — the marketplace's DynamicFacets.
   *
   * Condition, transmission, fuel, seats, year and mileage have sections of
   * their own, so they are excluded here; whatever else the catalog defines
   * gets a generic section built from the same kinds table the listing form
   * writes. That is what makes a new attribute appear in the rail without
   * anybody editing this file.
   */
  const DEDICATED = new Set(['condition', 'transmission', 'fuel', 'seats', 'year', 'mileage_km']);
  const kindFacets = kinds
    .filter((k) => !DEDICATED.has(k.kind))
    .map((k) => {
      const counts = new Map();
      for (const row of rows) {
        const v = row.attributes?.[k.kind];
        if (v == null || v === '') continue;
        counts.set(String(v), (counts.get(String(v)) ?? 0) + 1);
      }

      return {
        kind: k.kind,
        name: k.name,
        iconUrl: k.iconUrl ?? null,
        // Only options some live car actually has. The catalog lists every
        // option the platform knows; a rail offering all of them is a column
        // of rows that can only ever empty the grid.
        values: (k.options ?? [])
          .filter((o) => counts.has(o.slug))
          .map((o) => ({ value: o.slug, name: o.name, count: counts.get(o.slug) })),
      };
    })
    .filter((k) => k.values.length > 0);

  return {
    total: rows.length,
    priceRange: prices.length ? [Math.min(...prices), Math.max(...prices)] : [0, 0],
    yearRange: years.length ? [Math.min(...years), Math.max(...years)] : [0, 0],
    /* The years actually listed, newest first — a car buyer reads model years
       downwards, and the newest is what most people are after. A LIST rather
       than the span above, because the span had to be typed into two boxes and
       nobody shops for "2019 to 2023"; they pick the years they will accept. */
    years: tally((r) => r.attributes?.year).sort((a, b) => Number(b.value) - Number(a.value)),
    maxMileage: mileages.length ? Math.max(...mileages) : 0,
    cities: tally((r) => r.city),
    conditions: tally((r) => r.attributes?.condition),
    transmissions: tally((r) => r.attributes?.transmission),
    fuels: tally((r) => r.attributes?.fuel),
    vendors: [...vendorMap.values()].sort((a, b) => b.count - a.count),
    brands: [...brandMap.values()]
      .map((b) => ({
        ...b,
        models: [...b.models.values()].sort((x, y) => y.count - x.count),
      }))
      .sort((a, b) => b.count - a.count),
    colors: [...colorMap.values()].sort((a, b) => b.count - a.count),
    trimModels: [...trimModelMap.values()]
      .map((m) => ({ ...m, trims: [...m.trims.values()].sort((a, b) => b.count - a.count) }))
      .filter((m) => m.trims.length > 0),
    /* What "Special Features" can honestly offer. Each is present only when
       some live car actually has it — a "Featured" switch on a marketplace with
       no featured cars is a control that can only ever empty the grid. */
    features: {
      isFeatured: rows.some((r) => r.is_featured),
      isFeaturedCount: rows.filter((r) => r.is_featured).length,
      hasOffer: offerCount > 0,
      hasOfferCount: offerCount,
    },
    offers: offerList,
    kinds: kindFacets,
    specs: specFacets,
    // Seats is a number in the jsonb; sorted ASCENDING because 2, 4, 5, 7 is
    // the order a person reads them in, not commonest-first like the rest.
    seats: tally((r) => r.attributes?.seats).sort((a, b) => Number(a.value) - Number(b.value)),
  };
}

/**
 * How many live cars have a live offer on them.
 *
 * One number, for one decision: whether the header's "Cars with offers" entry
 * is shown at all. An entry that opens on an empty grid is worse than no
 * entry, and offers expire on their own — this is what lets the menu notice.
 *
 * The date window matches attachOffers and the filter rail's offers facet. All
 * three have to agree that an offer which ended yesterday is not an offer, or
 * the menu, the rail and the price on the card start telling different stories.
 *
 * Cached because it sits in the (browse) layout, so every full page load in the
 * marketplace would otherwise pay two more round trips before anything paints.
 */
/**
 * ── The clock is read INSIDE the cache, not outside it ──────────────────────
 *
 * This used to compute `new Date()` here, bucket it to the hour and pass it in
 * as an argument — on the reasoning that time is a runtime input and runtime
 * inputs belong outside a cached scope.
 *
 * That is right for a cookie and wrong for this, and `next build` says so:
 *
 *   Route "…/brands/[slug]" used `new Date()` before accessing either uncached
 *   data or Request data
 *
 * Under cacheComponents, a Server Component that reads the clock during
 * prerender has to prove it is already request-bound. This one is not — it is
 * in the (browse) LAYOUT, on a page being statically generated — so the build
 * failed on the placeholder brand page after 232 of 930 pages.
 *
 * The caching guide gives two ways out, and names this one for exactly this
 * shape: "cache the result so all users see the same value until revalidation"
 * (08-caching.md, "Working with non-deterministic operations"). The alternative
 * — await connection() — would make the header request-bound on every page in
 * the marketplace, which is the opposite of what a cached nav count is for.
 *
 * So the clock moves inside. The window is now fixed at the moment the entry is
 * written rather than at the moment it is read, and cacheLife('hours') is what
 * bounds the drift: an offer that ended is out of the count within the hour.
 * That was the honest trade all along — the hour-bucketed key was buying
 * freshness the cache lifetime already governs.
 */
export async function getNavData() {
  'use cache';
  cacheLife('hours');

  // Inside the cached scope, which is what makes it legal — and what fixes it
  // to one value for every visitor until the entry expires.
  const nowIso = new Date().toISOString();

  const db = getMarketplaceDb();

  const { data: rows, error } = await db
    .from('listings')
    .select('id')
    .eq('state', 'live')
    .eq('type', 'car');

  // A menu must never take the page down with it — and throwing inside a
  // `use cache` scope cancels the render outright.
  if (error) return { offerCount: 0 };

  const ids = (rows ?? []).map((r) => r.id).filter(Boolean);
  if (!ids.length) return { offerCount: 0 };

  const offerRows = await db
    .from('listing_offers')
    .select('listing_id')
    .eq('active', true)
    .in('listing_id', ids)
    .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
    .or(`ends_at.is.null,ends_at.gte.${nowIso}`)
    .then(({ data, error: e }) => (e ? [] : data ?? []))
    .catch(() => []);

  return { offerCount: new Set(offerRows.map((o) => o.listing_id)).size };
}

/* ── Brand pages ──────────────────────────────────────────────────────────── */

/**
 * Every brand that has a live car, with its logo and its count.
 *
 * The brands INDEX page. Deliberately not the whole catalog: `car_brands` holds
 * 26 makes because a seller has to be able to pick one when listing, and a
 * landing page full of makes with nothing behind them is 22 dead ends and 4
 * real pages, which is also how a directory page earns a thin-content
 * penalty. When a make gets its first car it appears here on its own.
 *
 * Models and years come along because the index card shows them and because
 * the same read backs the brand page's header — one query for both rather than
 * a count query per brand.
 */
export async function getBrandsIndex(locale = 'ar') {
  'use cache';
  cacheLife('hours');

  const db = getMarketplaceDb();

  const [brandsRes, modelsRes, rowsRes] = await Promise.all([
    db.from('car_brands').select('id, slug, name, logo_url, description').eq('active', true),
    db.from('car_models').select('id, slug').eq('active', true),
    db
      .from('listings')
      .select('brand_id, model_id, attributes')
      .eq('state', 'live')
      .eq('type', 'car'),
  ]);

  if (brandsRes.error) return [];

  /**
   * ── Grouped by SLUG, not by row id ────────────────────────────────────────
   *
   * Each showroom owns its own catalog rows now (schema.sql §30), so there is a
   * `toyota` row per showroom that sells Toyotas. Keying this page on the id
   * would print Toyota once per showroom — three identical cards, each with a
   * third of the cars — which is a directory page arguing with itself.
   *
   * The slug is what those rows agree on, and it is already the public URL:
   * /marketplace/brands/toyota is one page whatever number of private rows sit
   * behind it. So the rows stay private and the SLUG is the shared key.
   *
   * Models are counted the same way. Two showrooms both selling a Camry hold
   * two `camry` rows, and counting ids would report two models for one car.
   */
  const brandSlug = new Map((brandsRes.data ?? []).map((b) => [b.id, b.slug]));
  const modelSlug = new Map((modelsRes.data ?? []).map((m) => [m.id, m.slug]));

  const stats = new Map();
  for (const row of rowsRes.data ?? []) {
    const slug = brandSlug.get(row.brand_id);
    if (!slug) continue;

    const s = stats.get(slug) ?? { count: 0, models: new Set(), years: new Set() };
    s.count += 1;
    // Fall back to the id for a model whose row was not read — better a count
    // that is one too many than a model silently dropped from the total.
    if (row.model_id) s.models.add(modelSlug.get(row.model_id) ?? row.model_id);
    if (row.attributes?.year) s.years.add(String(row.attributes.year));
    stats.set(slug, s);
  }

  /* One card per slug. The representative row is the first with a logo, so a
     showroom that never uploaded one does not decide the page is logo-less for
     everybody. */
  const pick = new Map();
  for (const b of brandsRes.data ?? []) {
    if (!stats.has(b.slug)) continue;
    const held = pick.get(b.slug);
    if (!held || (!held.logo_url && b.logo_url)) pick.set(b.slug, b);
  }

  return [...pick.values()]
    .map((b) => {
      const s = stats.get(b.slug);
      return {
        id: b.id,
        slug: b.slug,
        name: b.name,
        description: b.description ?? null,
        logoUrl: b.logo_url ?? null,
        count: s.count,
        modelCount: s.models.size,
        yearCount: s.years.size,
      };
    })
    .sort(
      (a, b) =>
        b.count - a.count ||
        String(a.name?.en ?? a.slug).localeCompare(String(b.name?.en ?? b.slug)),
    );
}

/**
 * One brand by slug, or null.
 *
 * Reads the index and picks — so a brand with no live cars is `null` here and
 * its page 404s, which is the same rule the index uses to decide what to list.
 * Two rules would mean a make you can reach from nowhere but that still
 * resolves, and Google finding it.
 *
 * A dedicated single-row query would be one round trip instead of two, but the
 * index is cached and this page is one of a handful of slugs — the shared entry
 * is warm long before anyone reaches a brand page.
 */
export async function getBrandBySlug(slug, locale = 'ar') {
  if (!slug) return null;
  const brands = await getBrandsIndex(locale);
  return brands.find((b) => b.slug === slug) ?? null;
}
