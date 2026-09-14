import { getMarketplaceDb } from '@/marketplace/db/client';

/**
 * What a BUYER's own pages read.
 *
 * Separate from queries/seller.js on purpose: that file answers "what does this
 * showroom own", this one answers "what has this person done". They scope by
 * different columns and neither should grow a flag to become the other.
 *
 * Every function takes the user id explicitly. Resolving the session in here
 * would make these untestable and hide the one thing a reader needs to check —
 * that the caller passed the right person.
 */

/**
 * The card shape, matched to getLiveListingCards() so the same ListingCard
 * renders both. Nested under `listings` because these come through a join.
 */
const CARD = `
  id, slug, type, state, name,
  price, compare_at, vat_included, stock, attributes, media, city, views,
  published_at,
  vendors ( id, slug, name, verified, rating_avg, rating_count ),
  car_brands ( id, slug, name, logo_url )
`;

/**
 * Saved cars, newest first.
 *
 * A car that was taken down is dropped rather than shown as a dead card: the
 * row survives in saved_listings (the foreign key only cascades on delete), so
 * without the state filter a buyer's list slowly fills with cars they cannot
 * click. `!inner` puts that filter in the database instead of in JS, so the
 * count and the page size stay honest.
 */
export async function getSavedListings(userId: string, { limit = 24, offset = 0 }: { limit?: number; offset?: number } = {}) {
  const { data, error, count } = await getMarketplaceDb()
    .from('saved_listings')
    .select(`id, created_at, listings!inner ( ${CARD} )`, { count: 'exact' })
    .eq('user_id', userId)
    .eq('listings.state', 'live')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(`getSavedListings: ${error.message}`);

  return {
    items: (data ?? []).map((row) => row.listings).filter(Boolean),
    total: count ?? 0,
  };
}

/** Just the ids — for marking hearts as already-saved across a grid. */
export async function getSavedIds(userId: string) {
  if (!userId) return new Set();

  const { data, error } = await getMarketplaceDb()
    .from('saved_listings')
    .select('listing_id')
    .eq('user_id', userId);

  if (error) return new Set();
  return new Set((data ?? []).map((r) => r.listing_id));
}

/**
 * The buyer's own requests — what they sent, and to whom.
 *
 * Read-only on this side. A request is a record the SHOWROOM works; the buyer's
 * copy exists so they can see what they asked for and which showroom has it,
 * not so they can edit a row a salesperson is already acting on.
 *
 * The vendor is joined; the listing is not. `listing_title` is snapshotted onto
 * the row, so the request still reads after the car is sold — which is exactly
 * when a join would return null and the page would show a request about
 * nothing.
 */
export async function getBuyerRequests(userId: string, { limit = 50, offset = 0 }: { limit?: number; offset?: number } = {}) {
  const { data, error, count } = await getMarketplaceDb()
    .from('leads')
    .select(
      `id, listing_id, listing_title, message, answers, stage, created_at,
       contact_phone, contact_email, cancelled_at,
       vendors ( id, slug, name, verified )`,
      { count: 'exact' }
    )
    .eq('buyer_user_id', userId)
    // Cleared off this buyer's list — the row is untouched and the showroom
    // still has it. See schema.sql §21.8.
    .is('buyer_hidden_at', null)
    // Deleted by the showroom (§21.3.1). It is in their bin for 30 days, but
    // from the buyer's side it is gone — showing a request nobody is working
    // would be worse than showing nothing.
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  // 42P01 — schema.sql §21 has not been run on this database. An empty list is
  // the honest answer; a 500 on the account page is not.
  if (error) {
    if (error.code === '42P01') return { items: [], total: 0, missing: true };

    // 42703 — §21.8 has not been run, so there is no buyer_hidden_at to filter
    // on. Retried WITHOUT the filter rather than failing: a buyer seeing one
    // request they had cleared is a far better outcome than an error page where
    // their requests should be.
    if (error.code === '42703') {
      const retry = await getMarketplaceDb()
        .from('leads')
        .select(
          `id, listing_id, listing_title, message, answers, stage, created_at,
           contact_phone, contact_email, cancelled_at,
           vendors ( id, slug, name, verified )`,
          { count: 'exact' }
        )
        .eq('buyer_user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (retry.error) throw new Error(`getBuyerRequests: ${retry.error.message}`);
      return { items: retry.data ?? [], total: retry.count ?? 0 };
    }

    throw new Error(`getBuyerRequests: ${error.message}`);
  }

  return { items: data ?? [], total: count ?? 0 };
}

/**
 * The numbers on the account home.
 *
 * `head: true` means PostgREST returns the count in a header and no rows at
 * all — four counts for four requests' worth of headers, rather than four
 * lists nobody is going to render.
 */
/**
 * Just the saved count, for the header badge.
 *
 * Separate from getAccountCounts because the header runs on EVERY marketplace
 * page and that function is four count queries — three of which the badge does
 * not draw. `head: true` sends no rows at all, so this is a count and nothing
 * else.
 *
 * Errors are swallowed rather than thrown: a badge is decoration, and a header
 * that fails to render takes the whole page with it.
 */
export async function getSavedCount(userId: string) {
  if (!userId) return 0;

  const { count, error } = await getMarketplaceDb()
    .from('saved_listings')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  return error ? 0 : (count ?? 0);
}

export async function getAccountCounts(userId: string) {
  const db = getMarketplaceDb();

  const [saved, requests, orders, bookings] = await Promise.all([
    db.from('saved_listings').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    db.from('leads').select('id', { count: 'exact', head: true })
      .eq('buyer_user_id', userId).is('deleted_at', null),
    db.from('orders').select('id', { count: 'exact', head: true }).eq('buyer_user_id', userId),
    db.from('bookings').select('id', { count: 'exact', head: true }).eq('buyer_user_id', userId),
  ]);

  return {
    saved: saved.count ?? 0,
    // Null before schema.sql §21 has been run — the page deploys before the SQL
    // does, always in that order, and a tile showing zero beats a 500.
    requests: requests.count ?? 0,
    orders: orders.count ?? 0,
    bookings: bookings.count ?? 0,
  };
}

/**
 * Delivery addresses, the default first.
 *
 * Two sorts, in that order: `is_default` descending puts the chosen one at the
 * top, and created_at breaks the tie so the rest keep a stable order between
 * requests rather than shuffling on every load.
 */
export async function getAddresses(userId: string) {
  const { data, error } = await getMarketplaceDb()
    .from('addresses')
    .select('*')
    .eq('user_id', userId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) throw new Error(`getAddresses: ${error.message}`);
  return data ?? [];
}


