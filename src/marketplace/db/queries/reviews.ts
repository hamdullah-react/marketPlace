import 'server-only';

/**
 * Reading reviews — for a buyer, for the public, and for moderation.
 *
 * The SELLER's two readers (which deliberately include hidden reviews, so a
 * showroom can see what was taken down) stay in queries/seller.ts. Everything
 * here shows only what a visitor is allowed to see, with the single exception
 * of the admin moderation feed, which is the one screen whose job is the
 * hidden ones.
 *
 * ── Every read survives an un-migrated database ─────────────────────────────
 *
 * `lead_id` and `buyer_name` arrive with the REVIEWS section of schema.sql, and
 * code ships before SQL is run. PostgREST fails the WHOLE query when a select
 * names a column that does not exist, so a storefront would go blank over a
 * column it uses for one line of text. Each read asks for the new columns and
 * falls back to the old ones — the same shape as attachOffers() in offers.ts.
 */

import { getMarketplaceDb } from '@/marketplace/db/client';
import type { LooseRow } from '@/marketplace/lib/row';
import { summarize, reviewEligibility, shortName } from '@/marketplace/lib/review';

const BASE = `
  id, vendor_id, listing_id, rating, body, verified_purchase,
  vendor_reply, vendor_replied_at, hidden, hidden_reason, created_at, updated_at
`;

/** BASE plus the columns the REVIEWS section adds. */
const FULL = `${BASE}, lead_id, buyer_name, hidden_by, hidden_at`;

const WITH_CAR = `, listings ( id, slug, name, media )`;
const WITH_SHOP = `, vendors ( id, slug, name, logo_url, verified )`;

/** 42703 — the column is not there yet. Anything else is a real failure. */
const missingColumn = (error: LooseRow | null) => error?.code === '42703';

/**
 * Run `build` with the full column list, and again with the old one if the
 * database has not had the REVIEWS section run on it.
 */
async function tolerant<T>(build: (select: string) => PromiseLike<T>, extra = ''): Promise<T> {
  const first = (await build(FULL + extra)) as LooseRow;
  if (!missingColumn(first?.error)) return first as T;
  return (await build(BASE + extra)) as T;
}

/* ── Public: one showroom ─────────────────────────────────────────────────── */

/**
 * The reviews a visitor sees on a storefront. Hidden ones are not among them,
 * here or anywhere else outside moderation and the showroom's own page.
 */
export async function getPublicVendorReviews(
  vendorId: string,
  { limit = 20, offset = 0, rating = null }: { limit?: number; offset?: number; rating?: number | null } = {}
) {
  if (!vendorId) return { items: [], total: 0 };

  const run = (select: string) => {
    let q = getMarketplaceDb()
      .from('reviews')
      .select(select, { count: 'exact' })
      .eq('vendor_id', vendorId)
      .eq('hidden', false);

    if (rating) q = q.eq('rating', rating);

    return q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  };

  const { data, error, count } = await tolerant<LooseRow>(run, WITH_CAR);
  if (error) {
    if (error.code === '42P01') return { items: [], total: 0 };
    throw new Error(`getPublicVendorReviews: ${error.message}`);
  }

  return { items: (data ?? []) as LooseRow[], total: count ?? 0 };
}

/**
 * Average, histogram and the positive share, from the VISIBLE reviews.
 *
 * Read from `reviews` rather than from vendors.rating_avg on purpose: the
 * rollup column answers "what is the number", this answers "how is it made up",
 * and a page that shows the bars should draw the average from the same rows it
 * drew them from. The two agree — the trigger sees to that — and if they ever
 * disagree, this one is the truth.
 */
export async function getVendorRatingSummary(vendorId: string) {
  const empty = { total: 0, average: 0, buckets: [0, 0, 0, 0, 0], unanswered: 0, positive: 0 };
  if (!vendorId) return empty;

  const { data, error } = await getMarketplaceDb()
    .from('reviews')
    .select('rating, vendor_reply')
    .eq('vendor_id', vendorId)
    .eq('hidden', false);

  if (error) return empty;
  return summarize((data ?? []) as LooseRow[]);
}

/** The same, for a list of showrooms at once — the vendors grid asks this. */
export async function getRatingSummaries(vendorIds: string[]) {
  const out = new Map<string, { total: number; average: number }>();
  if (!vendorIds?.length) return out;

  const { data, error } = await getMarketplaceDb()
    .from('reviews')
    .select('vendor_id, rating')
    .in('vendor_id', vendorIds)
    .eq('hidden', false);

  if (error) return out;

  for (const row of (data ?? []) as LooseRow[]) {
    const current = out.get(row.vendor_id) ?? { total: 0, average: 0 };
    const total = current.total + 1;
    out.set(row.vendor_id, {
      total,
      average: (current.average * current.total + Number(row.rating)) / total,
    });
  }

  return out;
}

/* ── Public: one car ──────────────────────────────────────────────────────── */

/**
 * Reviews left by buyers who enquired about THIS car.
 *
 * A car page shows these above the showroom's general rating, because "what did
 * people who asked about this exact car think" is the more useful answer and
 * the showroom's average is one click away.
 */
export async function getListingReviews(listingId: string, limit = 5) {
  if (!listingId) return { items: [], total: 0 };

  const run = (select: string) =>
    getMarketplaceDb()
      .from('reviews')
      .select(select, { count: 'exact' })
      .eq('listing_id', listingId)
      .eq('hidden', false)
      .order('created_at', { ascending: false })
      .limit(limit);

  const { data, error, count } = await tolerant<LooseRow>(run);
  if (error) return { items: [], total: 0 };

  return { items: (data ?? []) as LooseRow[], total: count ?? 0 };
}

/* ── The buyer's own ──────────────────────────────────────────────────────── */

/**
 * What this buyer has written, hidden ones INCLUDED and marked.
 *
 * Their own words, so they see them either way — but they are told it was taken
 * down, which is the only way an appeal can start. See the same reasoning on
 * the seller's page in queries/seller.ts.
 */
export async function getBuyerReviews(userId: string) {
  if (!userId) return [];

  const run = (select: string) =>
    getMarketplaceDb()
      .from('reviews')
      .select(select)
      .eq('buyer_user_id', userId)
      .order('created_at', { ascending: false });

  const { data, error } = await tolerant<LooseRow>(run, WITH_CAR + WITH_SHOP);
  if (error) return [];
  return (data ?? []) as LooseRow[];
}

/**
 * Deals this buyer could review, and the ones they cannot review yet with the
 * reason why.
 *
 * Eligibility itself lives in lib/review.js. This function's whole job is to
 * bring the three things that rule needs into one place: the buyer's leads, the
 * showroom each belongs to, and which of them already carry a review.
 */
export async function getReviewableDeals(userId: string) {
  if (!userId) return { open: [], waiting: [] };

  const db = getMarketplaceDb();

  const SELECT =
    'id, vendor_id, listing_id, listing_title, stage, created_at, ' +
    'vendors ( id, slug, name, logo_url ), listings ( id, slug, name, media )';

  const run = (excludeDeleted: boolean) => {
    let q = db.from('leads').select(SELECT).eq('buyer_user_id', userId);
    /* A request the showroom deleted is not a deal to rate. `buyer_hidden_at`
       is deliberately NOT filtered: clearing a finished request off your own
       list is tidying up, not a statement that it never happened. */
    if (excludeDeleted) q = q.is('deleted_at', null);
    return q.order('created_at', { ascending: false }).limit(50);
  };

  /* 42703 — §21.8 has not been run, so there is no deleted_at to filter on and
     no lead can have been soft-deleted either. Same fallback as
     getBuyerRequests, for the same reason. */
  let { data: leads, error } = await run(true);
  if (error?.code === '42703') ({ data: leads, error } = await run(false));

  if (error) return { open: [], waiting: [] };

  const rows = (leads ?? []) as LooseRow[];
  if (!rows.length) return { open: [], waiting: [] };

  /* Which of these already have a review. Asked by lead_id where the column
     exists; on an un-migrated database the answer is "none of them", which is
     true, because nothing could have written a review with a lead_id. */
  const reviewed = new Set<string>();
  const { data: existing } = await db
    .from('reviews')
    .select('lead_id')
    .eq('buyer_user_id', userId);

  for (const row of (existing ?? []) as LooseRow[]) {
    if (row.lead_id) reviewed.add(row.lead_id);
  }

  const open: LooseRow[] = [];
  const waiting: LooseRow[] = [];

  for (const lead of rows) {
    const verdict = reviewEligibility(lead, { reviewed: reviewed.has(lead.id) });
    if (verdict.reason === 'REVIEWED' || verdict.reason === 'TOO_LATE') continue;
    (verdict.ok ? open : waiting).push({ ...lead, eligibility: verdict });
  }

  return { open, waiting };
}

/** One review, by id, scoped to its author — for the edit form. */
export async function getOwnReview(id: string, userId: string) {
  if (!id || !userId) return null;

  const run = (select: string) =>
    getMarketplaceDb()
      .from('reviews')
      .select(select)
      .eq('id', id)
      .eq('buyer_user_id', userId)
      .maybeSingle();

  const { data, error } = await tolerant<LooseRow>(run);
  if (error) return null;
  return (data ?? null) as LooseRow | null;
}

/* ── Moderation ───────────────────────────────────────────────────────────── */

const SCOPES = ['all', 'visible', 'hidden', 'unanswered', 'critical'] as const;
export type ModerationScope = (typeof SCOPES)[number];

/**
 * The admin feed. One query per scope rather than "fetch everything and filter
 * in JS", because this is the one review screen that has to work when the table
 * is large and the interesting rows are a handful of it.
 *
 * `critical` is 1 and 2 stars — the reviews that are worth an admin's eye
 * whether or not anybody reported them, and the only ones a showroom is likely
 * to ask to have taken down.
 */
export async function getModerationReviews({
  scope = 'all',
  limit = 30,
  offset = 0,
}: { scope?: ModerationScope; limit?: number; offset?: number } = {}) {
  const run = (select: string) => {
    let q = getMarketplaceDb().from('reviews').select(select, { count: 'exact' });

    if (scope === 'visible') q = q.eq('hidden', false);
    if (scope === 'hidden') q = q.eq('hidden', true);
    if (scope === 'unanswered') q = q.eq('hidden', false).is('vendor_reply', null);
    if (scope === 'critical') q = q.eq('hidden', false).lte('rating', 2);

    return q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  };

  const { data, error, count } = await tolerant<LooseRow>(run, WITH_CAR + WITH_SHOP);

  if (error) {
    if (error.code === '42P01') return { items: [], total: 0, missing: true };
    throw new Error(`getModerationReviews: ${error.message}`);
  }

  return { items: (data ?? []) as LooseRow[], total: count ?? 0, missing: false };
}

/**
 * The counts behind the moderation tabs.
 *
 * Head counts, so nothing but the numbers crosses the wire, and each one is
 * allowed to fail on its own — a tab showing no number is better than a screen
 * that will not open.
 */
export async function getModerationCounts() {
  const db = getMarketplaceDb();
  const head = (build: () => PromiseLike<LooseRow>) =>
    Promise.resolve(build()).then(
      ({ count, error }) => (error ? 0 : count ?? 0),
      () => 0
    );

  const [all, hidden, unanswered, critical] = await Promise.all([
    head(() => db.from('reviews').select('id', { count: 'exact', head: true })),
    head(() => db.from('reviews').select('id', { count: 'exact', head: true }).eq('hidden', true)),
    head(() =>
      db.from('reviews').select('id', { count: 'exact', head: true }).eq('hidden', false).is('vendor_reply', null)
    ),
    head(() =>
      db.from('reviews').select('id', { count: 'exact', head: true }).eq('hidden', false).lte('rating', 2)
    ),
  ]);

  return { all, hidden, visible: all - hidden, unanswered, critical };
}

/** The display name for a review, whatever the database has to offer. */
export const reviewerName = (review: LooseRow, fallback = 'A buyer') =>
  shortName(review?.buyer_name, fallback);

/**
 * Which of this buyer's deals already carry a review.
 *
 * A set of lead ids, for the pages that show a "rate this" prompt beside
 * something else — the buyer's Requests list, most of all. Asking that page to
 * call getReviewableDeals() would re-read every lead it is already holding.
 */
export async function getReviewedLeadIds(userId: string) {
  const out = new Set<string>();
  if (!userId) return out;

  const { data, error } = await getMarketplaceDb()
    .from('reviews')
    .select('lead_id')
    .eq('buyer_user_id', userId);

  // 42703 — no lead_id column yet, so nothing can have been reviewed by deal.
  if (error) return out;

  for (const row of (data ?? []) as LooseRow[]) {
    if (row.lead_id) out.add(row.lead_id);
  }
  return out;
}

/**
 * One deal this buyer could review THIS showroom for, or null.
 *
 * For the storefront: a buyer who dealt with a showroom and is now looking at
 * its page is the likeliest person on the site to leave a review, and until now
 * that page said nothing to them. Narrow on purpose — one row, the oldest
 * eligible deal — because it runs for every signed-in visitor to a storefront
 * and must not cost more than the prompt is worth.
 */
export async function getReviewableDealFor(userId: string, vendorId: string) {
  if (!userId || !vendorId) return null;

  const db = getMarketplaceDb();

  const run = (excludeDeleted: boolean) => {
    let q = db
      .from('leads')
      .select('id, stage, created_at')
      .eq('buyer_user_id', userId)
      .eq('vendor_id', vendorId);
    if (excludeDeleted) q = q.is('deleted_at', null);
    return q.order('created_at', { ascending: true }).limit(10);
  };

  let { data, error } = await run(true);
  if (error?.code === '42703') ({ data, error } = await run(false));
  if (error || !data?.length) return null;

  const reviewed = await getReviewedLeadIds(userId);

  for (const lead of data as LooseRow[]) {
    if (reviewEligibility(lead, { reviewed: reviewed.has(lead.id) }).ok) return lead;
  }
  return null;
}
