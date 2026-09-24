/**
 * Billing vocabulary — the words and the arithmetic, in one place.
 *
 * A charge is read on four screens (the admin's Finance list, the admin's
 * dashboard, the showroom's own billing page and the boost row that caused it),
 * and "is this overdue" must mean the same thing on all four. A second copy of
 * that comparison is how a figure shown as outstanding on one page appears as
 * fine on another.
 */

/**
 * How a showroom can pay.
 *
 * A list here rather than an enum in the database: which methods are accepted
 * is a business answer that changes faster than a migration, and a payment that
 * has already landed in the bank must never be un-recordable because its method
 * is not in a type. Anything not on this list still saves and displays as
 * itself — see methodLabel.
 */
export const PAYMENT_METHODS = [
  { key: 'bank_transfer', ar: 'تحويل بنكي', en: 'Bank transfer' },
  { key: 'mada', ar: 'مدى', en: 'Mada' },
  { key: 'stc_pay', ar: 'STC Pay', en: 'STC Pay' },
  { key: 'cash', ar: 'نقداً', en: 'Cash' },
  { key: 'cheque', ar: 'شيك', en: 'Cheque' },
  { key: 'other', ar: 'أخرى', en: 'Other' },
];

export const methodLabel = (key, locale = 'ar') => {
  const found = PAYMENT_METHODS.find((m) => m.key === key);
  if (found) return locale === 'ar' ? found.ar : found.en;
  // An unrecognised method is shown as stored rather than hidden. It is a fact
  // about money that arrived; the app's list being out of date is not a reason
  // to stop displaying it.
  return key || (locale === 'ar' ? 'غير محدد' : 'Not recorded');
};

export const CHARGE_STATES = {
  due: {
    ar: 'مستحق',
    en: 'Due',
    tone: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  },
  paid: {
    ar: 'مدفوع',
    en: 'Paid',
    tone: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400',
  },
  void: {
    ar: 'ملغى',
    en: 'Cancelled',
    tone: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  },
};

export const stateLabel = (state, locale = 'ar') => {
  const s = CHARGE_STATES[state] ?? CHARGE_STATES.due;
  return locale === 'ar' ? s.ar : s.en;
};

export const stateTone = (state) => (CHARGE_STATES[state] ?? CHARGE_STATES.due).tone;

/** How long a showroom has to pay, when nothing says otherwise. */
export const DUE_DAYS = 7;

/**
 * Past its due date and still unpaid.
 *
 * A charge with no due date is never overdue — that is a deliberate reading of
 * "we did not agree a date", not an oversight. Chasing somebody over a deadline
 * nobody set is how a billing screen loses its credibility.
 */
export function isOverdue(charge, now = Date.now()) {
  if (!charge || charge.state !== 'due' || !charge.due_at) return false;
  const due = Date.parse(charge.due_at);
  return Number.isFinite(due) && due < now;
}

/** Negative when overdue, positive when still to come, null with no due date. */
export function daysUntilDue(charge, now = Date.now()) {
  if (!charge?.due_at) return null;
  const due = Date.parse(charge.due_at);
  if (!Number.isFinite(due)) return null;
  return Math.ceil((due - now) / 86_400_000);
}

/**
 * How late, in words.
 *
 * Exists because the obvious version is wrong on the day it matters most: a
 * charge that fell due at 04:37 this morning is overdue by a fraction of a day,
 * and `Math.abs(ceil(-0.5))` is 0 — so the badge read "0 days late", which is
 * both meaningless and the first thing an admin sees about a debt that has just
 * turned. Same reason it is here rather than in the two pages that draw the
 * badge: a rounding rule copied twice is a rounding rule that disagrees once.
 */
export function overdueLabel(charge, locale = 'ar', now = Date.now()) {
  if (!isOverdue(charge, now)) return null;

  const late = Math.abs(daysUntilDue(charge, now) ?? 0);
  const isAr = locale === 'ar';

  if (late < 1) return isAr ? 'استحق اليوم' : 'due today';
  if (late === 1) return isAr ? 'متأخر يوم' : '1 day late';
  return isAr ? `متأخر ${late} يوم` : `${late} days late`;
}

/**
 * Totals over a set of charges.
 *
 * `outstanding` counts only `due` — a voided charge is money that was never
 * owed, and counting it would inflate the one number the whole screen exists to
 * show. `collected` counts only `paid`. The two never overlap, so the figures
 * on a statement always add up to the rows beneath them.
 */
export function totals(charges, now = Date.now()) {
  let outstanding = 0;
  let collected = 0;
  let overdue = 0;
  let overdueCount = 0;
  let dueCount = 0;
  let paidCount = 0;

  for (const c of charges ?? []) {
    const amount = Number(c.amount ?? 0);
    if (c.state === 'due') {
      outstanding += amount;
      dueCount += 1;
      if (isOverdue(c, now)) {
        overdue += amount;
        overdueCount += 1;
      }
    } else if (c.state === 'paid') {
      collected += amount;
      paidCount += 1;
    }
  }

  return { outstanding, collected, overdue, dueCount, overdueCount, paidCount };
}

/**
 * WHERE a showroom can pay — a LIST, not one Saudi bank account.
 *
 * ── Why the first version was wrong ─────────────────────────────────────────
 *
 * It held one bank: a name, an account name, and an IBAN validated against
 * `^SA\d{22}$`. Two things were wrong with that on a bilingual platform selling
 * across the Gulf:
 *
 *   · one account. A platform banks with more than one bank, and it takes cash
 *     and wallet transfers as well. A showroom paying into whichever account
 *     suits them is normal; a single field says only one is allowed.
 *   · a Saudi-only IBAN rule. An Emirati (AE), Kuwaiti (KW) or Bahraini (BH)
 *     account is a perfectly good place to be paid, and that regex refused all
 *     of them. A validator that rejects real money is worse than none.
 *
 * So this is a list of accounts, each with its own KIND: a bank account, cash at
 * the office, a wallet, a card machine. Only the fields that kind actually needs
 * are required, and no country is privileged.
 *
 * The legacy single-object shape is read as one account, so nothing an admin has
 * already saved is lost.
 */

/** What a payment destination can be. `bank` is the only one needing a number. */
export const ACCOUNT_KINDS = [
  { key: 'bank', ar: 'حساب بنكي', en: 'Bank account' },
  { key: 'wallet', ar: 'محفظة إلكترونية', en: 'Digital wallet' },
  { key: 'cash', ar: 'نقداً في المكتب', en: 'Cash at the office' },
  { key: 'card', ar: 'شبكة / بطاقة', en: 'Card / POS' },
  { key: 'other', ar: 'أخرى', en: 'Other' },
];

export const accountKindLabel = (key, locale = 'ar') => {
  const found = ACCOUNT_KINDS.find((k) => k.key === key);
  return found ? (locale === 'ar' ? found.ar : found.en) : key || '';
};

/**
 * An IBAN, from ANY country.
 *
 * Two letters of country, two check digits, then up to thirty of that country's
 * own characters — the actual ISO 13616 shape, rather than one nation's length.
 * Spaces are how people write them, and are stripped before the test.
 *
 * The check DIGITS are not verified. A mod-97 test would catch a transposed
 * pair; it would also reject a number an admin copied correctly from a bank
 * letter that this code happens to disagree with, and then the money has
 * nowhere to go. The shape is a typo guard, not an authority.
 */
export const IBAN_SHAPE = /^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/;

export const cleanIban = (value) => String(value ?? '').replace(/[\s-]/g, '').toUpperCase();

/** Grouped in fours, which is how an IBAN is read aloud and checked. */
export const formatIban = (value) => cleanIban(value).replace(/(.{4})/g, '$1 ').trim();

/**
 * Is this account usable, and if not, which field is at fault.
 *
 * Per KIND, deliberately. Demanding an IBAN for "cash at the office" stops
 * somebody recording a real way to pay; demanding nothing at all lets an empty
 * row onto a showroom's screen where the payment details should be.
 */
export function validateAccount(input) {
  const label = String(input?.label ?? '').trim();
  const kind = ACCOUNT_KINDS.some((k) => k.key === input?.kind) ? input.kind : 'bank';
  const iban = cleanIban(input?.iban);
  const accountNumber = String(input?.accountNumber ?? '').trim();

  if (!label) return 'ACCOUNT_LABEL_REQUIRED';

  if (kind === 'bank') {
    // Either identifier will do: much of the world pays by account number and
    // has never seen an IBAN.
    if (!iban && !accountNumber) return 'ACCOUNT_NUMBER_REQUIRED';
    if (iban && !IBAN_SHAPE.test(iban)) return 'IBAN_SHAPE_INVALID';
  }

  return null;
}

/** One account, normalised, whatever shape it was stored in. */
function shapeAccount(raw, index) {
  const text = (key) => (typeof raw?.[key] === 'string' ? raw[key].trim() : '');
  const kind = ACCOUNT_KINDS.some((k) => k.key === raw?.kind) ? raw.kind : 'bank';

  return {
    // Stable enough to edit and delete by, and generated for legacy rows that
    // never had one.
    id: text('id') || `acc-${index + 1}`,
    kind,
    label: text('label'),
    bankName: text('bankName'),
    accountName: text('accountName'),
    accountNumber: text('accountNumber'),
    iban: cleanIban(raw?.iban),
    swift: text('swift').toUpperCase(),
    country: text('country').toUpperCase().slice(0, 2),
    notes: text('notes'),
  };
}

/**
 * The accounts and the payment terms.
 *
 * `raw` is site_settings.billing, which may be the new { accounts, terms } or
 * the old flat single bank. Both come back as the same thing.
 */
export function billingDetails(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};

  let accounts = [];

  if (Array.isArray(value.accounts)) {
    accounts = value.accounts.map(shapeAccount);
  } else if (value.bankName || value.accountName || value.iban) {
    /* The shape the first version wrote. Carried across in place rather than
       migrated in SQL: it is one jsonb column read through this one function,
       so nothing else could be looking at the old keys. */
    accounts = [
      shapeAccount(
        {
          id: 'acc-1',
          kind: 'bank',
          label: value.bankName || 'Bank account',
          bankName: value.bankName,
          accountName: value.accountName,
          iban: value.iban,
        },
        0
      ),
    ];
  }

  // An account with no label and nothing to pay into is not a way to pay.
  accounts = accounts.filter((a) => a.label || a.iban || a.accountNumber || a.bankName);

  return {
    accounts,
    // Free text, both languages — "pay within 7 days", or whatever this platform
    // actually tells its showrooms.
    terms: value.terms && typeof value.terms === 'object' ? value.terms : {},
    // A plain boolean, not a getter: this crosses the server/client boundary as
    // props, and a getter does not survive that trip.
    filled: accounts.length > 0,
  };
}
