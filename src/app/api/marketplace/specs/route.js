import { getSpecAttributes } from '@/marketplace/db/queries/catalog';
import { withApi, ok } from '@/app/api/marketplace/_lib/handler';

/** GET /api/marketplace/specs — spec attribute definitions with their icons. */
export const GET = withApi(async () => {
  const items = await getSpecAttributes();
  return ok({ items, total: items.length });
});
