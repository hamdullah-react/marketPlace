/**
 * Listing slugs.
 *
 * The main site can slug a car by name alone — it has one inventory, so
 * "camry-2022-gle" is unique by construction. A marketplace cannot: two sellers
 * list the same car on the same day.
 *
 * So a listing slug is a readable stem plus the row's own public_ref:
 *
 *   toyota-camry-2022-gle-a3f91b7c
 *   toyota-camry-2022-gle-4d2e0918   ← same car, different seller
 *
 * The stem is for humans and search engines; public_ref is what makes it
 * unique. See migrations/0006_car_catalog.sql for why this beats a -2/-3
 * counter or namespacing under the vendor.
 */

/** Arabic is kept as-is; Latin is lowercased and stripped. Both collapse runs of separators. */
/** A bilingual jsonb name, as the catalog stores it. */
export type Localized = { en_US?: string; ar_001?: string; [key: string]: unknown };

export function slugify(input: string | number | Localized | null | undefined): string {
  if (!input) return '';
  const s =
    typeof input === 'object' ? String(input.en_US || input.ar_001 || '') : String(input);

  // Arabic text has no case and its letters survive \w poorly, so it takes a
  // simpler path: keep the letters, replace whitespace and punctuation.
  if (/[؀-ۿ]/.test(s)) {
    return s.trim().replace(/[^؀-ۿ0-9a-zA-Z]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  }

  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Slug for an option kind — underscores, not hyphens.
 *
 * Kinds are machine keys the code looks up by name (`body_type`, `fuel`), and
 * the ones already in car_attributes use underscores. Running one through the
 * plain slugify() would return `body-type`, because it collapses `_` into `-`
 * like any other separator — which would quietly rename the kind and empty
 * that dropdown in the listing form. So the separator is put back.
 */
export function kindSlug(input: string | number | Localized | null | undefined): string {
  return slugify(input).replace(/-/g, '_');
}

/**
 * Readable stem from the catalog entry. Falls back through what is available so
 * a half-filled draft still produces something sane.
 *
 */
export type ListingStemParts = {
  brand?: string | null;
  model?: string | null;
  year?: number | string | null;
  trim?: string | null;
  title?: string | null;
};

export function listingStem(parts: ListingStemParts = {}): string {
  const ordered = [parts.brand, parts.model, parts.year, parts.trim]
    .filter(Boolean)
    .map(slugify)
    .filter(Boolean);

  if (ordered.length) return ordered.join('-');
  return slugify(parts.title) || 'listing';
}

/**
 * Final slug. `publicRef` comes from the DB default (8 hex chars) — never
 * generate it in app code, or two concurrent inserts can pick the same value
 * before either commits.
 */
export function listingSlug(parts: ListingStemParts, publicRef: string): string {
  if (!publicRef) throw new Error('listingSlug: publicRef is required — read it back from the inserted row.');
  return `${listingStem(parts)}-${publicRef}`;
}

/** Catalog URLs — these are the pages meant to rank, one per real-world car. */
export const catalogPath = {
  brand: (brand: string) => `/marketplace/cars/${brand}`,
  model: (brand: string, model: string) => `/marketplace/cars/${brand}/${model}`,
  variant: (brand: string, model: string, year?: number | string | null, trim?: string | null) =>
    `/marketplace/cars/${brand}/${model}/${[year, trim].filter(Boolean).map(slugify).join('-')}`,
};

/** Pull the public_ref back out of a slug — useful for redirects after a retitle. */
export function refFromSlug(slug: string | null | undefined): string | null {
  const m = String(slug || '').match(/-([0-9a-f]{8})$/);
  return m?.[1] ?? null;
}
