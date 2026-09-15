import { getFeaturedListings, getLiveListings } from '@/marketplace/db/queries/listings';
import { getCategoryTree } from '@/marketplace/db/queries/categories';
import { getTopVendors } from '@/marketplace/db/queries/vendors';
import { getCardSpecs } from '@/marketplace/db/queries/specs';
import { normalizeListing, normalizeCategory, normalizeVendor } from '@/marketplace/lib/listing';

/**
 * Everything the marketplace home page reads.
 *
 * Deliberately three functions rather than one Promise.all. The page renders
 * each section behind its own <Suspense>, and a section can only stream in
 * when ITS data is ready — if all three shared a single combined promise they
 * would all be gated on the slowest of the three, and the fast ones would sit
 * behind a skeleton for no reason.
 *
 * These call the query layer directly rather than fetching /api/marketplace/*.
 * The page is a server component, so an HTTP hop to our own route would cost a
 * round trip and the connection pool for nothing. The HTTP routes are for
 * CLIENT code and sit on this same query layer.
 */

/**
 * Top-level CAR categories.
 *
 * Filtered by listing_type rather than showing the whole tree: the taxonomy
 * still holds parts, services and accessories from the original four-vertical
 * plan, and the home rail was rendering them as live destinations. This is a
 * car marketplace, so a visitor who clicks "Services" lands somewhere with
 * nothing in it and no way back into what they came for.
 *
 * The rows are left in the database. They are a taxonomy, not a promise, and
 * deleting them would take the listings filed under them with it.
 */
export async function getHomeCategories(locale = 'ar') {
  const rows = await getCategoryTree();
  return rows
    .filter((r) => r.listing_type === 'car')
    .map((r) => normalizeCategory(r, locale));
}

export async function getHomeFeatured(locale = 'ar', limit = 8) {
  const rows = await getFeaturedListings(limit);

  // Which facts a card shows is a catalog decision — the specifications
  // flagged "show on card". One read for the whole page: doing it per card
  // would be a round trip each for a four-icon row.
  const cardSpecs = await getCardSpecs(rows.map((r) => r.id), locale).catch(() => new Map());

  return {
    items: rows.map((r) => normalizeListing(r, locale)),
    cardSpecs: Object.fromEntries(cardSpecs),
  };
}

/**
 * The Most viewed row: live cars ordered by their real view count only.
 * Unlike getHomeFeatured, a boost does not move a car up here — this row is
 * what buyers actually opened.
 */
export async function getHomeMostViewed(locale = 'ar', limit = 8) {
  const { items: rows } = await getLiveListings({ type: 'car', sort: 'popular', limit });
  const cardSpecs = await getCardSpecs(rows.map((r) => r.id), locale).catch(() => new Map());

  return {
    items: rows.map((r) => normalizeListing(r, locale)),
    cardSpecs: Object.fromEntries(cardSpecs),
  };
}

export async function getHomeVendors(locale = 'ar', limit = 3) {
  const rows = await getTopVendors(limit);
  return rows.map((r) => normalizeVendor(r, locale));
}
