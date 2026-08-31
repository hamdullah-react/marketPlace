import { cache } from 'react';
import { getVendorOptions, getSellerStats, getVendorListings } from '@/marketplace/db/queries/seller';
import { normalizeListing } from '@/marketplace/lib/listing';

/**
 * Read surface for the seller dashboard.
 *
 * Stats and listings are separate exports rather than one combined read: the
 * page streams the stat cards, the chart and the table behind their own
 * Suspense boundaries, and the four headline numbers come back far sooner than
 * a hundred listing rows. Combined, the numbers would be held hostage to the
 * table.
 *
 * Everything is wrapped in React's cache() because each boundary resolves the
 * vendor independently — without it, three sections would mean three copies of
 * the same vendor lookup.
 *
 * These call the query layer directly rather than fetching /api/marketplace/*.
 * The page is a server component, so an HTTP hop to our own route would cost a
 * round trip and the connection pool for nothing. The HTTP routes are for
 * CLIENT code and sit on this same query layer.
 */

export const getSellerVendors = cache(async () => getVendorOptions().catch(() => []));

/**
 * Resolves the vendor the dashboard is showing: the one named in ?vendor, else
 * the first. Memoised so every section agrees on the answer without re-reading.
 */
export const resolveVendor = cache(async (vendorId) => {
  const vendors = await getSellerVendors();
  const vendor = vendors.find((v) => v.id === vendorId) ?? vendors[0] ?? null;
  return { vendors, vendor };
});

/** The four headline numbers. */
export const getDashboardStats = cache(async (vendorId) => {
  if (!vendorId) return {};
  return getSellerStats(vendorId);
});

/** Rows for the chart and the table. */
export const getDashboardListings = cache(async (vendorId, locale = 'ar') => {
  if (!vendorId) return [];
  const { items } = await getVendorListings(vendorId, { limit: 100 });
  return items.map((row) => normalizeListing(row, locale));
});
