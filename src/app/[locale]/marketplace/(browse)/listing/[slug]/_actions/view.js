'use server';

import { recordListingView, sweepExpiredBoosts } from '@/marketplace/db/queries/engagement';

/**
 * Counts one view of a car, sent by ViewBeacon once per browser tab session.
 *
 * From the browser rather than the page render, because listing pages are
 * prerendered and cached: a render-time counter would count builds, not
 * visitors. Crawlers that do not run JavaScript are not counted either, which
 * is the point of a "most viewed" number.
 *
 * Also the heartbeat that retires expired boosts — see sweepExpiredBoosts.
 */
export async function recordView(listingId) {
  await recordListingView(listingId).catch(() => false);
  await sweepExpiredBoosts().catch(() => {});
}
