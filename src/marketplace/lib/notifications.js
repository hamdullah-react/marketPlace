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

  /* Ended by the platform rather than by the clock — see decideBoost. The note
     is the whole point of the message, so it is not trimmed away when long. */
  boost_ended: (d, { locale }) => ({
    title: locale === 'ar' ? 'تم إيقاف الترويج' : 'Promotion stopped',
    body:
      [car(d, locale), d.note].filter(Boolean).join(' · ') ||
      (locale === 'ar' ? 'تواصل مع الإدارة للتفاصيل' : 'Get in touch with the platform team'),
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

  /* Not an event — the "send a test" button in the bell. It is here rather
     than as a hardcoded string in the sender so it reads in the recipient's
     language like everything else, and so a test looks exactly like the real
     thing on the lock screen. */
  push_test: (d, { locale }) => ({
    title: locale === 'ar' ? 'الإشعارات تعمل' : 'Notifications are working',
    body:
      locale === 'ar'
        ? 'هذه رسالة تجريبية. ستصلك الإشعارات الحقيقية بنفس الطريقة.'
        : 'This is a test. Real notifications will arrive the same way.',
  }),

  /* ── For a BUYER ─────────────────────────────────────────────────────
     The other half of the conversations above. A showroom was already told
     when a request arrived and when a review was left; the person at the other
     end was told nothing and had to keep opening the page to find out. */

  // The receipt. It is not ceremony: a buyer who sends a request into silence
  // rings the showroom an hour later to ask whether it arrived.
  lead_sent: (d, { locale }) => ({
    title: locale === 'ar' ? 'أُرسل طلبك' : 'Your request was sent',
    body: [d.vendor, car(d, locale)].filter(Boolean).join(' · '),
  }),

  // A showroom moved it. `stage` is the word the pipeline uses; the sentence
  // is written from the BUYER's side, because "quoted" is something that
  // happened TO them.
  lead_stage: (d, { locale }) => {
    const ar = {
      contacted: 'المعرض تواصل معك',
      quoted: 'وصلك عرض سعر',
      won: 'تم إتمام الطلب',
      lost: 'أُغلق الطلب',
    };
    const en = {
      contacted: 'The showroom has been in touch',
      quoted: 'You have a price',
      won: 'Your request is complete',
      lost: 'Your request was closed',
    };
    const said = (locale === 'ar' ? ar : en)[d.stage];

    return {
      title: said ?? (locale === 'ar' ? 'تغيّرت حالة طلبك' : 'Your request changed'),
      body: [d.vendor, car(d, locale)].filter(Boolean).join(' · '),
    };
  },

  review_reply: (d, { locale }) => ({
    title: locale === 'ar' ? 'رد المعرض على تقييمك' : 'The showroom replied to your review',
    body: [d.vendor, d.reply].filter(Boolean).join(' · '),
  }),

  // A showroom this buyer has actually dealt with has listed something. See
  // notifyShowroomFollowers for who counts as "dealt with", and why it is not
  // everybody.
  new_car: (d, { locale }) => ({
    title: locale === 'ar' ? 'سيارة جديدة في معرض تتابعه' : 'A new car at a showroom you know',
    body: [car(d, locale), d.vendor].filter(Boolean).join(' · '),
  }),

  /* ── For a showroom, about the buyer ─────────────────────────────────── */

  lead_cancelled: (d, { locale }) => ({
    title: locale === 'ar' ? 'سحب المشتري طلبه' : 'A buyer withdrew their request',
    body: [d.buyer, car(d, locale), d.reason].filter(Boolean).join(' · '),
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

  user_joined: (d, { locale }) => ({
    title: locale === 'ar' ? 'مستخدم جديد' : 'New user',
    body: [d.name, d.email].filter(Boolean).join(' · '),
  }),

  vendor_joined: (d, { locale }) => ({
    title: locale === 'ar' ? 'معرض جديد' : 'New showroom',
    // The city is what tells staff whether this is a market they already cover.
    body: [d.vendor, d.city].filter(Boolean).join(' · '),
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
