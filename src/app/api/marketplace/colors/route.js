import { getColors } from '@/marketplace/db/queries/catalog';
import { withApi, ok } from '@/app/api/marketplace/_lib/handler';

/** GET /api/marketplace/colors */
export const GET = withApi(async () => {
  const items = await getColors();
  return ok({ items, total: items.length });
});
