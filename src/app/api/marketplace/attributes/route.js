import { getAttributes, getAttributeGroups } from '@/marketplace/db/queries/attributes';
import { withApi, ok } from '@/app/api/marketplace/_lib/handler';

/**
 * GET /api/marketplace/attributes            all lists, grouped by kind
 * GET /api/marketplace/attributes?kind=fuel  one list
 */
export const GET = withApi(async ({ str }) => {
  const kind = str('kind');
  if (kind) {
    const items = await getAttributes(kind);
    return ok({ kind, items, total: items.length });
  }
  return ok({ groups: await getAttributeGroups() });
});
