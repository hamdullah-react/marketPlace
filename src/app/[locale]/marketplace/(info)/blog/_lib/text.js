/**
 * The two things every blog page needs from a stored row.
 *
 * Shared rather than duplicated because the list and the article have to agree:
 * a title that falls back on one page and not on the other looks like two
 * different articles.
 */

/**
 * A bilingual value in the reader's language.
 *
 * Falls back to the other language ONLY when Settings → Language allows it.
 * That switch exists because a fallback is the right answer for a marketplace
 * serving both languages and the wrong one for a site that has decided it is
 * Arabic — there, an English string appearing mid-page is a bug, not a courtesy.
 */
export function pickText(value, locale, allowFallback = false) {
  if (!value || typeof value !== 'object') return typeof value === 'string' ? value : '';

  const own = String(value[locale] ?? '').trim();
  if (own) return own;
  if (!allowFallback) return '';

  const other = locale === 'ar' ? 'en' : 'ar';
  return String(value[other] ?? '').trim();
}

/** Which language of the body to render, or null when there is none to show. */
export function pickDoc(body, locale, allowFallback, hasContent) {
  if (hasContent(body?.[locale])) return locale;
  const other = locale === 'ar' ? 'en' : 'ar';
  if (allowFallback && hasContent(body?.[other])) return other;
  return null;
}

/**
 * A publication date, written out.
 *
 * Gregorian even in Arabic (`ar-SA-u-ca-gregory`): ar-SA defaults to the Hijri
 * calendar, and "15 ربيع الأول" next to an article about a 2024 model year is
 * a date most readers would have to convert before it meant anything.
 */
export function formatDate(iso, locale) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleDateString(locale === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Roughly how long this will take to read, in minutes. */
export function readingMinutes(doc) {
  let words = 0;

  const walk = (node) => {
    if (!node) return;
    if (node.type === 'text' && typeof node.text === 'string') {
      // Counts Arabic and Latin alike — both separate words with spaces.
      words += node.text.trim().split(/\s+/).filter(Boolean).length;
    }
    for (const child of node.content ?? []) walk(child);
  };

  walk(doc);
  // 200 wpm is the usual figure; never show "0 min".
  return Math.max(1, Math.round(words / 200));
}
