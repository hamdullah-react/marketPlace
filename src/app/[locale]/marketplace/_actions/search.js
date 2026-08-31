'use server';

import { getCars, getBrandsIndex } from '@/marketplace/db/queries/cars';
import { normalizeListing } from '@/marketplace/lib/listing';

/**
 * What the search modal needs, as server actions rather than API routes.
 *
 * A route handler would mean a public JSON endpoint to version, rate-limit and
 * keep in step with the queries — for two reads that only one component makes.
 * Actions are the same round trip with none of that surface, and they cannot
 * drift from the shape they return because there is no contract written twice.
 *
 * Both return the SMALL shape. normalizeListing gives a card everything it
 * could want — media arrays, vendor ratings, SEO — and a search-as-you-type box
 * would ship all of it on every keystroke. A row in this modal draws seven
 * fields, so seven fields is what crosses the wire.
 */

const RESULT_LIMIT = 6;

const toRow = (car) => ({
  id: car.id,
  slug: car.slug,
  path: car.path,
  title: car.title,
  priceLabel: car.priceLabel,
  compareAtLabel: car.compareAtLabel,
  image: car.image,
  imageAlt: car.imageAlt,
  brandName: car.brand?.name ?? null,
  year: car.attributes?.year ?? null,
  condition: car.attributes?.condition ?? null,
  city: car.city ?? null,
});

/**
 * Cars matching what has been typed, optionally inside one brand.
 *
 * Two characters is the floor: a single letter matches most of the inventory
 * and the answer is never the one being looked for, so it is a query nobody
 * benefits from paying for. A brand chip on its own is a real search, though,
 * which is why it can run with an empty term.
 */
export async function searchCars({ q = '', brandId = '', locale = 'ar' } = {}) {
  const term = String(q).trim();
  if (term.length < 2 && !brandId) return { cars: [], total: 0 };

  const { items, total } = await getCars({
    q: term || undefined,
    brand: brandId ? [brandId] : undefined,
    locale,
    limit: RESULT_LIMIT,
  }).catch(() => ({ items: [], total: 0 }));

  return { cars: items.map((row) => toRow(normalizeListing(row, locale))), total };
}

/**
 * What the modal shows before a single key is pressed: the brand chips, and the
 * most-viewed cars.
 *
 * One action rather than two so opening the modal is one round trip. They are
 * fetched together every time it opens and neither is useful without the other
 * being on its way.
 */
export async function searchInitialData({ locale = 'ar' } = {}) {
  const [brands, popular] = await Promise.all([
    getBrandsIndex(locale).catch(() => []),
    getCars({ locale, sort: 'popular', limit: RESULT_LIMIT }).catch(() => ({ items: [] })),
  ]);

  return {
    brands: brands.map((b) => ({
      id: b.id,
      slug: b.slug,
      // Resolved here, not in the client: the raw jsonb is two strings where
      // one is needed, doubled across every brand chip.
      name: (locale === 'ar' ? b.name?.ar || b.name?.en : b.name?.en || b.name?.ar) || b.slug,
      count: b.count,
    })),
    popular: (popular.items ?? []).map((row) => toRow(normalizeListing(row, locale))),
  };
}
