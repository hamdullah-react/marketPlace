import { cache } from 'react';
import { getListingBySlug, getRelatedListings, getSiblingTrims } from '@/marketplace/db/queries/listings';
import { getListingVariants, normalizeVariant } from '@/marketplace/db/queries/media';
import {
  getListingSpecs, buildSpecSheet, cardSpecs, getCardSpecs,
} from '@/marketplace/db/queries/specs';
import { getKindsWithOptions } from '@/marketplace/db/queries/attributes';
import { normalizeListing, localized } from '@/marketplace/lib/listing';

/**
 * Everything the listing page reads — metadata, body and related, separately.
 *
 * Each of these is called more than once per request: generateMetadata and the
 * page both need the listing, and the page's two Suspense boundaries both need
 * the row. React's cache() memoises per request, so the row is fetched ONCE no
 * matter how many callers ask for it. Without it, splitting the page into
 * streaming sections would have quietly tripled the query count.
 *
 * They call the query layer directly rather than fetching /api/marketplace/*.
 * The page is a server component, so an HTTP hop to our own route would cost a
 * round trip and the connection pool for nothing. The HTTP routes are for
 * CLIENT code and sit on this same query layer.
 */

/** The raw row, memoised. Everything below is built from this one read. */
const loadRow = cache(async (slug) => getListingBySlug(slug).catch(() => null));

/**
 * Just enough for <head> and the breadcrumb. Deliberately narrower than the
 * body read — pulling variants for a <title> would be waste.
 *
 * Returns null when the slug is unknown, so the caller chooses between a
 * noindex head and notFound().
 */
export const getListingMeta = cache(async (slug, locale = 'ar') => {
  const row = await loadRow(slug);
  return row ? normalizeListing(row, locale) : null;
});

/** Gallery, specs and the buy panel. */
export const getListingPageData = cache(async (slug, locale = 'ar') => {
  const row = await loadRow(slug);
  if (!row) return null;

  // Variants are optional — a missing table must not take down a page whose
  // main content already loaded.
  // Both optional and independent — a missing variants table or an
  // unreachable catalog must not take down a page whose car already loaded.
  const [variantRows, kinds, specRows, siblingRows] = await Promise.all([
    getListingVariants(row.id).catch(() => []),
    getKindsWithOptions().catch(() => []),
    getListingSpecs(row.id).catch(() => []),
    getSiblingTrims(row, 6).catch(() => []),
  ]);

  /**
   * The spec tiles, resolved against the CATALOG.
   *
   * This page used to carry its own FUEL_LABELS and TRANSMISSION_LABELS maps,
   * which meant three things at once: a fifth fuel type added in the Catalog
   * rendered as the raw slug `lpg`, a seller-created kind never appeared here
   * at all, and renaming an option in the Catalog changed it everywhere except
   * this page. Reading the same table the listing form writes from removes all
   * three, and the tiles now follow the kind's own display order.
   */
  const attributes = row.attributes ?? {};
  const kindFacts = kinds
    .map((k) => {
      const slug = attributes[k.kind];
      if (!slug) return null;
      const option = k.options.find((o) => o.slug === slug);
      return {
        kind: k.kind,
        label: localized(k.name, locale) || k.kind,
        icon: k.iconUrl ?? null,
        // Falls back to the stored slug when the option was renamed away after
        // this listing was saved — better than an empty tile.
        value: (option && localized(option.name, locale)) || slug,
      };
    })
    .filter(Boolean);

  /**
   * The full spec sheet, grouped by category — the section this page never had.
   *
   * listing_specs has been written by the seller form since specs existed, and
   * buildSpecSheet has been sitting in the query layer unused: the public page
   * showed six attribute tiles and called that "Specifications", so everything
   * a seller filled in on the Specifications tab was invisible to buyers. This
   * is the same sheet the main site's car page renders.
   */
  const specSheet = buildSpecSheet(specRows, locale);

  /**
   * The Variants strip: this car's trim, plus every sibling trim of the same
   * model and year. Flattened here rather than in the component because the
   * card only ever shows four things, and shipping whole listing rows to the
   * client for a 80px tile is waste.
   *
   * `current` is always present so the strip can highlight where you are, the
   * way the main site does; the component renders nothing when `others` is
   * empty, because one card is not a choice.
   */
  const trimCard = (r) => ({
    id: r.id,
    slug: r.slug,
    path: `/marketplace/listing/${r.slug}`,
    // The trim name is the label — "GLX", not "Suzuki Fronx GLX 2026", which
    // would not survive an 80px card. Falls back to the listing title when a
    // listing has no trim in the catalog.
    name: localized(r.car_trims?.name, locale) || localized(r.name, locale),
    price: Number(r.price) || 0,
    image: (Array.isArray(r.media) ? r.media : []).find((m) => m?.primary)?.url
      ?? (Array.isArray(r.media) ? r.media : [])[0]?.url
      ?? null,
  });

  return {
    listing: normalizeListing(row, locale),
    variants: variantRows.map((v) => normalizeVariant(v, locale)),
    trims: { current: trimCard(row), others: siblingRows.map(trimCard) },
    kindFacts,
    specSheet,
    // The handful flagged key / show-on-card, for the tile strip above the
    // sheet. Same helper the main site's "Car Information" row uses.
    keySpecs: cardSpecs(specSheet, 12),
  };
});

/**
 * "Similar cars". Split out so it streams behind its own boundary — a slow
 * related-cars scan should never hold up the car the visitor came to see.
 */
export const getSimilarCars = cache(async (slug, locale = 'ar') => {
  const row = await loadRow(slug);
  if (!row) return { cars: [], cardSpecs: {} };

  // The related row uses the same CarCard as the browse grid, so it needs the
  // same catalog-driven fact list — otherwise the two would disagree about
  // what a car card shows.
  const rows = await getRelatedListings(row, 4).catch(() => []);
  // Which facts a card shows is a catalog decision — the specifications
  // flagged "show on card". One read for the whole page: doing it per card
  // would be a round trip each for a four-icon row.
  const specsByListing = await getCardSpecs(rows.map((r) => r.id), locale)
    .catch(() => new Map());

  return {
    cars: rows.map((r) => normalizeListing(r, locale)),
    cardSpecs: Object.fromEntries(specsByListing),
  };
});
