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
  listings ( id, slug, name, price, media, state, views, is_featured, featured_rank ),
  vendors ( id, slug, name, verified )
`;

/* featured_rank arrives with schema.sql and code ships before the SQL is run.
   A select naming a column the database lacks fails the WHOLE query, and the
   admin's boost queue must not go blank over an ordering column. */
const BOOST_SELECT_BASE = BOOST_SELECT.replace(', featured_rank', '');

/**
 * For the seller's table: each listing's open request and running boost.
 * Returns { ready, byListing: Map<listingId, { pending, active }> }.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Put a paid promotion on air, and take it off again.
 *
 * ── Approval is not the moment a car gets featured any more ─────────────────
 *
 * It used to be: an admin pressed Approve and the car went to the top of the
 * grid with a "Featured" badge, while the charge for it sat unpaid — so a
 * showroom got everything it had asked for and the invoice was a formality it
 * could ignore. Approval now only says the platform AGREED to run it; the
 * placement starts when the money is recorded.
 *
 * ── Which is why this is a function and not two copies ──────────────────────
 *
 * Two paths reach it — a payment recorded on Finance, and an admin granting a
 * free promotion outright — and a third takes it down again when a payment is
 * undone. Written out at each call site, the day somebody adds a fourth is the
 * day one of them forgets to set featured_until and a boost runs for ever.
 *
 * The clock starts NOW, not at approval: a showroom that pays a week late gets
 * its full run, because what it bought was a number of days on the grid rather
 * than a date range it partly missed.
 *
 * Stacking is preserved — a car already featured has the new days added to the
 * end of the current run rather than overlapping it.
 */
export async function activateBoost(boostId, { now = Date.now() } = {}) {
  if (!boostId) return { ok: false, error: 'NO_BOOST' };

  const db = getMarketplaceDb();

  const { data: boost, error } = await db
    .from('listing_boosts')
    .select('id, listing_id, vendor_id, days, state, listings ( id, state, featured_until )')
    .eq('id', boostId)
    .maybeSingle();

  if (error) return { ok: false, error: 'SAVE_FAILED', detail: error.message };
  if (!boost) return { ok: false, error: 'NOT_FOUND' };

  // Rejected, cancelled or already expired: paying for it does not revive it.
  if (boost.state !== 'approved') return { ok: true, skipped: 'NOT_APPROVED' };
  // A car that was paused or sold while the invoice was outstanding.
  if (boost.listings?.state !== 'live') return { ok: true, skipped: 'NOT_LIVE' };

  const running = boost.listings?.featured_until ? Date.parse(boost.listings.featured_until) : 0;
  const start = Math.max(now, running || 0);
  const endsIso = new Date(start + Number(boost.days) * DAY_MS).toISOString();

  const { error: movedError } = await db
    .from('listing_boosts')
    .update({ starts_at: new Date(start).toISOString(), ends_at: endsIso })
    .eq('id', boostId);
  if (movedError) return { ok: false, error: 'SAVE_FAILED', detail: movedError.message };

  const { error: featureError } = await db
    .from('listings')
    .update({ is_featured: true, featured_until: endsIso })
    .eq('id', boost.listing_id);
  if (featureError) return { ok: false, error: 'SAVE_FAILED', detail: featureError.message };

  return { ok: true, listingId: boost.listing_id, endsAt: endsIso, days: Number(boost.days) };
}

/**
 * Take a promotion back off the grid — a payment recorded by mistake and undone.
 *
 * The boost row keeps its `approved` state: the platform still agreed to run
 * it, and it goes back to waiting for payment rather than being rejected.
 */
export async function deactivateBoost(boostId) {
  if (!boostId) return { ok: false, error: 'NO_BOOST' };

  const db = getMarketplaceDb();

  const { data: boost, error } = await db
    .from('listing_boosts')
    .select('id, listing_id')
    .eq('id', boostId)
    .maybeSingle();

  if (error) return { ok: false, error: 'SAVE_FAILED', detail: error.message };
  if (!boost) return { ok: true, skipped: 'NOT_FOUND' };

  await db.from('listing_boosts').update({ starts_at: null, ends_at: null }).eq('id', boostId);

  const { error: unfeatureError } = await db
    .from('listings')
    .update({ is_featured: false, featured_until: null })
    .eq('id', boost.listing_id);

  if (unfeatureError) return { ok: false, error: 'SAVE_FAILED', detail: unfeatureError.message };
  return { ok: true, listingId: boost.listing_id };
}

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

  const build = (select) => {
    let query = getMarketplaceDb().from('listing_boosts').select(select).limit(limit);

    if (tab === 'active') {
      /* Approved and not finished — which since promotions are gated on payment
         means TWO things: the ones running, and the ones approved but not paid
         for yet, whose ends_at is still null.
         The old filter was `ends_at > now`, so an unpaid one matched neither
         this tab nor history and disappeared from the admin's queue the moment
         it was approved. Nulls sort first, because a promotion waiting on money
         is the one an admin can still do something about. */
      query = query
        .eq('state', 'approved')
        .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
        .order('ends_at', { ascending: true, nullsFirst: true });
    } else if (tab === 'history') {
      query = query
        .or(`state.in.(rejected,cancelled,expired),and(state.eq.approved,ends_at.lte.${nowIso})`)
        .order('created_at', { ascending: false });
    } else {
      query = query.eq('state', 'pending').order('created_at', { ascending: true });
    }
    return query;
  };

  let { data, error } = await build(BOOST_SELECT);
  if (error?.code === '42703') ({ data, error } = await build(BOOST_SELECT_BASE));

  if (error) {
    const missing = isMissingSchema(error);
    if (!missing) console.error('[boosts] listBoosts:', error.message);
    return { ready: !missing, items: [] };
  }

  const items = data ?? [];

  /**
   * Running promotions come back in the order a VISITOR meets them.
   *
   * This listed them by end date, which is why dragging looked broken: the
   * drag wrote listings.featured_rank, the page refreshed, and the server
   * handed back the same rows sorted by when each boost expires — so the car
   * just dragged to the top jumped straight back to wherever its end date put
   * it. The order shown has to be the order being edited.
   *
   * Sorted here rather than in SQL because the column lives on the EMBEDDED
   * listing; ends_at above still decides it for anything not yet ranked.
   */
  if (tab === 'active') {
    const rankOf = (b) => {
      const value = Number(b.listings?.featured_rank);
      return Number.isFinite(value) && value > 0 ? value : Number.MAX_SAFE_INTEGER;
    };
    items.sort((a, b) => rankOf(a) - rankOf(b));
  }

  return { ready: true, items };
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

/**
 * Where this showroom's featured cars actually stand, against everybody's.
 *
 * ── Why a seller needs this ─────────────────────────────────────────────────
 *
 * Promotions could tell a seller their boost was approved and running until a
 * date, and nothing at all about what they had bought. "Featured" is a position
 * in a queue they cannot see, and when four cars are featured and theirs is
 * fourth, "your car goes first" is not true in the way they read it. This is
 * the number that makes the promise checkable.
 *
 * ── It mirrors the browse ordering, and is honest about where it can't ───────
 *
 * Browse puts featured cars first, ordered by listings.featured_rank (1 first,
 * set by an admin dragging the Running list), and leaves the unranked featured
 * cars behind the ranked ones in whatever order the page's own sort gave them —
 * see cars.ts. Newest-first is the default sort and what is assumed here for
 * the unranked tail, so an unranked position is "about here", while a ranked
 * one is exactly right. A seller is shown the rank either way; a wrong number
 * would be worse than none, so the shape of the answer says which it is.
 *
 * Returns Map<listingId, { position, total, ranked }>.
 */
export async function getFeaturedStanding(vendorId) {
  const standing = new Map();
  if (!vendorId) return standing;

  const nowIso = new Date().toISOString();

  const build = (select) =>
    getMarketplaceDb()
      .from('listings')
      .select(select)
      .eq('state', 'live')
      .eq('is_featured', true)
      /* A boost whose end date has passed but whose sweep has not run yet is
         not featured to a visitor, so it must not be counted as competition. */
      .or(`featured_until.is.null,featured_until.gt.${nowIso}`)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(500);

  let { data, error } = await build('id, vendor_id, featured_rank, published_at');
  if (error?.code === '42703') ({ data, error } = await build('id, vendor_id, published_at'));

  if (error) {
    if (!isMissingSchema(error)) console.error('[boosts] getFeaturedStanding:', error.message);
    return standing;
  }

  const rows = data ?? [];

  const rankOf = (row) => {
    const value = Number(row.featured_rank);
    return Number.isFinite(value) && value > 0 ? value : Number.MAX_SAFE_INTEGER;
  };

  // Stable: the query already ordered the unranked ones newest-first, and
  // sort() keeps that for everything the ranks do not separate.
  const ordered = [...rows].sort((a, b) => rankOf(a) - rankOf(b));

  ordered.forEach((row, i) => {
    if (row.vendor_id !== vendorId) return;
    standing.set(row.id, {
      position: i + 1,
      total: ordered.length,
      ranked: rankOf(row) !== Number.MAX_SAFE_INTEGER,
    });
  });

  return standing;
}
