import { getCars } from '@/marketplace/db/queries/cars';
import { normalizeListing } from '@/marketplace/lib/listing';
import { withApi, list } from '@/app/api/marketplace/_lib/handler';

/** GET /api/marketplace/cars — filtered car listings. */
export const GET = withApi(async ({ str, num, list: many, locale, page }) => {
  const { limit, offset } = page(48);

  const { items, total } = await getCars({
    city: str('city'),
    vendorId: str('vendor'),
    minPrice: num('min_price'),
    maxPrice: num('max_price'),
    minYear: num('min_year'),
    maxYear: num('max_year'),
    maxMileage: num('max_mileage'),
    condition: many('condition'),
    transmission: many('transmission'),
    fuel: many('fuel'),
    q: str('q'),
    sort: str('sort', 'newest'),
    limit,
    offset,
  });

  return list(items.map((r) => normalizeListing(r, locale)), total, { limit, offset });
});
