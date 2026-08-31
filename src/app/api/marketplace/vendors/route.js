import { getApprovedVendors } from '@/marketplace/db/queries/vendors';
import { normalizeVendor } from '@/marketplace/lib/listing';
import { ok, fail } from '@/app/api/marketplace/_lib/response';

export async function GET(request) {
  const p = new URL(request.url).searchParams;
  const locale = p.get('locale') === 'en' ? 'en' : 'ar';
  const limit = Math.min(Number(p.get('limit')) || 24, 48);
  const offset = Number(p.get('offset')) || 0;

  try {
    const { items, total } = await getApprovedVendors({
      city: p.get('city') ?? undefined,
      limit,
      offset,
    });
    return ok({
      items: items.map((row) => normalizeVendor(row, locale)),
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    });
  } catch (err) {
    return fail(err.message, 500, 'VENDORS_QUERY_FAILED');
  }
}
