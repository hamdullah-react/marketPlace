import { getBrands } from '@/marketplace/db/queries/catalog';
import { withApi, ok } from '@/app/api/marketplace/_lib/handler';

/** GET /api/marketplace/brands */
export const GET = withApi(async () => {
  const items = await getBrands();
  return ok({ items, total: items.length });
});
