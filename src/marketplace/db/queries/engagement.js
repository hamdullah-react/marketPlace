import 'server-only';

/**
 * Views and boost expiry — the two numbers that decide where a car ranks.
 *
 * JavaScript rather than TypeScript because both touch objects the generated
 * types do not know yet (increment_listing_views, featured_until,
 * listing_boosts). They are created by the "BOOSTS, THE VIEW COUNTER" section
 * at the end of schema.sql, and everything here degrades quietly until that
 * section has been run.
 */

import { getMarketplaceDb } from '@/marketplace/db/client';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A table, column or function that the schema section has not created yet. */
export function isMissingSchema(error) {
  return /PGRST202|PGRST204|PGRST205|42883|42P01|42703|does not exist|Could not find/i.test(
    `${error?.code ?? ''} ${error?.message ?? ''}`
  );
}

/**
 * One view of one live car.
 *
 * The database function adds 1 in a single statement, so two visitors at the
 * same moment count as two. The fallback — read, then write — is what the app
 * did before, and is only used until schema.sql has been run.
 */
export async function recordListingView(listingId) {
  if (!UUID.test(String(listingId ?? ''))) return false;

  const db = getMarketplaceDb();
  const { error } = await db.rpc('increment_listing_views', { target: listingId });
  if (!error) return true;

  if (!isMissingSchema(error)) {
    console.error('[views] increment_listing_views failed:', error.message);
    return false;
  }

  const { data } = await db
    .from('listings')
    .select('views')
    .eq('id', listingId)
    .eq('state', 'live')
    .maybeSingle();
  if (!data) return false;

  await db.from('listings').update({ views: (data.views ?? 0) + 1 }).eq('id', listingId);
  return true;
}

/**
 * Un-features cars whose boost has run out.
 *
 * There is no scheduler, so this runs on the back of things that already
 * happen: a car being viewed, an admin opening the boost page. Throttled to
 * once every ten minutes per server instance, so a busy listing page does not
 * turn into a write on every visit.
 */
const SWEEP_EVERY_MS = 10 * 60 * 1000;
let lastSweep = 0;

export async function sweepExpiredBoosts({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastSweep < SWEEP_EVERY_MS) return;
  lastSweep = now;

  const iso = new Date(now).toISOString();
  const db = getMarketplaceDb();

  const { error } = await db
    .from('listings')
    .update({ is_featured: false, featured_until: null })
    .eq('is_featured', true)
    .lt('featured_until', iso);

  if (error) {
    if (!isMissingSchema(error)) console.error('[boosts] sweep failed:', error.message);
    return;
  }

  await db
    .from('listing_boosts')
    .update({ state: 'expired' })
    .eq('state', 'approved')
    .lt('ends_at', iso);
}
