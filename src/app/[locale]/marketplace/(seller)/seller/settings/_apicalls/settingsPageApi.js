import { cache } from 'react';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { getVendorOptions } from '@/marketplace/db/queries/seller';
import { getViewer } from '@/marketplace/auth/session';
import { getVendorSettings, getBackups, getVendorDataCounts } from '@/marketplace/db/queries/settings';
import { getVendorMedia } from '@/marketplace/db/queries/media';

/**
 * Read surface for store settings.
 *
 * Unlike every other seller page, this one must be able to show a vendor that
 * has been suspended or soft-deleted. "Delete all data" lives on this page and
 * suspends the vendor as its last step — and getVendorOptions() returns only
 * approved vendors, so the seller was thrown out of the page they were
 * standing on and shown "No vendor — run seed.cjs", a developer setup notice.
 * Settings looks the vendor up directly so it can report what actually
 * happened instead.
 */

export const getSettingsVendors = cache(async () => getVendorOptions().catch(() => []));

/**
 * The vendor to show — including suspended and soft-deleted ones, but only ever
 * one of the CALLER'S OWN.
 *
 * Two requirements pulling in opposite directions, which is why this is not
 * just getVendorOptions()[0]:
 *
 *   · It must reach past "approved". "Delete all data" lives on this page and
 *     suspends the vendor as its last step, so an approved-only lookup found
 *     nothing and told a seller who had just deleted their own store to run a
 *     seed script.
 *
 *   · It must not reach past the caller. It used to look up any `?vendor=` id
 *     directly, and fall back to the oldest vendor on the platform when there
 *     was none — so a seller could read another showroom's CR number, VAT
 *     number and contact details by editing the URL, and a brand-new seller
 *     with no showroom was shown somebody else's.
 *
 * memberVendorIds satisfies both: membership regardless of state.
 */
export const resolveSettingsVendor = cache(async (vendorId) => {
  const viewer = await getViewer();
  const mine = viewer?.memberVendorIds ?? [];

  const db = getMarketplaceDb();
  const columns = 'id, slug, state, deleted_at';

  // Staff keep the old behaviour — they administer showrooms they do not
  // belong to, which is the whole job.
  if (viewer?.isStaff) {
    if (vendorId) {
      const { data } = await db.from('vendors').select(columns).eq('id', vendorId).maybeSingle();
      if (data) return data;
    }
    const approved = await getSettingsVendors();
    return approved[0] ?? null;
  }

  if (!mine.length) return null;

  const wanted = vendorId && mine.includes(vendorId) ? vendorId : mine[0];

  const { data } = await db.from('vendors').select(columns).eq('id', wanted).maybeSingle();
  return data ?? null;
});

export const getSettingsPageData = cache(async (vendorId) => {
  const empty = { vendor: null, backups: [], counts: {}, assets: [], error: null };
  if (!vendorId) return empty;

  try {
    const [vendor, backups, counts, media] = await Promise.all([
      getVendorSettings(vendorId),
      getBackups(vendorId).catch(() => []),
      getVendorDataCounts(vendorId).catch(() => ({})),
      // The image picker needs the library up front so it opens populated.
      getVendorMedia(vendorId, { limit: 200 }).then((r) => r.items).catch(() => []),
    ]);
    return { vendor, backups, counts, assets: media, error: null };
  } catch (err) {
    return { ...empty, error: err.message };
  }
});
