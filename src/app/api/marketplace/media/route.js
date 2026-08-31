import { getVendorMedia, getMediaStats } from '@/marketplace/db/queries/media';
import { withApi, list } from '@/app/api/marketplace/_lib/handler';

/**
 * GET /api/marketplace/media?vendor=<id>&kind=photo — the seller's library.
 *
 * Session-scoped, like the upload route beside it. This one took `?vendor=`
 * on trust, so a showroom's whole media library — every storage path in their
 * own bucket — came back to an unauthenticated caller.
 */
export const GET = withApi(async ({ vendor, str, page }) => {
  const { vendorId, error } = await vendor();
  if (error) return error;

  const { limit, offset } = page(200, 100);
  const [{ items, total }, stats] = await Promise.all([
    getVendorMedia(vendorId, { kind: str('kind'), limit, offset }),
    getMediaStats(vendorId),
  ]);

  const res = list(items, total, { limit, offset });
  const body = await res.json();
  return Response.json({ ...body, data: { ...body.data, stats } }, { status: 200 });
});
