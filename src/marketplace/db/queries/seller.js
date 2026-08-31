import { getMarketplaceDb } from '@/marketplace/db/client';
import { getViewer } from '@/marketplace/auth/session';
import { OPEN_STAGES } from '@/marketplace/db/queries/leads';

/**
 * Seller-side reads, scoped to one vendor.
 *
 * NO AUTH YET — every function takes vendorId explicitly and the page passes it
 * from a picker. When auth lands, the caller resolves it from the session
 * instead; none of these signatures change.
 */

const LISTING_SELECT = `
  id, slug, type, state, name, price, compare_at, stock,
  attributes, media, city, views, published_at, created_at,
  car_brands ( name ),
  car_models ( name )
`;

export async function getVendorListings(vendorId, { state, q, limit = 50, offset = 0 } = {}) {
  if (!vendorId) return { items: [], total: 0 };

  let query = getMarketplaceDb()
    .from('listings')
    .select(LISTING_SELECT, { count: 'exact' })
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (state) query = query.eq('state', state);

  // Title in either language, plus the slug — a seller who knows the URL should
  // find the row by pasting it. `%`, `,` and brackets are stripped because
  // PostgREST parses .or() as a comma-separated list and would read them as
  // syntax; the same guard the cars search uses.
  if (q) {
    const safe = String(q).replace(/[%,()]/g, ' ').trim();
    if (safe) {
      query = query.or(
        `name->>ar.ilike.%${safe}%,name->>en.ilike.%${safe}%,slug.ilike.%${safe}%`
      );
    }
  }

  const { data, error, count } = await query;
  if (error) throw new Error(`getVendorListings: ${error.message}`);
  return { items: data ?? [], total: count ?? 0 };
}

/**
 * Dashboard counters. All head-only count queries — PostgREST returns the count
 * in a header and skips the body, so this stays cheap as inventory grows.
 */
export async function getSellerStats(vendorId) {
  if (!vendorId) return null;
  const db = getMarketplaceDb();

  const countBy = (state) =>
    db.from('listings').select('id', { count: 'exact', head: true })
      .eq('vendor_id', vendorId).eq('state', state);

  const [live, draft, pending, rejected, sold, leads, views] = await Promise.all([
    countBy('live'),
    countBy('draft'),
    countBy('pending_review'),
    countBy('rejected'),
    countBy('sold_out'),
    // The stages a seller still has work to do on. Not wrapped in a try: a
    // rejected promise here would take the whole dashboard down, so the count
    // is read defensively below instead.
    db.from('leads').select('id', { count: 'exact', head: true })
      .eq('vendor_id', vendorId).in('stage', OPEN_STAGES).is('deleted_at', null),
    db.from('listings').select('views').eq('vendor_id', vendorId),
  ]);

  return {
    live: live.count ?? 0,
    draft: draft.count ?? 0,
    pending: pending.count ?? 0,
    rejected: rejected.count ?? 0,
    sold: sold.count ?? 0,
    // Null on a database that has not run schema.sql §21 yet — the page deploys
    // before the SQL is run, always in that order, and a dashboard that 500s
    // over a counter is worse than one showing zero.
    openLeads: leads.count ?? 0,
    totalViews: (views.data ?? []).reduce((sum, r) => sum + (r.views ?? 0), 0),
  };
}

/**
 * The showrooms the CALLER may act for.
 *
 * This is the chokepoint for the whole seller dashboard, and it is worth being
 * explicit about why it lives here rather than in each page.
 *
 * Every seller page follows the same shape: read the options, then take
 * `?vendor=` if it names one of them and the first otherwise. When this
 * returned every approved vendor on the platform, that shape meant a logged-out
 * stranger opening /marketplace/seller/listings WAS the first showroom, and any
 * seller could read and write any other seller's data by editing one query
 * parameter.
 *
 * Scoping the list fixes all of it at the source: `vendors[0]` becomes "my
 * first showroom", and `?vendor=` can only ever select from a list that is
 * already mine, because the pages match against this array. Nine call sites
 * became correct without any of them changing — which is the point of putting
 * the rule next to the data instead of next to the UI.
 *
 * Staff still see everything: moderating a listing means opening the showroom
 * that owns it.
 *
 * NOT the last line of defence. The RLS policies are, and every write action
 * re-derives the vendor from the session rather than trusting a form field.
 */
export async function getVendorOptions() {
  const viewer = await getViewer();

  // Signed out, or signed in with no showroom: nothing to pick from. An empty
  // list is what the pages already handle — they render "no vendor" rather
  // than falling over.
  if (!viewer) return [];
  if (!viewer.isStaff && !viewer.vendorIds.length) return [];

  let query = getMarketplaceDb()
    .from('vendors')
    // logo_url is here for the dashboard sidebar, which shows the showroom's
    // own mark rather than a generic marketplace label.
    .select('id, slug, name, verified, city, logo_url')
    .eq('state', 'approved')
    .order('name->>en', { ascending: true });

  if (!viewer.isStaff) query = query.in('id', viewer.vendorIds);

  const { data, error } = await query;

  if (error) throw new Error(`getVendorOptions: ${error.message}`);
  return data ?? [];
}

/**
 * A showroom's payouts, newest period first.
 *
 * Read-only from the seller's side by design: a payout is the platform's
 * statement of what it owes, and a recipient who can edit it is not a
 * statement. The RLS policy says the same thing independently — sellers get
 * select, staff get write.
 */
export async function getVendorPayouts(vendorId, { limit = 24, offset = 0 } = {}) {
  if (!vendorId) return { items: [], total: 0 };

  const { data, error, count } = await getMarketplaceDb()
    .from('payouts')
    .select('*', { count: 'exact' })
    .eq('vendor_id', vendorId)
    .order('period_end', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(`getVendorPayouts: ${error.message}`);
  return { items: data ?? [], total: count ?? 0 };
}

/**
 * The headline numbers above the table.
 *
 * `paid` is money already sent and `pending` is everything not yet paid —
 * draft and approved together, because from a seller's side "approved but not
 * in my bank" and "not approved yet" are both money they are still waiting for.
 * Failed is separate: it is the only one that needs them to do something.
 */
export async function getPayoutTotals(vendorId) {
  if (!vendorId) return { paid: 0, pending: 0, failed: 0, currency: 'SAR' };

  const { data, error } = await getMarketplaceDb()
    .from('payouts')
    .select('state, net')
    .eq('vendor_id', vendorId);

  if (error) throw new Error(`getPayoutTotals: ${error.message}`);

  const totals = { paid: 0, pending: 0, failed: 0, currency: 'SAR' };
  for (const row of data ?? []) {
    const net = Number(row.net) || 0;
    if (row.state === 'paid') totals.paid += net;
    else if (row.state === 'failed') totals.failed += net;
    else totals.pending += net;
  }
  return totals;
}

/**
 * Reviews left on a showroom, newest first.
 *
 * Hidden ones are INCLUDED. A seller needs to see a review that moderation took
 * down — it is about them, and hiding it from them as well means they find out
 * their rating dropped and cannot see why.
 */
export async function getVendorReviews(vendorId, { limit = 24, offset = 0 } = {}) {
  if (!vendorId) return { items: [], total: 0 };

  const { data, error, count } = await getMarketplaceDb()
    .from('reviews')
    .select(
      `id, rating, body, verified_purchase, vendor_reply, vendor_replied_at,
       hidden, hidden_reason, created_at,
       listings ( id, slug, name, media )`,
      { count: 'exact' }
    )
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(`getVendorReviews: ${error.message}`);
  return { items: data ?? [], total: count ?? 0 };
}

/**
 * The rating summary — average, count, and the 5→1 histogram.
 *
 * Computed from visible reviews only, because that is what a buyer sees on the
 * storefront and a seller comparing the two should get the same number.
 */
export async function getReviewSummary(vendorId) {
  const empty = { average: 0, total: 0, unanswered: 0, buckets: [0, 0, 0, 0, 0] };
  if (!vendorId) return empty;

  const { data, error } = await getMarketplaceDb()
    .from('reviews')
    .select('rating, vendor_reply')
    .eq('vendor_id', vendorId)
    .eq('hidden', false);

  if (error) throw new Error(`getReviewSummary: ${error.message}`);

  const rows = data ?? [];
  if (!rows.length) return empty;

  // buckets[0] is five stars, so the bar chart reads top-down without the
  // component having to reverse it.
  const buckets = [0, 0, 0, 0, 0];
  let sum = 0;
  let unanswered = 0;

  for (const r of rows) {
    const rating = Math.min(5, Math.max(1, Number(r.rating) || 0));
    buckets[5 - rating] += 1;
    sum += rating;
    if (!r.vendor_reply) unanswered += 1;
  }

  return {
    average: sum / rows.length,
    total: rows.length,
    unanswered,
    buckets,
  };
}

/**
 * The showroom's offers, newest first, each with the car it discounts.
 *
 * The listing is embedded rather than looked up per row because the page shows
 * the car's name and its ordinary price beside every offer — a list of "10%
 * off" with no indication of what is discounted is unreadable.
 *
 * `active = false` rows come back too: a paused offer is one a seller is most
 * likely to be looking for, and hiding it would make "where did it go" the
 * first question the page provokes.
 */
export async function getVendorOffers(vendorId) {
  if (!vendorId) return [];

  const { data, error } = await getMarketplaceDb()
    .from('listing_offers')
    .select(
      /**
       * Every column the EDIT FORM prefills from, not just the ones the list
       * prints.
       *
       * `offer_name_id` was missing, and the failure was silent and
       * destructive: the row is what openForm() reads, so the name picker came
       * up blank on every edit — and because the form posts what the picker
       * holds, saving a date change then cleared the offer's name. A field the
       * seller never touched, wiped by opening the form.
       *
       * The rule this is an instance of: an in-place edit reads the LIST row,
       * so the list query has to select everything the form writes back, or the
       * form silently blanks the difference.
       */
      /**
       * A plain COLUMN, not an `offer_names ( … )` embed.
       *
       * The embed would resolve through the schema cache, so on a database
       * where §25.1 has not been run the whole select fails and the seller's
       * offers vanish — the same failure attachOffers() exists to avoid. It is
       * not needed either: the list prints the `label` snapshot, and the edit
       * picker resolves the current name from the catalog list by this id.
       */
      `id, label, offer_name_id, discount_type, discount_value,
       starts_at, ends_at, active, created_at,
       listings ( id, slug, name, price, state, media )`
    )
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false });

  /**
   * Tolerant for the same reason attachOffers() is: schema.sql §25 may not have
   * been run yet, and a seller opening Offers should be told there are none
   * rather than shown a 500 with a Postgres error in it.
   */
  if (error) {
    console.warn(
      `[offers] getVendorOffers: ${error.message}. Run src/marketplace/db/schema.sql §25 on this database.`
    );
    return [];
  }
  return data ?? [];
}

/**
 * The cars this seller can put an offer on.
 *
 * Drafts are included on purpose — a seller preparing a launch sets the price
 * and the offer together, and being unable to until the car is published is an
 * ordering rule with no reason behind it. Removed listings are not: there is
 * nothing left to discount.
 */
export async function getOfferableListings(vendorId) {
  if (!vendorId) return [];

  const { data, error } = await getMarketplaceDb()
    .from('listings')
    .select('id, slug, name, price, state')
    .eq('vendor_id', vendorId)
    .neq('state', 'removed')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`getOfferableListings: ${error.message}`);
  return data ?? [];
}
