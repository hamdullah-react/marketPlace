/**
 * What the rail and the chips over the grid both need to know.
 *
 * Plain module, no "use client" — it holds only data, so it can be imported
 * from a server component too without dragging a client boundary with it.
 */

/**
 * Every param the rail can set.
 *
 * ONE list, used in three places: counting what is active, knowing what
 * "Reset All" has to remove, and building the chips over the grid. A filter
 * added to the rail and forgotten here would be one that no chip shows and no
 * Clear button removes — invisible, and stuck.
 */
export const FILTER_KEYS = [
  'q', 'brand', 'model', 'trim', 'color', 'seats', 'year', 'city', 'vendor',
  'min_price', 'max_price', 'min_year', 'max_year', 'max_mileage',
  'condition', 'transmission', 'fuel', 'offer', 'has_offer', 'featured',
];

/** Params whose value is a comma-joined list rather than a single value. */
export const MULTI_KEYS = new Set([
  'condition', 'transmission', 'fuel', 'brand', 'model', 'trim', 'color',
  'seats', 'year', 'offer',
]);

/**
 * The prefix generic catalog attributes use in the URL: `attr_body=suv`.
 *
 * Namespaced so a kind the catalog adds tomorrow cannot collide with a param
 * this page already owns — a kind slugged `city` or `sort` would otherwise
 * quietly take over a filter or the sort order.
 */
export const KIND_PREFIX = 'attr_';

/** The generic-attribute params out of a URLSearchParams, as {kind: [values]}. */
export function kindsFromParams(searchParams) {
  const out = {};
  for (const [k, v] of searchParams.entries()) {
    if (!k.startsWith(KIND_PREFIX)) continue;
    const values = String(v).split(',').filter(Boolean);
    if (values.length) out[k.slice(KIND_PREFIX.length)] = values;
  }
  return out;
}

/**
 * The words for the values the catalog stores as slugs.
 *
 * Shared so a chip and the pill it came from cannot word the same answer two
 * different ways.
 */
export const VALUE_LABELS = {
  used: { ar: 'مستعمل', en: 'Used' },
  new: { ar: 'جديد', en: 'New' },
  automatic: { ar: 'أوتوماتيك', en: 'Automatic' },
  manual: { ar: 'عادي', en: 'Manual' },
  petrol: { ar: 'بنزين', en: 'Petrol' },
  diesel: { ar: 'ديزل', en: 'Diesel' },
  hybrid: { ar: 'هجين', en: 'Hybrid' },
  electric: { ar: 'كهرباء', en: 'Electric' },
};

/** A value's label in this locale, or the raw value when the catalog has none. */
export function valueLabel(value, locale) {
  return VALUE_LABELS[value]?.[locale === 'ar' ? 'ar' : 'en'] ?? value;
}

/**
 * The prefix spec-sheet filters use in the URL: `spec_transmission=CVT`.
 *
 * A different namespace from KIND_PREFIX because they are different tables
 * with independent slugs — `transmission` exists in BOTH, and one silently
 * shadowing the other is a filter that appears to work and does not.
 */
export const SPEC_PREFIX = 'spec_';

/** The spec-sheet params out of a URLSearchParams, as {slug: [values]}. */
export function specsFromParams(searchParams) {
  const out = {};
  for (const [k, v] of searchParams.entries()) {
    if (!k.startsWith(SPEC_PREFIX) || k.endsWith('_range')) continue;
    const values = String(v).split(',').filter(Boolean);
    if (values.length) out[k.slice(SPEC_PREFIX.length)] = values;
  }
  return out;
}
