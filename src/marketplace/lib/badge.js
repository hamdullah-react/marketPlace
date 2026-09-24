/**
 * The colours a promotion badge can wear.
 *
 * ── Why a fixed list and not a colour picker ────────────────────────────────
 *
 * A badge is small, sits on a photograph and carries white or near-black text,
 * so it has exactly one job: stay readable. A free hex produces #F9F871 on
 * white text about as often as it produces something usable, and the person
 * choosing is picking a name off a Catalog row rather than designing.
 *
 * Each entry therefore pairs a background with the ink that reads on it, and
 * both are written as literal class strings — Tailwind scans source text, so a
 * class assembled as `bg-${colour}-500` would simply not be generated.
 *
 * ── Where the colour comes from ─────────────────────────────────────────────
 *
 * offer_names.color, chosen once on the Catalog row ("Ramadan deal" is always
 * gold, "Clearance" is always red), then carried to the card with the offer.
 * `gold` is the default, which is what every offer badge was before this
 * existed — an install that sets nothing looks exactly as it did.
 */

export const BADGE_COLORS = {
  gold: {
    ar: 'ذهبي', en: 'Gold',
    swatch: '#D4AF37',
    className: 'bg-brand-gold text-[#2a2100]',
  },
  red: {
    ar: 'أحمر', en: 'Red',
    swatch: '#DC2626',
    className: 'bg-red-600 text-white',
  },
  orange: {
    ar: 'برتقالي', en: 'Orange',
    swatch: '#EA580C',
    className: 'bg-orange-600 text-white',
  },
  green: {
    ar: 'أخضر', en: 'Green',
    swatch: '#15803D',
    className: 'bg-green-700 text-white',
  },
  teal: {
    ar: 'فيروزي', en: 'Teal',
    swatch: '#0D9488',
    className: 'bg-teal-600 text-white',
  },
  blue: {
    ar: 'أزرق', en: 'Blue',
    swatch: '#1D4ED8',
    className: 'bg-blue-700 text-white',
  },
  purple: {
    ar: 'بنفسجي', en: 'Purple',
    swatch: '#6D28D9',
    className: 'bg-violet-700 text-white',
  },
  pink: {
    ar: 'وردي', en: 'Pink',
    swatch: '#DB2777',
    className: 'bg-pink-600 text-white',
  },
  slate: {
    ar: 'رمادي', en: 'Slate',
    swatch: '#334155',
    className: 'bg-slate-700 text-white',
  },
  black: {
    ar: 'أسود', en: 'Black',
    swatch: '#111827',
    className: 'bg-neutral-900 text-white',
  },
  /* The brand colour itself, for a showroom that wants its promotions to look
     like the rest of the site rather than stand apart from it. Follows Admin →
     Settings → Appearance, so it changes with the theme. */
  brand: {
    ar: 'لون الموقع', en: 'Brand',
    swatch: 'var(--brand-primary)',
    className: 'bg-brand-primary text-white',
  },
};

export const DEFAULT_BADGE_COLOR = 'gold';

/** The picker's list, in the order it is offered. */
export const BADGE_COLOR_OPTIONS = Object.entries(BADGE_COLORS).map(([value, c]) => ({
  value,
  ar: c.ar,
  en: c.en,
  swatch: c.swatch,
  className: c.className,
}));

/** A stored value → a known token. Anything unrecognised is the default. */
export const badgeToken = (value) => {
  const key = String(value ?? '').trim().toLowerCase();
  return key in BADGE_COLORS ? key : DEFAULT_BADGE_COLOR;
};

/**
 * The classes for a badge of this colour.
 *
 * Takes the raw stored value rather than a token, so callers do not each have
 * to remember to normalise first — a null, a blank or a colour someone removed
 * from the list all come back as the default rather than as no classes at all,
 * which would render white text on a transparent pill.
 */
export const badgeClass = (value) => BADGE_COLORS[badgeToken(value)].className;
