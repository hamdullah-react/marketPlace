import { getLiveListingCards } from '@/marketplace/db/queries/listings';
import { getCardKindDefs } from '@/marketplace/db/queries/attributes';
import { listingCard, MAX_HIGHLIGHTS } from '@/app/api/marketplace/_lib/listing-shape';
import { ok, fail } from '@/app/api/marketplace/_lib/response';

/**
 * GET /api/marketplace/listings — a page of live listings, in CARD shape.
 *
 * Deliberately lean. This endpoint answers "show me a grid", so it returns one
 * image per row and at most MAX_HIGHLIGHTS facts, and it never returns the
 * description, the spec sheet, the colour variants or the rest of the gallery.
 * Ask /listings/[slug] for those — one car at a time is where that cost belongs.
 *
 * Which facts appear is a CATALOG decision, not one made here: the kinds
 * flagged "show on card" in Catalog → Kinds, in their own order. Flag a fifth
 * and the fifth kind by sequence is the one that drops off.
 *
 * Names come back as { ar, en } — see _lib/listing-shape.js for why.
 *
 *   ?type=car&city=Riyadh&min_price=50000&max_price=200000
 *   ?q=camry&sort=price_asc&limit=24&offset=0
 *   ?vendor_id=…&category_id=…
 */

/** Above this a "card grid" is really a data export, and the payload stops being cheap. */
const MAX_LIMIT = 48;
const DEFAULT_LIMIT = 24;

const SORTS = ['newest', 'price_asc', 'price_desc', 'popular'];

export async function GET(request) {
  const p = new URL(request.url).searchParams;

  const num = (key) => {
    const v = p.get(key);
    if (v == null || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  try {
    // Clamped, not trusted. `limit=100000` is one request that reads the table.
    const limit = Math.min(Math.max(num('limit') ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const offset = Math.max(num('offset') ?? 0, 0);

    const sort = SORTS.includes(p.get('sort')) ? p.get('sort') : 'newest';

    // Both at once: neither read needs the other, and the kind list is small
    // and identical for every row on the page.
    const [{ items, total }, cardKinds] = await Promise.all([
      getLiveListingCards({
        type: p.get('type') ?? undefined,
        categoryId: p.get('category_id') ?? undefined,
        vendorId: p.get('vendor_id') ?? undefined,
        city: p.get('city') ?? undefined,
        minPrice: num('min_price'),
        maxPrice: num('max_price'),
        q: p.get('q') ?? undefined,
        sort,
        limit,
        offset,
      }),
      getCardKindDefs(),
    ]);

    return ok({
      items: items.map((row) => listingCard(row, cardKinds)),
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
      // So a consumer can render the fact row's labels once rather than reading
      // them off the first item and hoping every other item agrees.
      cardKinds: cardKinds.slice(0, MAX_HIGHLIGHTS).map((k) => ({
        kind: k.kind,
        name: k.name ?? {},
        icon: k.icon,
      })),
    });
  } catch (err) {
    return fail(err.message, 500, 'LISTINGS_QUERY_FAILED');
  }
}
