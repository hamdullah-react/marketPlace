import { getSellerStats } from '@/marketplace/db/queries/seller';
import { withApi, ok } from '@/app/api/marketplace/_lib/handler';

/**
 * GET /api/marketplace/seller/stats?vendor=<id>
 *
 * `vendor` is now a REQUEST, not an instruction — see the `vendor` helper in
 * _lib/handler.js. It read the id straight off the query string, so anyone
 * could ask for any showroom's draft, pending and rejected counts and its open
 * lead total, with no session at all.
 */
export const GET = withApi(async ({ vendor }) => {
  const { vendorId, error } = await vendor();
  if (error) return error;

  return ok(await getSellerStats(vendorId));
});
