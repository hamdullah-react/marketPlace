/**
 * Matching what somebody typed against what is on the row.
 *
 * ── Why this is not `a.includes(b)` ─────────────────────────────────────────
 *
 * Because half of this marketplace is in Arabic, and in Arabic a reader and a
 * typist do not agree on which letter they used. The same showroom is written
 * "الأحمدي" and "الاحمدي"; the same word ends in ة or in ه; "مركز" may arrive
 * with a tatweel stretched through it as "مـركـز". Every one of those is one
 * word to a person and four different strings to `includes`, so a plain
 * substring search answers "no results" for a showroom that is on the screen
 * behind the box.
 *
 * `fold()` reduces both sides to the same shape first:
 *
 *   · case, so English matches whatever it was typed in
 *   · أ إ آ ٱ → ا   the hamza forms nobody types consistently
 *   · ى → ي, ة → ه, ؤ → و, ئ → ي
 *   · the tashkeel marks and the tatweel, removed
 *   · ٠١٢٣ and ۰۱۲۳ → 0123, so a phone number typed in either set of digits
 *     finds a phone number stored in the other
 *
 * ── Deliberately a local match, and only where the set is small ─────────────
 *
 * This runs in JS over rows already fetched, which is right for a list bounded
 * by its own nature — one platform's showrooms, one page of promotions — and
 * wrong for anything that pages. A searchable table with thousands of rows
 * filters at the DATABASE, over all of them: see leads.search_text and the
 * trigram index in §21.5, which exists because that list could not be filtered
 * here honestly.
 */

const ARABIC_FOLD = {
  'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا',
  'ى': 'ي', 'ئ': 'ي',
  'ة': 'ه',
  'ؤ': 'و',
};

/* Tashkeel (\u064B-\u0652), the superscript alef (\u0670) and the tatweel
   (\u0640) — decoration that changes the bytes and not the word. */
const STRIP = /[\u064B-\u0652\u0670\u0640]/g;

/** Arabic-Indic (٠) and Extended Arabic-Indic (۰) digits, both to ASCII. */
const digitFold = (ch) => {
  const code = ch.codePointAt(0);
  if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
  if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
  return ch;
};

/** The comparable shape of a string. Empty for null, a number or an object. */
export function fold(value) {
  if (value == null) return '';
  const text = typeof value === 'string' ? value : String(value);

  let out = '';
  for (const ch of text.replace(STRIP, '')) {
    out += ARABIC_FOLD[ch] ?? digitFold(ch);
  }

  // Collapsed so "ريال   سعودي" and "ريال سعودي" are one term.
  return out.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Does this row match the term?
 *
 * @param term   what was typed. Empty means "everything matches" — a search box
 *               with nothing in it is not a filter.
 * @param fields the values to look in. Strings, numbers, or {ar, en} objects —
 *               a bilingual name is passed as it is stored and both sides are
 *               searched, because a seller types the name in whichever language
 *               they think in.
 */
export function matches(term, fields = []) {
  const needle = fold(term);
  if (!needle) return true;

  // Every word has to appear SOMEWHERE in the row, not necessarily in one
  // field: "riyadh toyota" should find a Riyadh showroom's Toyota.
  const words = needle.split(' ');
  const haystack = flatten(fields).map(fold).join(' ');

  return words.every((word) => haystack.includes(word));
}

/** {ar, en} objects and nested arrays down to a flat list of strings. */
function flatten(fields) {
  const out = [];

  const walk = (value, depth = 0) => {
    if (value == null || depth > 3) return;

    if (typeof value === 'string' || typeof value === 'number') {
      out.push(String(value));
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }

    if (typeof value === 'object') {
      for (const item of Object.values(value)) walk(item, depth + 1);
    }
  };

  walk(fields);
  return out;
}

/**
 * A term as a PostgREST `ilike` pattern, for the searches that do run in the
 * database.
 *
 * ── The stripping is not cosmetic ───────────────────────────────────────────
 *
 * `.or()` takes a filter string whose grammar uses commas, parentheses and
 * dots, so a term containing any of them does not merely fail to match — it
 * changes the filter, and PostgREST either errors or applies a condition nobody
 * wrote. `%` and `_` are ilike's own wildcards, and `*` is how PostgREST spells
 * `%`. All of them go, and the result is wrapped in the wildcards we chose.
 *
 * Returns null for a term with nothing usable left, so the caller can skip the
 * filter rather than apply `%%` to everything.
 */
export function likePattern(term, { max = 60 } = {}) {
  const clean = String(term ?? '')
    .replace(/[,()."'\\%_*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

  return clean ? `%${clean}%` : null;
}
