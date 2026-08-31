import { getCategoryTree } from '@/marketplace/db/queries/categories';
import { normalizeCategory } from '@/marketplace/lib/listing';
import { ok, fail } from '@/app/api/marketplace/_lib/response';

export async function GET(request) {
  const p = new URL(request.url).searchParams;
  const locale = p.get('locale') === 'en' ? 'en' : 'ar';

  try {
    const tree = await getCategoryTree({ type: p.get('type') ?? undefined });
    return ok({ items: tree.map((row) => normalizeCategory(row, locale)) });
  } catch (err) {
    return fail(err.message, 500, 'CATEGORIES_QUERY_FAILED');
  }
}
