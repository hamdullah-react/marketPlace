import { getModels } from '@/marketplace/db/queries/catalog';
import { withApi, ok, fail } from '@/app/api/marketplace/_lib/handler';

/** GET /api/marketplace/models?brand=<id> */
export const GET = withApi(async ({ str }) => {
  const brand = str('brand');
  if (!brand) return fail('brand is required', 400, 'NO_BRAND');
  const items = await getModels(brand);
  return ok({ items, total: items.length });
});
