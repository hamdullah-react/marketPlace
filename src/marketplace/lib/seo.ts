/**
 * Search and social metadata for a listing.
 *
 * ONE implementation, shared by the server action that stores it and the
 * listing form that previews it. Two copies of these rules would drift, and
 * the seller would be shown a preview of text that never gets saved.
 *
 * Everything here is a FALLBACK. A seller who writes their own meta title
 * keeps it; this only fills what they left blank, and it is recomputed on
 * every save, so a car renamed from GL to GLX carries a matching title
 * without anyone remembering to go back and edit it.
 *
 * No imports and no secrets — it runs on the server and in the browser.
 */

/** Google shows roughly this much. Past it is written for nobody. */
const TITLE_MAX = 60;
const DESCRIPTION_MAX = 155;

const clean = (s: unknown): string => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Trim to a length without cutting a word in half. */
function clamp(text: string, max: number): string {
  const s = clean(text);
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

/** Bilingual field → one language, tolerating a plain string. */
const pick = (value: unknown, lang: string): string => {
  if (!value) return '';
  if (typeof value === 'string') return clean(value);
  return clean((value as Record<string, unknown>)[lang] ?? '');
};

const NUMBER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

const WORDS = {
  ar: {
    forSale: 'للبيع',
    in: 'في',
    buy: 'اشترِ',
    km: 'كم',
    price: 'السعر',
    sar: 'ريال',
    vat: 'شامل الضريبة',
    contact: 'تواصل مع البائع في سوق الرميح',
    cars: 'سيارات للبيع',
    used: 'سيارات مستعملة',
    market: 'سوق الرميح',
  },
  en: {
    forSale: 'for sale',
    in: 'in',
    buy: 'Buy a',
    km: 'km',
    price: 'Price',
    sar: 'SAR',
    vat: 'VAT included',
    contact: 'Contact the seller on Alromaih Market',
    cars: 'cars for sale',
    used: 'used cars',
    market: 'Alromaih Market',
  },
};

/**
 * @param {object} input
 * @param {object} input.brand      {ar, en}
 * @param {object} input.model      {ar, en}
 * @param {object} input.trim       {ar, en}
 * @param {string|number} input.year
 * @param {string} input.city
 * @param {object} input.condition  {ar, en} — "New" / "Used"
 * @param {number} input.mileage
 * @param {number} input.price
 * @param {object} input.description {ar, en} — the seller's own copy
 * @param {Array<object>} input.facts [{ar, en}] — transmission, fuel, …
 * @returns {{title: object, description: object, keywords: object}} each {ar, en}
 */
/** Everything the generated title/description/keywords are built from. */
export type ListingSeoInput = {
  brand?: unknown;
  model?: unknown;
  trim?: unknown;
  year?: unknown;
  city?: unknown;
  condition?: unknown;
  description?: unknown;
  facts?: unknown[];
  mileage?: unknown;
  price?: unknown;
};

export function listingSeo(input: ListingSeoInput = {}) {
  const build = (lang: string) => {
    const w = WORDS[lang as keyof typeof WORDS] ?? WORDS.ar;

    const brand = pick(input.brand, lang);
    const model = pick(input.model, lang);
    const trim = pick(input.trim, lang);
    const year = clean(input.year);
    const city = clean(input.city);
    const condition = pick(input.condition, lang);
    const car = [brand, model, trim, year].filter(Boolean).join(' ');

    if (!car) return { title: '', description: '', keywords: [], focus: '' };

    /* ── Title ──────────────────────────────────────────────────────────
       The car, then where it is. City goes last on purpose: it is the first
       thing to lose when the name alone is already long, and a title cut off
       mid-word in a result page reads as broken. */
    const withCity = city ? `${car} ${w.forSale} ${w.in} ${city}` : `${car} ${w.forSale}`;
    const title = withCity.length <= TITLE_MAX ? withCity : clamp(car, TITLE_MAX);

    /* ── Description ────────────────────────────────────────────────────
       The seller's own words win outright — nobody writes a better summary of
       a specific car than the person selling it. The generated sentence is for
       the listings that have none, which is most of them. */
    const own = pick(input.description, lang);
    let description;

    if (own) {
      description = clamp(own, DESCRIPTION_MAX);
    } else {
      const facts = (input.facts ?? [])
        .map((f: unknown) => pick(f, lang))
        .filter(Boolean);

      if (input.mileage) facts.unshift(`${NUMBER.format(Number(input.mileage))} ${w.km}`);

      const opening = lang === 'ar'
        ? `${w.buy} ${[condition, car].filter(Boolean).join(' ')}${city ? ` ${w.in} ${city}` : ''}.`
        : `${w.buy} ${[condition.toLowerCase(), car].filter(Boolean).join(' ')}${city ? ` ${w.in} ${city}` : ''}.`;

      const priceLine = input.price
        ? ` ${w.price}: ${NUMBER.format(Number(input.price))} ${w.sar}, ${w.vat}.`
        : '';

      description = clamp(
        `${opening}${facts.length ? ` ${facts.join(' · ')}.` : ''}${priceLine} ${w.contact}.`,
        DESCRIPTION_MAX
      );
    }

    /* ── Keywords ───────────────────────────────────────────────────────
       An ARRAY of phrases, not one comma-joined string.
       A string forces every reader to re-split it and every writer to agree on
       the separator — and Arabic uses ، not , so the two languages would have
       split differently. A list is a list.

       Only terms a person would actually type. No keyword stuffing: search
       engines have ignored the tag for years, and the one place it still does
       work is our own site search, which wants real phrases. */
    const keywords = [
      car,
      [brand, model].filter(Boolean).join(' '),
      brand,
      model,
      city ? `${[brand, model].filter(Boolean).join(' ')} ${w.in} ${city}` : '',
      city ? `${w.cars} ${w.in} ${city}` : w.cars,
      condition ? `${condition} ${brand}`.trim() : '',
      w.market,
    ]
      .map(clean)
      .filter((k, i, all) => k && all.indexOf(k) === i);

    /* The one phrase the page is trying to win. Brand + model, because that is
       what a buyer types — not the full trim-and-year string, which almost
       nobody searches verbatim. */
    const focus = [brand, model].filter(Boolean).join(' ') || car;

    return { title, description, keywords, focus };
  };

  const ar = build('ar');
  const en = build('en');

  return {
    title: { ar: ar.title, en: en.title },
    description: { ar: ar.description, en: en.description },
    // Arrays, one per language.
    keywords: { ar: ar.keywords, en: en.keywords },
    focus: { ar: ar.focus, en: en.focus },
  };
}

/**
 * Keyword lists, tolerant of everything they have ever been stored as.
 *
 * They started life as a comma-joined string and are arrays now, and rows
 * written before that change are still in the table. Reading is where the two
 * shapes get reconciled — once, here — rather than in each of the four places
 * that render them. Splits on the Latin comma AND the Arabic one, which is a
 * different character and would otherwise leave "سيارات، جديد" as one keyword.
 */
export function keywordList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  return String(value)
    .split(/[,،\n]/)
    .map(clean)
    .filter(Boolean);
}
