import { localized } from '@/marketplace/lib/listing';

/**
 * What a plan card says when the admin has not written anything.
 *
 * ── A fallback, never an override ───────────────────────────────────────────
 *
 * Every function here checks the stored value FIRST and only invents a line
 * when there is none. An admin who writes three features gets exactly those
 * three — not theirs plus ours, and not ours with theirs appended. The moment
 * they type anything, this file stops having an opinion about that plan.
 *
 * That rule is the whole design. The alternative — merging defaults with the
 * admin's list — reads as a bug from the admin's side: they delete a line, save,
 * and it comes back.
 *
 * ── Why the defaults are worth having at all ────────────────────────────────
 *
 * A pricing page whose cards say "90 days — 900" and nothing else does not sell
 * anything; it asks the reader to already know what they are buying. Plans are
 * created in a dialog where the price is the urgent field and the copy is the
 * one nobody fills in, so the realistic state of a new plan is name-and-price
 * for ever. These lines mean that card is still a card.
 *
 * ── Everything here is TRUE of the platform ─────────────────────────────────
 *
 * This is the important constraint, and it is why the list is short. A default
 * is a promise made on the admin's behalf to somebody about to pay, so nothing
 * here may describe a feature this marketplace does not have. Each line below
 * maps to something a showroom really gets:
 *
 *   storefront   vendors + §27 storefront SEO + §28 the About page
 *   listings     no cap exists anywhere in the schema or the code
 *   requests     the leads pipeline (§21), shared across the showroom's staff
 *   form         the seller's own enquiry form (§20, §22)
 *   offers       listing_offers (§25), scheduled, with an end date
 *   reviews      reviews + the showroom's replies
 *   team         vendor_members — a login each, not a shared password
 *
 * Promotions are deliberately absent: they are bought separately, per car, and
 * putting "featured placement" on a subscription card would be selling
 * something the subscription does not include.
 */

/** The lines every plan gets. Order is the order they are read in. */
const INCLUDED = [
  { ar: 'صفحة معرض خاصة بك، تظهر في نتائج البحث', en: 'Your own showroom page, found in search' },
  { ar: 'عدد غير محدود من السيارات', en: 'Unlimited cars' },
  { ar: 'كل طلبات المشترين في صندوق واحد', en: 'Every buyer request in one inbox' },
  { ar: 'نموذج استفسار تصمّمه بنفسك', en: 'An enquiry form you design yourself' },
  { ar: 'عروض وخصومات بمواعيد تبدأ وتنتهي وحدها', en: 'Offers that start and end on their own' },
  { ar: 'تقييمات، وردودك عليها', en: 'Reviews, with your replies' },
  { ar: 'فريقك كاملاً — حساب لكل شخص', en: 'Your whole team — a login each' },
];

/**
 * The ticks on a card, already in the reader's language.
 *
 * The first line is DERIVED from the plan rather than fixed, because the one
 * thing that genuinely differs between two plans is how long they last — and a
 * reader comparing cards is comparing exactly that.
 */
export function planFeatures(plan, locale, { t }) {
  const written = Array.isArray(plan?.features)
    ? plan.features.map((f) => localized(f, locale)).filter(Boolean)
    : [];

  if (written.length) return written;

  const days = Number(plan?.days);
  const length = Number.isFinite(days)
    ? t(`${days} يوماً من الوصول الكامل للوحة`, `${days} days of full dashboard access`)
    : null;

  return [length, ...INCLUDED.map((line) => localized(line, locale))].filter(Boolean);
}

/**
 * The sentence under the name.
 *
 * Keyed on LENGTH, because that is the only thing this file knows about a plan
 * that could change what it is for. A fortnight is a trial run; a year is a
 * commitment somebody makes once and stops thinking about.
 */
export function planDescription(plan, locale, { t }) {
  const written = localized(plan?.description, locale);
  if (written) return written;

  const days = Number(plan?.days);
  if (!Number.isFinite(days)) return '';

  if (days <= 31) {
    return t(
      'شهر واحد. مناسب للبداية أو للتجربة قبل الالتزام.',
      'A month at a time. Good for starting out, or trying before committing.'
    );
  }
  if (days <= 120) {
    return t(
      'لعدة أشهر دفعة واحدة — لمعرض يبيع باستمرار.',
      'Several months at once — for a showroom selling steadily.'
    );
  }
  return t(
    'لسنة كاملة، بأقل سعر لليوم، ودون تجديد كل شهر.',
    'A full year, at the lowest price per day, with no monthly renewals.'
  );
}

/**
 * The free trial, as a CARD.
 *
 * ── Why it is synthesised and not a row ─────────────────────────────────────
 *
 * The trial is not a plan anybody buys — it is `site_settings.trial_days`, and
 * it starts by itself when a showroom is created (see the trigger in the VENDOR
 * ACCESS section). Storing it as a vendor_plans row would make it orderable,
 * deletable and requestable, and a seller pressing "request" on a free trial
 * they already had would raise a charge for nothing.
 *
 * So it is built here, marked `synthetic`, and the card's button knows to offer
 * signing up rather than renewing.
 *
 * Returns null when the admin has set the trial to zero days: a "Free" card
 * offering nothing is worse than no card.
 */
export function freeTrialPlan(trialDays, locale, { t }) {
  const days = Number(trialDays);
  if (!Number.isFinite(days) || days < 1) return null;

  return {
    id: 'trial',
    synthetic: true,
    days,
    price: 0,
    popular: false,
    name: { ar: 'تجربة مجانية', en: 'Free trial' },
    description: {
      ar: `كل ما في الخطط المدفوعة، مجاناً، لأول ${days} يوماً. بدون بطاقة.`,
      en: `Everything in the paid plans, free, for your first ${days} days. No card.`,
    },
    /* The SAME list as a paid plan, deliberately. The trial is not a cut-down
       version — a showroom on day one gets the whole dashboard, and a card
       implying otherwise would undersell the thing that converts. */
    features: INCLUDED,
  };
}
