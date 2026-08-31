import { getYears } from '@/marketplace/db/queries/catalog';
import { withApi, ok } from '@/app/api/marketplace/_lib/handler';

/** GET /api/marketplace/years */
export const GET = withApi(async () => {
  const items = await getYears();
  return ok({ items, total: items.length });
});
