import { getMarketplaceDb } from '@/marketplace/db/client';
import { attachOffers } from './offers';
import type { LooseRow } from '@/marketplace/lib/row';

/**
 * Reads against DB2. Server-only — these run with the secret key, so every
 * query filters `state = 'live'` explicitly rather than leaning on RLS. RLS is
 * the backstop for the anon key, not the filter for server reads.
 */

// Joined shape every listing read returns, so normalizeListing() always has the
// vendor and category it expects.
const SELECT = `
  id, slug, type, state, name, description,
  price, compare_at, vat_included, stock, attributes, media, city, views,
  published_at, is_featured,
  vendors ( id, slug, name, verified, rating_avg, rating_count ),
  car_brands ( id, slug, name, logo_url ),
  categories ( id, slug, name )
`;

/**
 * The CARD select — deliberately not SELECT above.
 *
 * A list endpoint is asked for twenty or fifty rows at a time, and the full
 * shape carries the things that make that expensive: `description` — a whole
 * bilingual body per row — and the category join nobody reads on a card.
 * Dropping those two is most of the payload.
 *
 * `state` and `stock` stay despite not appearing on a card: normalizeListing()
 * derives `inStock` from them, and getRelatedListings feeds it these rows.
 * Trimming them made every related car read as out of stock.
 *
 * `media` still comes across whole because PostgREST cannot slice a jsonb array
 * in a select — the trim to one image happens in the serializer, which at least
 * keeps it off the wire to the client.
 */
const CARD_SELECT = `
  id, slug, type, state, name,
  price, compare_at, vat_included, stock, attributes, media, city, views,
  published_at, is_featured,
  vendors ( id, slug, name, verified, rating_avg, rating_count ),
  car_brands ( id, slug, name, logo_url )
`;

/**
 * The DETAIL select — one row, so it can afford every column a car page or the
 * public API might want.
 *
 * Split out from SELECT because the shared one is tuned for lists and omits
 * nine fields the detail response advertises: currency, availability, warranty,
 * origin, test-drive flag, the three SEO fields and updated_at. Serving those
 * as null was worse than not offering them — `seo.title: {}` read as "this car
 * has no meta title" when it meant "nobody asked the database for it".
 */
const DETAIL_SELECT = `
  id, slug, type, state, name, description,
  price, compare_at, vat_included, currency, available_on_request, stock,
  attributes, media, city, views,
  brand_id, model_id, year_id, trim_id,
  warranty_months, country_of_origin, has_test_drive, part_number,
  meta_title, meta_description, meta_keywords, canonical_url,
  focus_keyword, seo_index, seo_follow, seo_priority, seo_changefreq,
  og_title, og_description, og_image_url, og_type,
  twitter_card, twitter_title, twitter_description, twitter_image_url,
  structured_data,
  published_at, updated_at,
  vendors ( id, slug, name, verified, rating_avg, rating_count ),
  car_brands ( id, slug, name, logo_url ),
  car_trims ( id, name ),
  categories ( id, slug, name )
`;

const SORTS = {
  newest: { column: 'published_at', ascending: false },
  price_asc: { column: 'price', ascending: true },
  price_desc: { column: 'price', ascending: false },
  popular: { column: 'views', ascending: false },
};

/**
 * @param {object} opts
 * @param {string} [opts.type]        part | car | service | accessory
 * @param {string} [opts.categoryId]
 * @param {string} [opts.vendorId]
 * @param {string} [opts.city]
 * @param {number} [opts.minPrice]
 * @param {number} [opts.maxPrice]
 * @param {string} [opts.q]           free text over title
 * @param {string} [opts.sort]        key of SORTS
 * @param {number} [opts.limit]
 * @param {number} [opts.offset]
 * @returns {Promise<{items: object[], total: number}>}
 */
export async function getLiveListings(opts = {}) {
  return runLiveQuery(opts, SELECT);
}

/**
 * The filter / sort / page logic, shared by the full and card readers.
 *
 * Only the column list differs between them, so it is the only thing passed in.
 * Duplicating the twelve filters instead would guarantee they drift, and a
 * card grid quietly ignoring ?city is a bug nobody notices for a month.
 */
async function runLiveQuery(opts: LooseRow, select: string) {
  const {
    type, categoryId, vendorId, city,
    minPrice, maxPrice, q,
    sort = 'newest', limit = 24, offset = 0,
  } = opts;

  let query = getMarketplaceDb()
    .from('listings')
    .select(select, { count: 'exact' })
    .eq('state', 'live');

  if (type) query = query.eq('type', type);
  if (categoryId) query = query.eq('category_id', categoryId);
  if (vendorId) query = query.eq('vendor_id', vendorId);
  if (city) query = query.eq('city', city);
  if (minPrice != null) query = query.gte('price', minPrice);
  if (maxPrice != null) query = query.lte('price', maxPrice);

  // Search both language columns — an Arabic query must still match an English
  // title and vice versa, since vendors do not fill both consistently.
  if (q) {
    const safe = q.replace(/[%,()]/g, ' ').trim();
    if (safe) query = query.or(`name->>ar.ilike.%${safe}%,name->>en.ilike.%${safe}%`);
  }

  const order = SORTS[sort as keyof typeof SORTS] ?? SORTS.newest;
  query = query.order(order.column, { ascending: order.ascending, nullsFirst: false });
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(`getLiveListings: ${error.message}`);
  await attachOffers(data);
  return { items: data ?? [], total: count ?? 0 };
}


/**
 * One page of live listings in the CARD shape.
 *
 * Same filters and sorts as getLiveListings, different column list. Kept as a
 * sibling rather than a `fields` option on that one, because the two answer
 * different questions — "show me a grid" and "show me this car" — and a flag
 * that silently halves a returned row is the kind of thing a caller finds out
 * about through a missing property at runtime.
 */
export async function getLiveListingCards(opts = {}) {
  return runLiveQuery(opts, CARD_SELECT);
}

export async function getListingBySlug(slug: string) {
  const { data, error } = await getMarketplaceDb()
    .from('listings')
    .select(DETAIL_SELECT)
    .eq('slug', slug)
    .eq('state', 'live')
    .maybeSingle();

  if (error) throw new Error(`getListingBySlug: ${error.message}`);
  await attachOffers(data);
  return data;
}

/**
 * Every live car's slug, for generateStaticParams.
 *
 * The slug column and nothing else. This runs once for the whole table at
 * build time, and reading a full row to use one field is the difference
 * between a query that stays cheap at ten thousand cars and one that does not.
 *
 * Live only, for the same reason getListingBySlug filters on it: a draft has
 * no page. Prerendering one would bake a 404 at that URL and go on serving it
 * after the seller publishes.
 *
 * Newest first and capped, so the cost of a build has a ceiling. Cars past the
 * cap are not lost — see the note on dynamicParams where this is called.
 */
export async function getLiveListingSlugs(limit = 500) {
  const { data, error } = await getMarketplaceDb()
    .from('listings')
    .select('slug')
    .eq('state', 'live')
    .not('slug', 'is', null)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw new Error(`getLiveListingSlugs: ${error.message}`);
  return (data ?? []).map((r) => r.slug).filter(Boolean);
}

/**
 * The home page's featured row: cars an admin has featured (approved boosts)
 * first, most viewed among them, then the most viewed of the rest to fill the
 * row. A marketplace with no boosts running still shows a full row.
 */
export async function getFeaturedListings(limit = 8) {
  const { data, error } = await getMarketplaceDb()
    .from('listings')
    .select(SELECT)
    .eq('state', 'live')
    .eq('is_featured', true)
    .order('views', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`getFeaturedListings: ${error.message}`);

  const featured = (data ?? []) as LooseRow[];
  await attachOffers(featured);
  if (featured.length >= limit) return featured;

  const { items } = await getLiveListings({ sort: 'popular', limit: limit + featured.length });
  const seen = new Set(featured.map((r) => r.id));
  return [...featured, ...(items as LooseRow[]).filter((r) => !seen.has(r.id))].slice(0, limit);
}

/**
 * The same car in its other trims — GL beside GLX, the strip the main site
 * calls "Variants".
 *
 * Same brand, same model, same year, different listing. NOT the same as
 * getRelatedListings, which casts a category-wide net for the "Similar cars"
 * row at the foot of the page: this one is the same vehicle at a different
 * spec, so it belongs in the buy panel next to the price it is being compared
 * against.
 *
 * Returns [] until a second trim of the same car is listed, and the strip
 * renders nothing in that case — a "Variants" heading over one card is a
 * choice with nothing to choose.
 */
export async function getSiblingTrims(listing: LooseRow | null | undefined, limit = 6) {
  if (!listing?.brand_id || !listing?.model_id) return [];

  let q = getMarketplaceDb()
    .from('listings')
    .select(`${CARD_SELECT}, trim_id, car_trims ( id, name )`)
    .eq('state', 'live')
    .eq('brand_id', listing.brand_id)
    .eq('model_id', listing.model_id)
    .neq('id', listing.id)
    .order('price', { ascending: true })
    .limit(limit);

  // Year narrows it when the listing has one. A 2026 GLX beside a 2019 GL is
  // not the same choice.
  if (listing.year_id) q = q.eq('year_id', listing.year_id);

  // A DIFFERENT trim, not merely a different listing. Two sellers listing the
  // same GL are competitors, not variants — that belongs in search results,
  // not in a strip that reads "here is the same car in another spec".
  if (listing.trim_id) q = q.neq('trim_id', listing.trim_id);

  const { data, error } = await q;
  if (error) throw new Error(`getSiblingTrims: ${error.message}`);
  await attachOffers(data);
  return data ?? [];
}

/** Same category, excluding the listing itself. */
export async function getRelatedListings(listing: LooseRow | null | undefined, limit = 4) {
  if (!listing?.categories?.id) return [];
  // CARD_SELECT: related cars are rendered as tiles in every caller, so pulling
  // four full descriptions for a strip below the fold is waste.
  const { data, error } = await getMarketplaceDb()
    .from('listings')
    .select(CARD_SELECT)
    .eq('state', 'live')
    .eq('category_id', listing.categories.id)
    .neq('id', listing.id)
    .limit(limit);

  if (error) throw new Error(`getRelatedListings: ${error.message}`);
  await attachOffers(data);
  return data ?? [];
}
