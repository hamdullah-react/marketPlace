/**
 * May this showroom use its dashboard?
 *
 * One question, asked from five places — the guard that redirects a page, the
 * guard that refuses a write, the banner that warns a seller their month is
 * nearly up, the screen they land on when it is, and the admin's list of who
 * runs out when. A second copy of "is this expired" is how a seller gets locked
 * out of a page that told them they had four days left.
 *
 * ── Everything is derived from one date ─────────────────────────────────────
 *
 * `access_until` is the moment it runs out. Nothing has to run at midnight to
 * mark anybody expired — the comparison happens when somebody knocks, so it
 * cannot be stale, and an admin moving the date takes effect on the next
 * request rather than on the next sweep.
 */

const DAY = 86_400_000;

/** How long before the end the warning starts. */
export const WARN_DAYS = 7;

export const ACCESS_STATES = {
  /* Inside the free month. */
  trial: {
    ar: 'فترة مجانية',
    en: 'Free trial',
    tone: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  },
  /* Paid, with time left. */
  active: {
    ar: 'مفعّل',
    en: 'Active',
    tone: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400',
  },
  /* Still in, but not for long. */
  ending: {
    ar: 'ينتهي قريباً',
    en: 'Ending soon',
    tone: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  },
  /* The date has passed. */
  expired: {
    ar: 'منتهٍ',
    en: 'Expired',
    tone: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400',
  },
  /* An admin closed it by hand. */
  blocked: {
    ar: 'موقوف',
    en: 'Blocked',
    tone: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400',
  },
  /* Nobody ever set a date. Treated as open — see below. */
  unset: {
    ar: 'غير محدد',
    en: 'Not set',
    tone: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  },
};

export const accessLabel = (state, locale = 'ar') => {
  const s = ACCESS_STATES[state] ?? ACCESS_STATES.unset;
  return locale === 'ar' ? s.ar : s.en;
};

export const accessTone = (state) => (ACCESS_STATES[state] ?? ACCESS_STATES.unset).tone;

/**
 * Where a showroom stands, right now.
 *
 * Returns `{ state, allowed, until, daysLeft, reason }`.
 *
 * ── A missing date lets them IN ─────────────────────────────────────────────
 *
 * `access_until` null means nothing has ever set one: a database where the
 * VENDOR ACCESS section has not been run, or a row that predates its trigger.
 * That is a deployment gap, and the safe direction for a deployment gap is the
 * one that does not lock every paying showroom out of its own dashboard because
 * a migration is pending. An admin sees "Not set" on their list and can fix it;
 * a seller sees nothing unusual.
 *
 * The manual block is the opposite: it is only ever set deliberately, so it is
 * obeyed the instant it appears.
 */
export function accessState(vendor, now = Date.now()) {
  const blocked = vendor?.access_blocked === true;
  const raw = vendor?.access_until ?? null;
  const until = raw ? Date.parse(raw) : null;
  const hasDate = Number.isFinite(until);

  if (blocked) {
    return {
      state: 'blocked',
      allowed: false,
      until: hasDate ? raw : null,
      daysLeft: null,
      reason: vendor?.access_block_reason ?? null,
    };
  }

  if (!hasDate) {
    return { state: 'unset', allowed: true, until: null, daysLeft: null, reason: null };
  }

  const msLeft = until - now;
  // Rounded UP: with four and a half days to go a seller is told four, and is
  // never told "0 days left" while they can still get in.
  const daysLeft = Math.ceil(msLeft / DAY);

  if (msLeft <= 0) {
    return { state: 'expired', allowed: false, until: raw, daysLeft: 0, reason: null };
  }

  /* Free month or paid period is deliberately NOT distinguished here. It is not
     stored, and the only place it reads differently is a label — the admin's
     list infers it from whether a subscription charge was ever raised, which is
     the honest source. Inventing a `trial` flag from a date would be a guess
     that two screens could disagree about. */
  return {
    state: daysLeft <= WARN_DAYS ? 'ending' : 'active',
    allowed: true,
    until: raw,
    daysLeft,
    reason: null,
  };
}

/** Just the yes or no, for the guards. */
export const hasAccess = (vendor, now = Date.now()) => accessState(vendor, now).allowed;

/** The new end date when `days` are added — from today, or from the end if it has not passed. */
export function extendedTo(vendor, days, now = Date.now()) {
  const raw = vendor?.access_until ?? null;
  const until = raw ? Date.parse(raw) : NaN;

  /* Extending a showroom that still has time ADDS to what is left rather than
     replacing it: somebody who renews a week early has paid for a month and
     must not lose the week. One whose date has passed starts from today, for
     the same reason — they should not pay for the fortnight they spent locked
     out. */
  const from = Number.isFinite(until) && until > now ? until : now;
  return new Date(from + days * DAY).toISOString();
}
