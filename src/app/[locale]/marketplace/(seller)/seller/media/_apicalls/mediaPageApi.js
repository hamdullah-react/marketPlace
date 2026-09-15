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

/** Pages read at a time, and the most a library page will hold. */
const PAGE = 200;
const MAX_FILES = 5000;

/**
 * The WHOLE library, a page at a time.
 *
 * This asked for one page of 200. A showroom that installed Car images has
 * 400-odd photos, so the library showed 200 of them and its folder counts —
 * worked out from what was loaded — said Exterior 110 while the Templates card
 * said 427 installed.
 *
 * Each call returns this showroom's page PLUS the shared template artwork, so
 * the artwork repeats on every page and is de-duplicated by id. It stops when
 * everything is in, when a page brings nothing new, or at MAX_FILES.
 */
async function readAllMedia(vendorId) {
  const byId = new Map();
  for (let offset = 0; offset < MAX_FILES; offset += PAGE) {
    const { items, total } = await getVendorMedia(vendorId, { limit: PAGE, offset });
    const before = byId.size;
    for (const item of items) if (!byId.has(item.id)) byId.set(item.id, item);
    if (byId.size >= total || byId.size === before) break;
  }
  return [...byId.values()];
}

export const getMediaPageData = cache(async (vendorId) => {
  const empty = { assets: [], folders: [], stats: { count: 0, bytes: 0 }, error: null };
  if (!vendorId) return empty;

  try {
    const [assets, stats, folders] = await Promise.all([
      readAllMedia(vendorId),
      getMediaStats(vendorId),
      // Its own tolerant read (schema.sql §26 may not have been run yet), so
      // it is deliberately not wrapped in the catch below: no folders is a
      // library without shelves, not a library that failed to load.
      getMediaFolders(vendorId),
    ]);
    return { assets, folders, stats, error: null };
  } catch (err) {
    // media_assets arrives with schema.sql; explain rather than throw.
    return { ...empty, error: err.message };
  }
});
