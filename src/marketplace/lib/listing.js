import { keywordList } from './seo';
import { findLiveOffer, shapeOffer } from './offer';

/**
 * Listing normalisation — the single place a DB row becomes a UI shape.
 *
 * Every component receives the output of normalizeListing(), never a raw row.
 * That way a column rename touches this file and nothing else, and no component
 * has to know whether the locale suffix is `_ar` or `_en`.
 */

export const LISTING_TYPES = ['part', 'car', 'service', 'accessory'];

/** Types that go through cart → checkout. The rest use offers or bookings. */
export const CART_TYPES = ['part', 'accessory'];

export function isCartType(type) {
  return CART_TYPES.includes(type);
}

/** Which call-to-action the detail page shows — workflow doc §4. */
export function fulfilmentPath(type) {
  if (isCartType(type)) return 'cart';
  if (type === 'car') return 'offer';
  if (type === 'service') return 'booking';
  return 'cart';
}

/**
 * Reads a multilingual value: {"ar": …, "en": …}.
 *
 * Tolerates the object arriving JSON-encoded as a string, and falls back to
 * legacy _ar/_en columns so a half-migrated database still renders.
 */
export function localized(value, locale = 'ar') {
  if (value == null) return '';
  let v = value;
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (!trimmed.startsWith('{')) return v;
    try { v = JSON.parse(trimmed); } catch { return v; }
  }
  if (typeof v !== 'object') return String(v);
  const want = locale === 'en' ? 'en' : 'ar';
  const other = want === 'en' ? 'ar' : 'en';
  // Upstream locale codes are accepted as a last resort, so data synced before
  // the rename still reads.
  const legacy = want === 'en' ? ['en_US', 'ar_001'] : ['ar_001', 'en_US'];
  return v[want] || v[other] || v[legacy[0]] || v[legacy[1]] || '';
}

/** Builds the stored shape from two plain strings, dropping empties. */
export function i18n(ar, en) {
  const out = {};
  if (ar) out.ar = ar;
  if (en) out.en = en;
  return out;
}

/**
 * Field reader with a jsonb-first, columns-second order.
 * `t(row, 'title', locale)` checks row.name/row.title (jsonb) then title_ar/title_en.
 */
const t = (row, field, locale) => {
  if (!row) return '';
  // `title` lives in the `name` column to match product_template; everything
  // else keeps its own name (description → description_json).
  const jsonKey = field === 'title' ? 'name' : field;
  const json = row[jsonKey];
  if (json && typeof json === 'object') return localized(json, locale);
  if (typeof json === 'string' && json.trim().startsWith('{')) return localized(json, locale);

  return row[`${field}_${locale === 'en' ? 'en' : 'ar'}`] ?? row[`${field}_ar`] ?? '';
};

/**
 * SAR formatting. Arabic uses ar-SA digits, English uses Latin — both get the
 * currency symbol from Intl rather than a hardcoded "SAR" string.
 */
export function formatPrice(amount, locale = 'ar') {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '';
  return new Intl.NumberFormat(locale === 'en' ? 'en-SA' : 'ar-SA', {
    style: 'currency',
    currency: 'SAR',
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n);
}

export function normalizeListing(row, locale = 'ar', now = Date.now()) {
  if (!row) return null;

  const media = Array.isArray(row.media) ? row.media : [];
  const primary = media.find((m) => m?.primary) ?? media[0] ?? null;

  /**
   * ── Price, and the seller's offer on top of it ────────────────────────────
   *
   * `listings.price` is the ordinary price and is never written to by an offer
   * (schema.sql §25). The offer is applied HERE, at read time, which is why an
   * offer that ends needs nothing to happen: the next render simply stops
   * finding a live one.
   *
   * The exported `price` is what the buyer actually pays. That is deliberate —
   * every card, the detail page, the lead and the order snapshot all read this
   * one field, so a discounted car cannot show one price and capture another.
   * The pre-offer figure is kept as `compareAt`, which already renders as a
   * struck-through "was" everywhere.
   */
  const listPrice = Number(row.price);
  const rawCompareAt = row.compare_at == null ? null : Number(row.compare_at);

  const offer = shapeOffer(findLiveOffer(row.listing_offers, now), listPrice, now);

  const price = offer ? offer.price : listPrice;

  // With an offer running, the struck-through figure is the higher of the two
  // honest "before" numbers: the list price, or a compare_at the seller had
  // already set. Striking through the lower of them would understate the
  // saving; inventing a number would overstate it.
  const compareAt = offer
    ? Math.max(listPrice, rawCompareAt ?? 0)
    : rawCompareAt;

  const discounted = compareAt != null && compareAt > price;

  return {
    id: row.id,
    slug: row.slug,
    type: row.type,
    state: row.state,
    path: `/marketplace/listing/${row.slug}`,

    title: t(row, 'title', locale),
    description: t(row, 'description', locale),

    price,
    priceLabel: formatPrice(price, locale),
    compareAt,
    compareAtLabel: discounted ? formatPrice(compareAt, locale) : null,
    discountPercent: discounted ? Math.round(((compareAt - price) / compareAt) * 100) : null,
    vatIncluded: row.vat_included !== false,

    /**
     * The running offer, or null.
     *
     * Present so a card can show the seller's own name for it — "عرض رمضان" —
     * and count down to the end. The PRICE is already applied above, so a
     * component that ignores this field still shows the right number; this is
     * for the badge, not the arithmetic.
     */
    offer: offer
      ? {
          ...offer,
          label: offer.label ? localized(offer.label, locale) : null,
          priceLabel: formatPrice(offer.price, locale),
          savingLabel: formatPrice(offer.saving, locale),
        }
      : null,

    // Only parts and accessories carry stock. A car is one-of-one; a service
    // has no inventory at all.
    stock: row.stock,
    inStock: isCartType(row.type) ? Number(row.stock) > 0 : row.state === 'live',

    image: primary?.url ?? null,
    // localized(), not the raw value: a media alt is stored as {ar, en} like
    // every other translatable, and dropping the object straight into an alt
    // attribute renders the literal string "[object Object]" — which is what a
    // screen reader then announces.
    imageAlt: localized(primary?.alt, locale) || t(row, 'title', locale),
    // Each entry's alt localized on the way out, for the same reason.
    media: media.map((m) => ({ ...m, alt: localized(m?.alt, locale) || t(row, 'title', locale) })),

    // The brand's own row, for the logo the card shows beside the name. Absent
    // when the read did not join it — the card falls back to no logo rather
    // than a broken image.
    brand: row.car_brands
      ? {
          id: row.car_brands.id,
          slug: row.car_brands.slug,
          name: t(row.car_brands, 'name', locale),
          logo: row.car_brands.logo_url ?? null,
        }
      : null,

    attributes: row.attributes ?? {},
    city: row.city,
    views: row.views ?? 0,
    fulfilment: fulfilmentPath(row.type),

    vendor: row.vendors
      ? {
          id: row.vendors.id,
          slug: row.vendors.slug,
          name: t(row.vendors, 'name', locale),
          verified: !!row.vendors.verified,
          rating: Number(row.vendors.rating_avg ?? 0),
          ratingCount: row.vendors.rating_count ?? 0,
          path: `/marketplace/vendors/${row.vendors.slug}`,
        }
      : null,

    category: row.categories
      ? {
          id: row.categories.id,
          slug: row.categories.slug,
          name: t(row.categories, 'name', locale),
          path: `/marketplace/c/${row.categories.slug}`,
        }
      : null,

    /**
     * Everything the <head> needs, localized once here.
     *
     * Absent when the read did not ask for the columns — the card select does
     * not — so a caller checks for it rather than getting a `seo` object full
     * of nulls that reads as "this listing has no metadata" when it means
     * "nobody asked the database for any".
     */
    seo: row.meta_title !== undefined
      ? {
          title: t(row, 'meta_title', locale),
          description: t(row, 'meta_description', locale),
          keywords: keywordList(row.meta_keywords?.[locale === 'ar' ? 'ar' : 'en']),
          focusKeyword: t(row, 'focus_keyword', locale),
          canonical: row.canonical_url || null,
          index: row.seo_index !== false,
          follow: row.seo_follow !== false,
          ogTitle: t(row, 'og_title', locale) || t(row, 'meta_title', locale),
          ogDescription: t(row, 'og_description', locale) || t(row, 'meta_description', locale),
          ogImage: row.og_image_url || primary?.url || null,
          ogType: row.og_type || 'product',
          twitterCard: row.twitter_card || 'summary_large_image',
          twitterTitle: t(row, 'twitter_title', locale) || t(row, 'og_title', locale) || t(row, 'meta_title', locale),
          twitterDescription:
            t(row, 'twitter_description', locale) || t(row, 'og_description', locale) || t(row, 'meta_description', locale),
          twitterImage: row.twitter_image_url || row.og_image_url || primary?.url || null,
          // Merged OVER the generated JSON-LD node, so a seller can correct one
          // property without hand-writing the whole graph.
          structuredData: row.structured_data ?? null,
          priority: row.seo_priority ?? 0.5,
          changefreq: row.seo_changefreq ?? 'weekly',
        }
      : null,

    publishedAt: row.published_at,
  };
}

export function normalizeVendor(row, locale = 'ar') {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: t(row, 'name', locale),
    bio: t(row, 'bio', locale),
    verified: !!row.verified,
    city: row.city,
    logo: row.logo_url,
    banner: row.banner_url,
    rating: Number(row.rating_avg ?? 0),
    ratingCount: row.rating_count ?? 0,
    policies: row.policies ?? {},
    listingCount: row.listing_count ?? null,
    path: `/marketplace/vendors/${row.slug}`,
  };
}

export function normalizeCategory(row, locale = 'ar') {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    parentId: row.parent_id,
    name: t(row, 'name', locale),
    type: row.listing_type,
    icon: row.icon,
    path: `/marketplace/c/${row.slug}`,
    children: Array.isArray(row.children) ? row.children.map((c) => normalizeCategory(c, locale)) : [],
  };
}
