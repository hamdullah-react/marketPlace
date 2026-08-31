import { getListingBySlug, getRelatedListings } from '@/marketplace/db/queries/listings';
import { getListingSpecs } from '@/marketplace/db/queries/specs';
import { getListingVariants } from '@/marketplace/db/queries/media';
import { getCardKindDefs } from '@/marketplace/db/queries/attributes';
import { listingCard, listingDetail } from '@/app/api/marketplace/_lib/listing-shape';
import { ok, fail } from '@/app/api/marketplace/_lib/response';

/**
 * GET /api/marketplace/listings/[slug] — everything about one car.
 *
 * The opposite trade to the list endpoint: this is ONE row, so it pays for the
 * full picture — description, every photo, the spec sheet, colour variants,
 * SEO fields and the raw attributes object. Four extra reads for one car is
 * cheap; the same four per row across a grid of 48 is not, which is why the
 * list endpoint does none of them.
 *
 * Names come back as { ar, en } rather than one language:
 *
 *     "name":        { "ar": "…", "en": "…" }
 *     "description": { "ar": "…", "en": "…" }
 *
 * See _lib/listing-shape.js for the reasoning. A missing translation stays
 * missing — `{ "ar": "…" }` with no `en` — because inventing a fallback here
 * would hide it from the only people who can fix it.
 *
 *   ?related=0   skip the related-cars query when the consumer does not use it
 */
export async function GET(request, { params }) {
  const { slug } = await params;
  const p = new URL(request.url).searchParams;
  const wantRelated = p.get('related') !== '0';

  try {
    const row = await getListingBySlug(slug);
    if (!row) return fail('Listing not found', 404, 'NOT_FOUND');

    // Everything below depends only on the row's id, so it all goes at once
    // rather than in four sequential awaits.
    //
    // Each one degrades to empty on its own: a listing whose spec table read
    // failed is still a listing worth returning, and answering 500 for the
    // whole car because one optional section is unavailable is worse than
    // answering with that section empty.
    const [specs, variants, cardKinds, related] = await Promise.all([
      getListingSpecs(row.id).catch(() => []),
      getListingVariants(row.id).catch(() => []),
      getCardKindDefs().catch(() => []),
      wantRelated ? getRelatedListings(row, 4).catch(() => []) : Promise.resolve([]),
    ]);

    return ok({
      listing: listingDetail(row, { cardKinds, specs, variants }),
      // Related cars are CARDS, not details. They render as tiles, and four
      // more full listings would quadruple the response for a strip nobody has
      // scrolled to yet.
      related: related.map((r) => listingCard(r, cardKinds)),
    });
  } catch (err) {
    return fail(err.message, 500, 'LISTING_QUERY_FAILED');
  }
}
