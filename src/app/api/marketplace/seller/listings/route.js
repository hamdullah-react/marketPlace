import { getVendorListings } from '@/marketplace/db/queries/seller';
import { normalizeListing } from '@/marketplace/lib/listing';
import { withApi, list } from '@/app/api/marketplace/_lib/handler';

/**
 * GET /api/marketplace/seller/listings?vendor=<id>&state=live
 *
 * The seller's OWN listings, in every state. That is the difference between
 * this and /api/marketplace/listings, which only ever returns live ones — and
 * it is why the id has to come from the session: reading `?vendor=` directly
 * published one showroom's drafts, its rejected cars and their rejection
 * reasons to anybody who asked. See the `vendor` helper in _lib/handler.js.
 */
export const GET = withApi(async ({ vendor, str, locale, page }) => {
  const { vendorId, error } = await vendor();
  if (error) return error;

  const { limit, offset } = page(100, 50);
  const { items, total } = await getVendorListings(vendorId, { state: str('state'), limit, offset });
  return list(items.map((r) => normalizeListing(r, locale)), total, { limit, offset });
});
