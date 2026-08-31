/**
 * The public JSON shape of a listing.
 *
 * ── Two shapes, on purpose ──────────────────────────────────────────────────
 *
 *   listingCard(row)    the LIST endpoint. A grid tile: one image, the price,
 *                       and up to MAX_HIGHLIGHTS facts. No description, no
 *                       spec sheet, no colour variants, no media gallery.
 *
 *   listingDetail(row)  the SLUG endpoint. Everything about one car.
 *
 * They are separate functions rather than one with a `full` flag because the
 * cost difference is the entire point: a list of 48 cars carrying every
 * description and every photo URL is a payload nobody on that screen reads.
 *
 * ── Nothing is localized ────────────────────────────────────────────────────
 *
 * Every translatable field comes back as the raw `{ ar, en }` object:
 *
 *     "name": { "ar": "تويوتا كامري ٢٠٢١", "en": "Toyota Camry 2021" }
 *
 * The site's own pages call the query layer directly and localize there, so the
 * only consumers of THIS are external — a mobile app, a partner feed, another
 * front end — and those know their user's language while the server does not.
 * Picking one here would mean either a `?locale=` on every call or a second
 * request to get the other language. Both are worse than sending ~30 bytes.
 *
 * A field may be `{ar: "..."}` with no `en`, or `{}`. That is the catalog
 * telling the truth about a missing translation; do not paper over it with a
 * fallback here, or a consumer can never tell "not translated" from "translated
 * identically".
 */

/** Facts on a card. Four is what a tile holds before it stops being scannable. */
export const MAX_HIGHLIGHTS = 4;

/** A jsonb translatable, normalised to a plain object. Never null, so `.ar` is always safe. */
const i18n = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  // Some very old rows stored a JSON string rather than jsonb.
  if (typeof value === 'string' && value.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
};

const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

const mediaList = (row) => (Array.isArray(row.media) ? row.media : []);

/** The image a card shows: the one flagged primary, else the first uploaded. */
const primaryImage = (row) => {
  const media = mediaList(row);
  const found = media.find((m) => m?.primary) ?? media[0] ?? null;
  if (!found) return null;
  return { url: found.url ?? null, alt: i18n(found.alt) };
};

const priceBlock = (row) => {
  const price = num(row.price);
  const compareAt = num(row.compare_at);
  const discounted = compareAt != null && price != null && compareAt > price;

  return {
    price,
    compareAt,
    // Precomputed because every consumer would otherwise recompute it, and
    // half of them would round it differently.
    discountPercent: discounted ? Math.round(((compareAt - price) / compareAt) * 100) : null,
    currency: row.currency ?? 'SAR',
    vatIncluded: row.vat_included !== false,
  };
};

const vendorBlock = (row) =>
  row.vendors
    ? {
        id: row.vendors.id,
        slug: row.vendors.slug,
        name: i18n(row.vendors.name),
        verified: !!row.vendors.verified,
        rating: num(row.vendors.rating_avg),
        ratingCount: row.vendors.rating_count ?? null,
      }
    : null;

/**
 * The card's fact row, built from the kinds a seller flagged "show on card"
 * in the Catalog → Kinds tab.
 *
 * This is the whole reason the endpoint takes `cardKinds`: WHICH facts appear
 * is a catalog decision, not an API one. Hardcoding fuel / transmission / seats
 * here would mean a kind someone adds tomorrow never reaches a consumer, which
 * is exactly the bug the listing form had.
 *
 * A kind the listing never answered is skipped rather than emitted as null —
 * four present facts beat six with two blanks. `year` and `mileage_km` are NOT
 * in here; they are top-level fields, since every car has them and neither is
 * an option kind.
 *
 * @param attributes  listings.attributes — { fuel: 'petrol', … }, values are slugs
 * @param cardKinds   from getCardKindDefs(), already ordered by the kind's sequence
 */
function highlights(attributes, cardKinds) {
  const answers = attributes ?? {};
  const out = [];

  for (const def of cardKinds ?? []) {
    if (out.length >= MAX_HIGHLIGHTS) break;

    const slug = answers[def.kind];
    if (!slug) continue;

    out.push({
      kind: def.kind,
      name: i18n(def.name),
      icon: def.icon ?? null,
      value: {
        slug,
        // Empty when the option was renamed or removed after this listing was
        // saved. The slug is still there, so a consumer can show something.
        name: i18n(def.values?.[slug]),
      },
    });
  }

  return out;
}

export function listingCard(row, cardKinds = []) {
  if (!row) return null;
  const attributes = row.attributes ?? {};

  return {
    id: row.id,
    slug: row.slug,
    type: row.type,
    path: `/marketplace/listing/${row.slug}`,

    name: i18n(row.name),

    ...priceBlock(row),

    // ONE image. The row carries the whole media array because PostgREST cannot
    // slice jsonb, but only this reaches the client.
    image: primaryImage(row),
    imageCount: mediaList(row).length,

    city: row.city ?? null,
    views: row.views ?? 0,

    // The brand, for the logo a card shows beside the name. `logo` is null
    // until someone uploads one in Catalog → Brands; there is no placeholder,
    // because a stand-in mark on a real brand is worse than none.
    brand: row.car_brands
      ? {
          id: row.car_brands.id,
          slug: row.car_brands.slug,
          name: i18n(row.car_brands.name),
          logo: row.car_brands.logo_url ?? null,
        }
      : null,

    // Universal facts, always present, never part of the highlight budget.
    year: num(attributes.year),
    mileageKm: num(attributes.mileage_km),

    highlights: highlights(attributes, cardKinds),

    vendor: vendorBlock(row),
    publishedAt: row.published_at ?? null,
  };
}

/**
 * Everything about one listing.
 *
 * `attributes` is passed through whole IN ADDITION to `highlights`, because a
 * detail consumer may well want a kind the seller chose not to put on the card.
 * The card endpoint deliberately does not do this.
 */
export function listingDetail(row, { cardKinds = [], specs = [], variants = [] } = {}) {
  if (!row) return null;
  const attributes = row.attributes ?? {};

  return {
    id: row.id,
    slug: row.slug,
    type: row.type,
    state: row.state,
    path: `/marketplace/listing/${row.slug}`,

    name: i18n(row.name),
    description: i18n(row.description),

    ...priceBlock(row),
    availableOnRequest: !!row.available_on_request,
    stock: row.stock ?? null,

    media: mediaList(row).map((m) => ({
      url: m?.url ?? null,
      alt: i18n(m?.alt),
      category: m?.category ?? null,
      primary: !!m?.primary,
    })),
    image: primaryImage(row),

    city: row.city ?? null,
    views: row.views ?? 0,

    year: num(attributes.year),
    mileageKm: num(attributes.mileage_km),
    // Raw, so nothing a seller entered is lost on the way out.
    attributes,
    highlights: highlights(attributes, cardKinds),

    specs: specs.map((s) => ({
      id: s.id,
      slug: s.spec_attributes?.slug ?? null,
      category: i18n(s.spec_attributes?.category_name),
      name: i18n(s.spec_attributes?.attribute_name),
      icon: s.spec_attributes?.attribute_icon_url ?? null,
      // Through i18n() like every other translatable: the column is still text
      // until the unit_code migration in schema.sql runs, so it can arrive as a
      // stringified object. i18n() parses that shape, so the API returns
      // { ar, en } either way rather than leaking raw JSON to a consumer.
      unit: i18n(s.spec_attributes?.unit_code),
      displayType: s.spec_attributes?.display_type ?? null,
      showOnCard: !!s.spec_attributes?.show_on_card,
      isKey: !!s.spec_attributes?.is_key,
      // `value` holds the durable answer (an option id, a number, a boolean);
      // displayValue is the text that was rendered when it was saved.
      value: s.value ?? null,
      displayValue: s.display_value ?? null,
    })),

    variants: variants.map((v) => ({
      id: v.id,
      colorId: v.color_id,
      name: i18n(v.name?.ar || v.name?.en ? v.name : v.car_colors?.name),
      hex: v.car_colors?.hex ?? null,
      primary: !!v.is_primary,
      media: (Array.isArray(v.media) ? v.media : []).map((m) => ({
        url: m?.url ?? null,
        alt: i18n(m?.alt),
      })),
    })),

    warrantyMonths: row.warranty_months ?? null,
    countryOfOrigin: row.country_of_origin ?? null,
    hasTestDrive: !!row.has_test_drive,

    seo: {
      title: i18n(row.meta_title),
      description: i18n(row.meta_description),
      canonicalUrl: row.canonical_url ?? null,
    },

    vendor: vendorBlock(row),
    category: row.categories
      ? { id: row.categories.id, slug: row.categories.slug, name: i18n(row.categories.name) }
      : null,

    publishedAt: row.published_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}
