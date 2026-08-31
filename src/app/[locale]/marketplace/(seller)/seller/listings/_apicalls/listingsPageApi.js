import { cache } from 'react';
import { getVendorOptions, getVendorListings } from '@/marketplace/db/queries/seller';
import { normalizeListing } from '@/marketplace/lib/listing';

/**
 * Read surface for the seller's listings table.
 *
 * Memoised with React's cache() because the page reads the vendor from the
 * state tabs and again from the table, each inside its own Suspense boundary.
 *
 * These call the query layer directly rather than fetching /api/marketplace/*.
 * The page is a server component, so an HTTP hop to our own route would cost a
 * round trip and the connection pool for nothing. The HTTP routes are for
 * CLIENT code and sit on this same query layer.
 */

/**
 * Rows per page — the same ladder and default the Catalog table offers, so the
 * two behave identically.
 *
 * The table used to ask for a flat 100 and render all of them, which was two
 * problems at once: a seller with 101 cars could never reach the last one, and
 * a seller with 100 got a page that took a second to paint. Both go away with
 * a page size the database applies as a range.
 */
export const PAGE_SIZES = [8, 16, 32, 64, 100];
export const DEFAULT_PAGE_SIZE = 8;

export const getListingsVendors = cache(async () => getVendorOptions().catch(() => []));

export const resolveListingsVendor = cache(async (vendorId) => {
  const vendors = await getListingsVendors();
  return vendors.find((v) => v.id === vendorId) ?? vendors[0] ?? null;
});

/**
 * One page of listings, filtered by state and search term.
 *
 * `total` is the count for the CURRENT filter, not the vendor's whole
 * inventory — it drives both the "1–20 of N" line and the page count, and those
 * two disagreeing is how a Next button ends up leading to an empty table.
 */
export const getListingsPageData = cache(
  async (vendorId, { state = '', q = '', page = 1, size, locale = 'ar' } = {}) => {
    // Clamped rather than trusted: `size` arrives from the query string, and an
    // unbounded one is a request for every row this vendor owns.
    const pageSize = PAGE_SIZES.includes(Number(size)) ? Number(size) : DEFAULT_PAGE_SIZE;

    if (!vendorId) {
      return { listings: [], total: 0, page: 1, pageCount: 1, pageSize, from: 0, to: 0 };
    }

    const safePage = Math.max(1, Number(page) || 1);
    const offset = (safePage - 1) * pageSize;

    const { items, total } = await getVendorListings(vendorId, {
      state: state || undefined,
      q: q || undefined,
      limit: pageSize,
      offset,
    });

    return {
      listings: items.map((row) => normalizeListing(row, locale)),
      total,
      page: safePage,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
      // Counted from the rows actually returned, not from page × size. Someone
      // can always type ?page=9 by hand, and the arithmetic version answered
      // "21–8 of 8" for it. Both ends collapse to 0 on an empty page, which is
      // what is actually on screen — `offset + 0` would still have read "0–8".
      from: items.length ? offset + 1 : 0,
      to: items.length ? offset + items.length : 0,
    };
  }
);
