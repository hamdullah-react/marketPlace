import { cache } from 'react';
import { getVendorOptions } from '@/marketplace/db/queries/seller';
import { getVendorMedia, getMediaStats, getMediaFolders } from '@/marketplace/db/queries/media';

/**
 * Read surface for the media library page.
 *
 * Memoised with React's cache(): the file counter and the grid are separate
 * Suspense boundaries reading the same data, and without this they would run
 * the query twice per request.
 *
 * These call the query layer directly rather than fetching /api/marketplace/*.
 * The page is a server component, so an HTTP hop to our own route would cost a
 * round trip and the connection pool for nothing. The HTTP routes are for
 * CLIENT code and sit on this same query layer.
 */

export const getMediaVendors = cache(async () => getVendorOptions().catch(() => []));

export const getMediaPageData = cache(async (vendorId) => {
  const empty = { assets: [], folders: [], stats: { count: 0, bytes: 0 }, error: null };
  if (!vendorId) return empty;

  try {
    const [media, stats, folders] = await Promise.all([
      getVendorMedia(vendorId, { limit: 200 }),
      getMediaStats(vendorId),
      // Its own tolerant read (schema.sql §26 may not have been run yet), so
      // it is deliberately not wrapped in the catch below: no folders is a
      // library without shelves, not a library that failed to load.
      getMediaFolders(vendorId),
    ]);
    return { assets: media.items, folders, stats, error: null };
  } catch (err) {
    // media_assets arrives with schema.sql; explain rather than throw.
    return { ...empty, error: err.message };
  }
});
