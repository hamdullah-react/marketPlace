import 'server-only';

/**
 * Boost requests — a vendor asking for a car to be featured for a while, and
 * an admin deciding. See the BOOSTS section at the end of schema.sql.
 *
 * Every reader returns `ready: false` instead of throwing when the table does
 * not exist yet, so the seller table and the admin panel keep working before
 * the SQL has been run.
 */

import { getMarketplaceDb } from '@/marketplace/db/client';
import { isMissingSchema } from './engagement';

// `*` rather than a column list, so the page keeps working whether or not the
// price column (BOOST PLANS AND PRICES section) exists yet.
const BOOST_SELECT = `
  *,
  listings ( id, slug, name, price, media, state, views, is_featured ),
  vendors ( id, slug, name, verified )
`;

/**
 * For the seller's table: each listing's open request and running boost.
 * Returns { ready, byListing: Map<listingId, { pending, active }> }.
 */
export async function getBoostsForListings(listingIds) {
  const byListing = new Map();
  if (!listingIds?.length) return { ready: true, byListing };

  const { data, error } = await getMarketplaceDb()
    .from('listing_boosts')
    .select('id, listing_id, days, state, starts_at, ends_at, created_at')
    .in('listing_id', listingIds)
    .in('state', ['pending', 'approved'])
    .order('created_at', { ascending: false });

  if (error) {
    const missing = isMissingSchema(error);
    if (!missing) console.error('[boosts] getBoostsForListings:', error.message);
    return { ready: !missing, byListing };
  }

  const now = Date.now();
  for (const row of data ?? []) {
    const entry = byListing.get(row.listing_id) ?? { pending: null, active: null };
    if (row.state === 'pending' && !entry.pending) entry.pending = row;
    if (row.state === 'approved' && !entry.active && row.ends_at && Date.parse(row.ends_at) > now) {
      entry.active = row;
    }
    byListing.set(row.listing_id, entry);
  }

  return { ready: true, byListing };
}

/**
 * For the admin page. `tab` is pending (oldest first — first come, first
 * served), active (running now) or history (everything decided and over).
 */
export async function listBoosts({ tab = 'pending', limit = 100 } = {}) {
  const nowIso = new Date().toISOString();
  let query = getMarketplaceDb().from('listing_boosts').select(BOOST_SELECT).limit(limit);

  if (tab === 'active') {
    query = query.eq('state', 'approved').gt('ends_at', nowIso).order('ends_at', { ascending: true });
  } else if (tab === 'history') {
    query = query
      .or(`state.in.(rejected,cancelled,expired),and(state.eq.approved,ends_at.lte.${nowIso})`)
      .order('created_at', { ascending: false });
  } else {
    query = query.eq('state', 'pending').order('created_at', { ascending: true });
  }

  const { data, error } = await query;
  if (error) {
    const missing = isMissingSchema(error);
    if (!missing) console.error('[boosts] listBoosts:', error.message);
    return { ready: !missing, items: [] };
  }
  return { ready: true, items: data ?? [] };
}

/** A seller's own requests, newest first, for their Promotions page. */
export async function getVendorBoosts(vendorId, limit = 50) {
  if (!vendorId) return { ready: true, items: [] };

  const { data, error } = await getMarketplaceDb()
    .from('listing_boosts')
    .select('*, listings ( id, slug, name, media, state )')
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    const missing = isMissingSchema(error);
    if (!missing) console.error('[boosts] getVendorBoosts:', error.message);
    return { ready: !missing, items: [] };
  }

  // Decided here rather than in the page: "still running" depends on the
  // clock, and a component must not read the clock while rendering.
  const now = Date.now();
  const items = (data ?? []).map((b) => ({
    ...b,
    running: b.state === 'approved' && Boolean(b.ends_at) && Date.parse(b.ends_at) > now,
  }));
  return { ready: true, items };
}

/**
 * The seller's live cars for the "Boost a car" picker, each marked with why
 * it cannot be boosted right now (already waiting, or already featured).
 */
export async function getBoostableListings(vendorId) {
  if (!vendorId) return [];

  const { data, error } = await getMarketplaceDb()
    .from('listings')
    .select('id, name, is_featured')
    .eq('vendor_id', vendorId)
    .eq('state', 'live')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(200);

  if (error) {
    console.error('[boosts] getBoostableListings:', error.message);
    return [];
  }

  const rows = data ?? [];
  const { byListing } = await getBoostsForListings(rows.map((r) => r.id));

  return rows.map((r) => {
    const b = byListing.get(r.id);
    return {
      id: r.id,
      name: r.name,
      pending: Boolean(b?.pending),
      activeUntil: b?.active?.ends_at ?? null,
    };
  });
}

/**
 * The boost plans an admin has created — length in days and price, shortest
 * first. Nothing is built in: no rows means sellers are told boosts are not
 * available yet. `ready` is false until the BOOST PLANS AND PRICES section of
 * schema.sql has been run.
 */
export async function getBoostPlans({ activeOnly = false } = {}) {
  let query = getMarketplaceDb()
    .from('boost_plans')
    .select('id, days, price, active')
    .order('days', { ascending: true });

  if (activeOnly) query = query.eq('active', true);

  const { data, error } = await query;

  if (error) {
    if (!isMissingSchema(error)) console.error('[boosts] getBoostPlans:', error.message);
    return { ready: false, plans: [] };
  }

  return {
    ready: true,
    plans: (data ?? []).map((p) => ({
      id: p.id,
      days: p.days,
      price: Number(p.price),
      active: p.active !== false,
    })),
  };
}

/** The sidebar badge. Zero when the table is missing — nothing can be pending. */
export async function countPendingBoosts() {
  const { count, error } = await getMarketplaceDb()
    .from('listing_boosts')
    .select('id', { count: 'exact', head: true })
    .eq('state', 'pending');
  return error ? 0 : count ?? 0;
}
