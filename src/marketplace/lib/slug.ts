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

/**
 * An ASCII slug, for anything that becomes a PATH SEGMENT.
 *
 * ── Why slugify() is not enough, and is not being changed ───────────────────
 *
 * slugify() deliberately keeps Arabic letters, and for a catalog key that is
 * right: those slugs are matched against each other, never typed, and §30's
 * per-showroom uniqueness is built on the values already stored. Changing it
 * would silently re-slug every brand, model and trim on the next write.
 *
 * A URL is different. A showroom that applied in Arabic got
 * `معرض-الأجيال-للسيارات` as its slug, and the storefront is reachable only
 * while every link to it is percent-encoded — measured on production, a path
 * carrying the raw UTF-8 bytes is transcoded somewhere in the proxy chain into
 * literal `?` characters, so `/vendors/معرض-...` 308s to
 * `/vendors?%3F%3F%3F-...=` and lands on the index with no showroom on it.
 *
 * The links are encoded now and that path works. This is the other half: a
 * slug that never needed encoding in the first place, is readable in a
 * WhatsApp message, and survives being copied through anything. It is the same
 * rule blog_posts already states in schema.sql — "ASCII only, because it is a
 * path segment — an Arabic title is transliterated".
 *
 * ── Transliterated rather than discarded ────────────────────────────────────
 *
 * Dropping the Arabic entirely would make every Arabic-named showroom
 * `showroom-2`, `showroom-3`, which is a worse URL than an encoded one. The
 * map below is the ordinary Arabic→Latin correspondence; it is not reversible
 * and does not need to be, because the slug is an identifier and the NAME is
 * what anybody reads.
 */
const AR_LATIN: Record<string, string> = {
  ا: 'a', أ: 'a', إ: 'i', آ: 'aa', ء: '', ؤ: 'u', ئ: 'i', ى: 'a', ة: 'h',
  ب: 'b', ت: 't', ث: 'th', ج: 'j', ح: 'h', خ: 'kh', د: 'd', ذ: 'dh',
  ر: 'r', ز: 'z', س: 's', ش: 'sh', ص: 's', ض: 'd', ط: 't', ظ: 'z',
  ع: 'a', غ: 'gh', ف: 'f', ق: 'q', ك: 'k', ل: 'l', م: 'm', ن: 'n',
  ه: 'h', و: 'w', ي: 'y',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

export function asciiSlug(input: string | number | Localized | null | undefined): string {
  if (!input) return '';
  const s =
    typeof input === 'object' ? String(input.en_US || input.ar_001 || '') : String(input);

  const latin = Array.from(s)
    .map((ch) => (ch in AR_LATIN ? AR_LATIN[ch] : ch))
    /* Harakat and tatweel carry no sound and would become separators. */
    .join('')
    .replace(/[\u064B-\u0652\u0640]/g, '');

  return latin
    .normalize('NFKD')
    /* Any remaining non-ASCII — a stray diacritic, Urdu, an emoji in a shop
       name — becomes a separator rather than surviving into the path. */
    .replace(/[^\x20-\x7E]/g, ' ')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * A `[slug]` route param, decoded.
 *
 * ── Next hands the same param out in two different forms ────────────────────
 *
 * Measured on Next 16.4.2, requesting a showroom whose slug is Arabic:
 *
 *   generateMetadata   len=21   codepoints 645.639.631…   معرض-الأجيال-للسيارات
 *   the page component len=116  codepoints 25.44.39…      "%D9%85%D8%B9…"
 *
 * `0x25` is `%`. The page is given the RAW percent-encoded string while
 * generateMetadata is given the decoded one, so a lookup in the page searches
 * for a slug that literally contains percent signs, finds nothing, and calls
 * notFound() — while the <title> above it is the real showroom's, because the
 * metadata pass found it. That is the exact symptom: a 404 page with the
 * correct name in the browser tab.
 *
 * Only non-ASCII slugs can show this, which is why it survived: every seeded
 * brand, car and showroom slug is ASCII, where encoded and decoded are the
 * same string.
 *
 * ── Why this is a guard and not a plain decodeURIComponent ──────────────────
 *
 * The param is ALREADY decoded on some paths — generateMetadata, and a client
 * navigation — so decoding unconditionally would be wrong the moment a slug
 * legitimately contains a `%`, and decodeURIComponent throws outright on a
 * lone one ("URIError: URI malformed"), which in a page component is a 500
 * rather than a 404. So: only touch a value that contains a `%`, and keep the
 * original if it does not decode.
 *
 * asciiSlug() means new slugs no longer need any of this. It stays for the
 * ones already in the database, and for any route whose key is a NAME rather
 * than a generated slug.
 */
export function decodeRouteParam(value: string | undefined | null): string {
  if (typeof value !== 'string' || !value.includes('%')) return value ?? '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
