import { getModels, getTrims } from '@/marketplace/db/queries/catalog';
import { getViewer } from '@/marketplace/auth/session';
import { ok, fail } from '@/app/api/marketplace/_lib/response';

/**
 * Cascading catalog lookups for the SELLER form.
 *
 * Models and trims are fetched on demand rather than shipped with the page —
 * 429 models and 1314 trims is a lot of JSON to send to someone who will pick
 * one of each.
 *
 *   /api/marketplace/catalog?models=<brandId>
 *   /api/marketplace/catalog?trims=<modelId>
 *
 * Scoped to the caller's own catalog. This route is what the brand dropdown
 * calls when a seller picks a brand, so leaving it unscoped would hand back
 * every model on the platform a moment after the brand list correctly showed
 * only theirs — and the seller would file a car under a model their catalog
 * does not contain.
 *
 * The PUBLIC equivalents are /api/marketplace/models and /trims, which stay
 * unscoped because a buyer filtering the browse grid must see everything.
 */
export async function GET(request) {
  const p = new URL(request.url).searchParams;

  try {
    const viewer = await getViewer();
    if (!viewer) return fail('Sign in first', 401, 'NOT_SIGNED_IN');

    // Staff administer every showroom's listings, so they see the whole
    // catalog here exactly as they do on the catalog page.
    const scope = viewer.isStaff ? null : (viewer.vendorIds[0] ?? null);

    const brandId = p.get('models');
    if (brandId) return ok({ items: await getModels(brandId, scope) });

    const modelId = p.get('trims');
    if (modelId) return ok({ items: await getTrims(modelId, scope) });

    return fail('Pass ?models=<brandId> or ?trims=<modelId>', 400, 'MISSING_PARAM');
  } catch (err) {
    return fail(err.message, 500, 'CATALOG_QUERY_FAILED');
  }
}
