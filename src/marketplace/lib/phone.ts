/**
 * Which phone numbers this marketplace accepts — an ADMIN decision, not a
 * constant.
 *
 * Every form that asks for a number used to enforce one rule, written out five
 * times: `/^(\+?966|0)?5\d{8}$/`, a Saudi mobile. That is right for a Saudi
 * marketplace and wrong the moment a buyer with a Pakistani number signs up, a
 * showroom lists a UAE line, or the platform opens anywhere else — and each of
 * the five copies would have to be found and changed to allow it.
 *
 * So the rule is data: Admin → Settings → Contact picks the countries, and this
 * module is the only thing that knows what a number from each of them looks
 * like.
 *
 * ── Local or international, both accepted ───────────────────────────────────
 *
 * People type a number the way they say it. A Saudi writes 0501234567, a
 * Pakistani 03001234567, and either might paste +966 50 123 4567 from a
 * contact card. All of those are the same number, so each country carries its
 * dial code AND its national shape, and a value matches if it fits either.
 *
 * ── "Any country" is a real answer ──────────────────────────────────────────
 *
 * An empty list means no country rule at all: 7 to 15 digits, which is what
 * E.164 allows. It is deliberately loose — a marketplace that takes numbers
 * from everywhere cannot also promise each one is well formed, and refusing a
 * real number is worse than storing an odd one.
 */

export type PhoneCountry = {
  /** ISO 3166-1 alpha-2, which is what the setting stores. */
  code: string;
  /** Country calling code, digits only. */
  dial: string;
  ar: string;
  en: string;
  /** The number WITHOUT the dial code, as a local would write it minus any trunk 0. */
  national: RegExp;
  /** What to show in a placeholder. */
  example: string;
};

/**
 * The countries an admin can choose from.
 *
 * The Gulf and the countries most of the Kingdom's residents come from, first;
 * then the handful a Saudi showroom deals with often. Adding one is a line
 * here — no migration, because the setting stores ISO codes.
 */
export const PHONE_COUNTRIES: PhoneCountry[] = [
  { code: 'SA', dial: '966', ar: 'السعودية', en: 'Saudi Arabia', national: /^5\d{8}$/, example: '0501234567' },
  { code: 'AE', dial: '971', ar: 'الإمارات', en: 'United Arab Emirates', national: /^5\d{8}$/, example: '0501234567' },
  { code: 'KW', dial: '965', ar: 'الكويت', en: 'Kuwait', national: /^[569]\d{7}$/, example: '51234567' },
  { code: 'QA', dial: '974', ar: 'قطر', en: 'Qatar', national: /^[3567]\d{7}$/, example: '33123456' },
  { code: 'BH', dial: '973', ar: 'البحرين', en: 'Bahrain', national: /^[36]\d{7}$/, example: '36123456' },
  { code: 'OM', dial: '968', ar: 'عُمان', en: 'Oman', national: /^[79]\d{7}$/, example: '92123456' },
  { code: 'YE', dial: '967', ar: 'اليمن', en: 'Yemen', national: /^7\d{8}$/, example: '712345678' },
  { code: 'JO', dial: '962', ar: 'الأردن', en: 'Jordan', national: /^7\d{8}$/, example: '0791234567' },
  { code: 'EG', dial: '20', ar: 'مصر', en: 'Egypt', national: /^1\d{9}$/, example: '01012345678' },
  { code: 'SD', dial: '249', ar: 'السودان', en: 'Sudan', national: /^[19]\d{8}$/, example: '0912345678' },
  { code: 'SY', dial: '963', ar: 'سوريا', en: 'Syria', national: /^9\d{8}$/, example: '0912345678' },
  { code: 'LB', dial: '961', ar: 'لبنان', en: 'Lebanon', national: /^[37]\d{6,7}$/, example: '71123456' },
  { code: 'PK', dial: '92', ar: 'باكستان', en: 'Pakistan', national: /^3\d{9}$/, example: '03001234567' },
  { code: 'IN', dial: '91', ar: 'الهند', en: 'India', national: /^[6-9]\d{9}$/, example: '9812345678' },
  { code: 'BD', dial: '880', ar: 'بنغلاديش', en: 'Bangladesh', national: /^1\d{9}$/, example: '01712345678' },
  { code: 'PH', dial: '63', ar: 'الفلبين', en: 'Philippines', national: /^9\d{9}$/, example: '09171234567' },
  { code: 'TR', dial: '90', ar: 'تركيا', en: 'Turkey', national: /^5\d{9}$/, example: '05321234567' },
  { code: 'GB', dial: '44', ar: 'المملكة المتحدة', en: 'United Kingdom', national: /^7\d{9}$/, example: '07123456789' },
  { code: 'US', dial: '1', ar: 'الولايات المتحدة', en: 'United States', national: /^[2-9]\d{9}$/, example: '2025550123' },
];

export const PHONE_COUNTRY_BY_CODE = new Map(PHONE_COUNTRIES.map((c) => [c.code, c]));

/** A marketplace in Saudi Arabia, until an admin says otherwise. */
export const DEFAULT_PHONE_COUNTRIES = ['SA'];

/** Loosest thing still worth calling a phone number — see the note above. */
const ANY_PHONE = /^\d{7,15}$/;

/** Digits only: spaces, dashes, brackets and a leading 00 or + all go. */
export function phoneDigits(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.startsWith('00') ? digits.slice(2) : digits;
}

/** The chosen countries, cleaned of anything unknown. Empty = any country. */
export function allowedCountries(codes: unknown): PhoneCountry[] {
  if (!Array.isArray(codes)) return DEFAULT_PHONE_COUNTRIES.map((c) => PHONE_COUNTRY_BY_CODE.get(c)!);
  return codes
    .map((code) => PHONE_COUNTRY_BY_CODE.get(String(code).toUpperCase()))
    .filter(Boolean) as PhoneCountry[];
}

/**
 * Which of the allowed countries this number belongs to, or null.
 *
 * International first — a value starting with the dial code is unambiguous —
 * then the national form with an optional trunk 0, which is how people type
 * their own country's numbers.
 */
export function phoneCountryOf(value: unknown, codes: unknown): PhoneCountry | null {
  const digits = phoneDigits(value);
  if (!digits) return null;

  const countries = allowedCountries(codes);
  for (const country of countries) {
    if (digits.startsWith(country.dial)) {
      const rest = digits.slice(country.dial.length).replace(/^0/, '');
      if (country.national.test(rest)) return country;
    }
  }
  for (const country of countries) {
    if (country.national.test(digits.replace(/^0/, ''))) return country;
  }
  return null;
}

/**
 * Is this a number the marketplace accepts?
 *
 * `codes` is site settings' phoneCountries. An EMPTY list means every country,
 * which is the admin saying "stop checking where it is from".
 */
export function isAllowedPhone(value: unknown, codes: unknown): boolean {
  const digits = phoneDigits(value);
  if (!digits) return false;

  const countries = allowedCountries(codes);
  if (!countries.length) return ANY_PHONE.test(digits);
  return phoneCountryOf(digits, codes) !== null;
}

/**
 * The number as it should be stored and dialled: country code, digits only.
 *
 * Falls back to the digits as typed when nothing matches — storing something
 * dialable beats storing nothing, and the validator has already had its say.
 */
export function toInternational(value: unknown, codes: unknown): string {
  const digits = phoneDigits(value);
  const country = phoneCountryOf(digits, codes);
  if (!country) return digits;
  if (digits.startsWith(country.dial)) return digits;
  return `${country.dial}${digits.replace(/^0/, '')}`;
}

/** A placeholder that matches what this marketplace actually accepts. */
export function phoneExample(codes: unknown): string {
  const countries = allowedCountries(codes);
  return countries[0]?.example ?? '+966501234567';
}

/** "Saudi Arabia" or "Saudi Arabia, Pakistan" — for a hint under a field. */
export function phoneCountryNames(codes: unknown, locale = 'ar'): string {
  const countries = allowedCountries(codes);
  if (!countries.length) return '';
  return countries.map((c) => (locale === 'en' ? c.en : c.ar)).join(locale === 'en' ? ', ' : '، ');
}
