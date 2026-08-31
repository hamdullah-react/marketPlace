import { cache } from 'react';
import { getVendorOptions } from '@/marketplace/db/queries/seller';
import { getSellerAnalytics } from '@/marketplace/db/queries/analytics';

/**
 * Read surface for the analytics page.
 *
 * Calls the query layer directly rather than fetching /api/marketplace/*: this
 * is a server component, so an HTTP hop to our own route would cost a round
 * trip and the connection pool for nothing.
 */

export const getAnalyticsVendors = cache(async () => getVendorOptions().catch(() => []));

export const getAnalyticsPageData = cache(async (vendorId, days = 30) => {
  if (!vendorId) return { data: null, error: null };

  try {
    return { data: await getSellerAnalytics(vendorId, { days }), error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
});
