/**
 * The currencies this marketplace knows the names of.
 *
 * ── A shortcut, not a limit ─────────────────────────────────────────────────
 *
 * Nothing here restricts what can be stored. The platform's currency is
 * validated as a SHAPE — three letters — in the database (site_settings_currency_check)
 * and in the action that saves it, and a showroom's is validated the same way.
 * A hardcoded list of ALLOWED codes would be the hardcoded 'SAR' problem one
 * level up: it would work until the day somebody needed the one code nobody
 * thought of.
 *
 * What this list is for is naming them. 'PKR' means nothing to most people
 * reading a dropdown, so every entry carries a label in both languages, and the
 * symbol itself never needs storing — Intl derives it from the code and the
 * reader's language (see formatPrice).
 *
 * ── Why the order is not alphabetical ───────────────────────────────────────
 *
 * Alphabetical buries SAR in the middle and puts AFN first, which is nobody's
 * likely answer. It runs Gulf, then the wider Arab world, then South Asia, then
 * the rest — most-likely first, so the common case is the first thing seen.
 *
 * ── Two places use it, for two different things ─────────────────────────────
 *
 *   Admin → Settings → Language   what the PLATFORM bills its showrooms in.
 *   Seller → Settings             what a SHOWROOM prices its cars in.
 *
 * Those are genuinely different questions — a showroom in Karachi listing in
 * rupees can still be billed for its subscription in riyals — which is why the
 * two are stored separately and merely share this vocabulary.
 */

/** @type {ReadonlyArray<{ code: string, ar: string, en: string }>} */
export const CURRENCIES = [
  // Gulf
  { code: 'SAR', ar: 'ريال سعودي', en: 'Saudi riyal' },
  { code: 'AED', ar: 'درهم إماراتي', en: 'UAE dirham' },
  { code: 'QAR', ar: 'ريال قطري', en: 'Qatari riyal' },
  { code: 'KWD', ar: 'دينار كويتي', en: 'Kuwaiti dinar' },
  { code: 'BHD', ar: 'دينار بحريني', en: 'Bahraini dinar' },
  { code: 'OMR', ar: 'ريال عماني', en: 'Omani rial' },
  { code: 'YER', ar: 'ريال يمني', en: 'Yemeni rial' },

  // The wider Arab world
  { code: 'EGP', ar: 'جنيه مصري', en: 'Egyptian pound' },
  { code: 'JOD', ar: 'دينار أردني', en: 'Jordanian dinar' },
  { code: 'IQD', ar: 'دينار عراقي', en: 'Iraqi dinar' },
  { code: 'LBP', ar: 'ليرة لبنانية', en: 'Lebanese pound' },
  { code: 'SYP', ar: 'ليرة سورية', en: 'Syrian pound' },
  { code: 'MAD', ar: 'درهم مغربي', en: 'Moroccan dirham' },
  { code: 'TND', ar: 'دينار تونسي', en: 'Tunisian dinar' },
  { code: 'DZD', ar: 'دينار جزائري', en: 'Algerian dinar' },
  { code: 'LYD', ar: 'دينار ليبي', en: 'Libyan dinar' },
  { code: 'SDG', ar: 'جنيه سوداني', en: 'Sudanese pound' },

  // South Asia
  { code: 'PKR', ar: 'روبية باكستانية', en: 'Pakistani rupee' },
  { code: 'INR', ar: 'روبية هندية', en: 'Indian rupee' },
  { code: 'BDT', ar: 'تاكا بنغلاديشي', en: 'Bangladeshi taka' },
  { code: 'LKR', ar: 'روبية سريلانكية', en: 'Sri Lankan rupee' },
  { code: 'NPR', ar: 'روبية نيبالية', en: 'Nepalese rupee' },
  { code: 'AFN', ar: 'أفغاني', en: 'Afghan afghani' },

  // Elsewhere
  { code: 'USD', ar: 'دولار أمريكي', en: 'US dollar' },
  { code: 'EUR', ar: 'يورو', en: 'Euro' },
  { code: 'GBP', ar: 'جنيه إسترليني', en: 'Pound sterling' },
  { code: 'TRY', ar: 'ليرة تركية', en: 'Turkish lira' },
  { code: 'CNY', ar: 'يوان صيني', en: 'Chinese yuan' },
  { code: 'JPY', ar: 'ين ياباني', en: 'Japanese yen' },
  { code: 'IDR', ar: 'روبية إندونيسية', en: 'Indonesian rupiah' },
  { code: 'MYR', ar: 'رينغيت ماليزي', en: 'Malaysian ringgit' },
  { code: 'PHP', ar: 'بيزو فلبيني', en: 'Philippine peso' },
  { code: 'SGD', ar: 'دولار سنغافوري', en: 'Singapore dollar' },
  { code: 'ZAR', ar: 'راند جنوب أفريقي', en: 'South African rand' },
  { code: 'KES', ar: 'شلن كيني', en: 'Kenyan shilling' },
  { code: 'NGN', ar: 'نيرا نيجيري', en: 'Nigerian naira' },
  { code: 'CAD', ar: 'دولار كندي', en: 'Canadian dollar' },
  { code: 'AUD', ar: 'دولار أسترالي', en: 'Australian dollar' },
  { code: 'CHF', ar: 'فرنك سويسري', en: 'Swiss franc' },
  { code: 'RUB', ar: 'روبل روسي', en: 'Russian rouble' },
  { code: 'BRL', ar: 'ريال برازيلي', en: 'Brazilian real' },
];

/** The shape a currency code has to have, everywhere it is accepted. */
export const CURRENCY_SHAPE = /^[A-Z]{3}$/;

/**
 * Normalise anything a form or a database column might hand over.
 *
 * Returns null rather than a default, so a caller can tell "nothing was set"
 * apart from "somebody chose riyals" — the two mean different things when a
 * showroom's currency is meant to fall back to the platform's.
 */
export const cleanCurrency = (value) => {
  const code = String(value ?? '').trim().toUpperCase();
  return CURRENCY_SHAPE.test(code) ? code : null;
};

/**
 * The name of a currency in the reader's language, falling back to the code.
 *
 * An unlisted code returns itself, which is the honest answer: the platform
 * accepts codes it has no translation for, and showing 'XAF' beats showing
 * nothing or pretending it is invalid.
 */
export const currencyLabel = (code, locale = 'ar') => {
  const wanted = cleanCurrency(code);
  if (!wanted) return '';
  const found = CURRENCIES.find((c) => c.code === wanted);
  if (!found) return wanted;
  return locale === 'ar' ? found.ar : found.en;
};

/** `SAR — Saudi riyal`, for a dropdown where the code itself matters. */
export const currencyOption = (code, locale = 'ar') => {
  const label = currencyLabel(code, locale);
  return label && label !== code ? `${code} — ${label}` : code;
};
