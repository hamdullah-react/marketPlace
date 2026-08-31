import { getTrims } from '@/marketplace/db/queries/catalog';
import { withApi, ok, fail } from '@/app/api/marketplace/_lib/handler';

/** GET /api/marketplace/trims?model=<id> */
export const GET = withApi(async ({ str }) => {
  const model = str('model');
  if (!model) return fail('model is required', 400, 'NO_MODEL');
  const items = await getTrims(model);
  return ok({ items, total: items.length });
});
