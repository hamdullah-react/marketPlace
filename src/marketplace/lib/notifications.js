import { formatPrice, localized } from '@/marketplace/lib/listing';

/**
 * Turning a recorded fact into a sentence somebody can read.
 *
 * ── Why the wording lives here and not in the database ──────────────────────
 *
 * The row stores WHAT happened (`kind`) and the handful of values the sentence
 * needs (`data`). This builds the sentence, in the reader's language, at the
 * moment they look at it.
 *
 * Storing the text instead would mean choosing a language at write time — and
 * this platform ships in two, with a switcher in the dashboard header. A seller
 * who reads Arabic would find a bell full of English because the event happened
 * while somebody else had the admin panel open in English.
 *
 * It also means the wording can be improved without rewriting history, and a
 * `kind` nobody recognises renders as something honest rather than as a crash.
 *
 * ── The values are SNAPSHOTS, so a sentence survives a deletion ─────────────
 *
 * `data` carries the car's title and the buyer's name, not their ids. A
 * notification about a car that was deleted last week still has to read as a
 * sentence — see the NOTIFICATIONS section of schema.sql.
 */

/** Every kind the app records, and how each one reads. */
const KINDS = {
  /* ── For a showroom ──────────────────────────────────────────────────── */
  lead_new: (d, { locale }) => ({
    title: locale === 'ar' ? 'طلب جديد' : 'New request',
    body: [d.buyer, car(d, locale)].filter(Boolean).join(' · '),
  }),

  boost_approved: (d, { locale }) => ({
    title: locale === 'ar' ? 'تمت الموافقة على الترويج' : 'Promotion approved',
    body:
      locale === 'ar'
        ? `${car(d, locale)} — تبدأ المدة بعد تأكيد الدفعة`
        : `${car(d, locale)} — it starts once your payment is confirmed`,
  }),

  boost_rejected: (d, { locale }) => ({
    title: locale === 'ar' ? 'رُفض طلب الترويج' : 'Promotion rejected',
    body: [car(d, locale), d.note].filter(Boolean).join(' · '),
  }),

  boost_started: (d, { locale }) => ({
    title: locale === 'ar' ? 'بدأ الترويج' : 'Promotion is live',
    body:
      locale === 'ar'
        ? `${car(d, locale)} — لمدة ${d.days} يوم`
        : `${car(d, locale)} — for ${d.days} days`,
  }),

  charge_paid: (d, opts) => ({
    title: opts.locale === 'ar' ? 'تم تأكيد الدفعة' : 'Payment confirmed',
    body: [d.ref, amount(d, opts)].filter(Boolean).join(' · '),
  }),

  access_blocked: (d, { locale }) => ({
    title: locale === 'ar' ? 'تم إيقاف لوحة التحكم' : 'Dashboard switched off',
    body: d.reason || (locale === 'ar' ? 'تواصل مع الإدارة' : 'Get in touch with the platform team'),
  }),

  access_extended: (d, { locale }) => ({
    title: locale === 'ar' ? 'تم تمديد اشتراكك' : 'Your subscription was extended',
    body: d.until ? until(d.until, locale) : '',
  }),

  review_new: (d, { locale }) => ({
    title: locale === 'ar' ? 'تقييم جديد' : 'New review',
    body: [d.buyer, d.rating ? `${d.rating}★` : null].filter(Boolean).join(' · '),
  }),

  /* ── For the platform ────────────────────────────────────────────────── */
  boost_requested: (d, { locale }) => ({
    title: locale === 'ar' ? 'طلب ترويج جديد' : 'New promotion request',
    body: [d.vendor, car(d, locale)].filter(Boolean).join(' · '),
  }),

  renewal_requested: (d, opts) => ({
    title: opts.locale === 'ar' ? 'طلب تجديد اشتراك' : 'Renewal requested',
    body: [d.vendor, amount(d, opts)].filter(Boolean).join(' · '),
  }),

  review_to_moderate: (d, { locale }) => ({
    title: locale === 'ar' ? 'تقييم بانتظار المراجعة' : 'Review awaiting moderation',
    body: [d.vendor, d.rating ? `${d.rating}★` : null].filter(Boolean).join(' · '),
  }),

  vendor_joined: (d, { locale }) => ({
    title: locale === 'ar' ? 'معرض جديد' : 'New showroom',
    body: d.vendor ?? '',
  }),
};

/* The car's title came across as {ar, en} or as a plain string, depending on
   which action recorded it. Both are handled rather than one being declared
   correct, because a notification is not worth a crash. */
const car = (d, locale) => {
  const value = d?.car ?? d?.listing ?? null;
  if (!value) return '';
  return typeof value === 'string' ? value : localized(value, locale);
};

const amount = (d, { locale, currency }) =>
  Number.isFinite(Number(d?.amount)) ? formatPrice(d.amount, locale, currency) : '';

const until = (iso, locale) => {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  const date = new Date(at).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return locale === 'ar' ? `حتى ${date}` : `until ${date}`;
};

/**
 * One notification, as a title and a line under it.
 *
 * An unknown kind is not an error: an older app reading a row written by a
 * newer one should show something rather than break the whole bell. It falls
 * back to the kind itself, which at least says what happened.
 */
export function notificationText(kind, data = {}, { locale = 'ar', currency = null } = {}) {
  const build = KINDS[kind];
  if (!build) return { title: String(kind ?? '').replace(/_/g, ' '), body: '' };

  try {
    const out = build(data ?? {}, { locale, currency });
    return { title: out.title ?? '', body: out.body ?? '' };
  } catch {
    return { title: String(kind).replace(/_/g, ' '), body: '' };
  }
}

/** "2 minutes ago", in either language, without pulling in a date library. */
export function timeAgo(iso, locale = 'ar') {
  const at = Date.parse(iso ?? '');
  if (!Number.isFinite(at)) return '';

  const seconds = Math.round((Date.now() - at) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale === 'ar' ? 'ar' : 'en', { numeric: 'auto' });

  const steps = [
    [60, 'second', 1],
    [3600, 'minute', 60],
    [86400, 'hour', 3600],
    [604800, 'day', 86400],
    [2629800, 'week', 604800],
    [31557600, 'month', 2629800],
  ];

  for (const [limit, unit, divisor] of steps) {
    if (seconds < limit) return rtf.format(-Math.floor(seconds / divisor), unit);
  }
  return rtf.format(-Math.floor(seconds / 31557600), 'year');
}
