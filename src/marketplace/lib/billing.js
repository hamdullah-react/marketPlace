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

/**
 * The two kinds of money a showroom owes, and they are NOT the same debt.
 *
 * A promotion is a one-off a showroom chose to buy for a particular car. A
 * subscription is the recurring rent on their dashboard, and missing it closes
 * the dashboard. Merged into one list they produce a number that answers
 * neither question an admin actually has — "do they owe us for advertising" and
 * "are they paid up" — which is why every screen showing charges now picks a
 * side.
 *
 * The keys are the values in vendor_charges.kind, so this is the database's own
 * vocabulary rather than a second naming to keep in step with it.
 */
export const CHARGE_KINDS = {
  boost: {
    ar: 'تمييز السيارات',
    en: 'Promotions',
    arOne: 'تمييز سيارة',
    enOne: 'Promotion',
  },
  subscription: {
    ar: 'الاشتراكات',
    en: 'Subscriptions',
    arOne: 'اشتراك',
    enOne: 'Subscription',
  },
  /* The schema's third allowed value (vendor_charges_kind_check). Nothing
     raises one today, but a screen that splits by kind and knows only two would
     silently drop any charge an admin enters by hand — money on a statement
     that the rows do not add up to. Named here so it is merely rare, not
     invisible. */
  other: {
    ar: 'مستحقات أخرى',
    en: 'Other charges',
    arOne: 'مستحق آخر',
    enOne: 'Other charge',
  },
};

export const kindLabel = (kind, locale = 'ar', { one = false } = {}) => {
  const k = CHARGE_KINDS[kind];
  if (!k) return kind ?? '';
  if (one) return locale === 'ar' ? k.arOne : k.enOne;
  return locale === 'ar' ? k.ar : k.en;
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
  /* Cancelled rows carry no money — they are counted and nothing else, which is
     exactly what a tab bar needs from them. */
  let voidCount = 0;
  let count = 0;

  for (const c of charges ?? []) {
    const amount = Number(c.amount ?? 0);
    count += 1;
    if (c.state === 'void') voidCount += 1;
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

  return { outstanding, collected, overdue, dueCount, overdueCount, paidCount, voidCount, count };
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
    /* ── Must a receipt come with the request? ─────────────────────
       An admin's choice, in the same jsonb as the accounts — which is where it
       belongs, because it is a rule about how this platform takes money and it
       is read wherever the accounts are.

       false by default, and that default is deliberate: switching it on changes
       what happens to requests a showroom has ALREADY sent, and a platform that
       silently started ignoring them on the day this shipped would be a
       platform whose admins wondered where the renewals went. Off means exactly
       what happened before this setting existed.

       It applies to promotions and subscriptions alike. They are different
       debts everywhere else in this schema, and this is the one thing that is
       genuinely the same about them: both are a showroom saying "I will pay",
       and the question is whether the platform wants to see the transfer before
       it starts counting. One setting, because two would only ever be set to
       the same value and then drift. */
    requireProof: value.requireProof === true,

    // A plain boolean, not a getter: this crosses the server/client boundary as
    // props, and a getter does not survive that trip.
    filled: accounts.length > 0,
  };
}

/**
 * Has this request actually reached the platform?
 *
 * ── The question this answers ─────────────────────────────────
 *
 * A showroom pressing "Request renewal" or asking for a promotion raises a
 * charge. Whether that charge is something an ADMIN should be looking at is a
 * separate matter, and until now the two were the same thing: the request
 * appeared in the admin's queue the instant it was made, whether or not any
 * money had moved. On a platform where most requests are followed by a transfer
 * within the hour that is fine; on one where they are not, the queue fills with
 * intentions and the real payments are buried among them.
 *
 * With `requireProof` on, a request counts as PRESENTED only once a receipt is
 * attached. The charge still exists from the moment it is raised — it has to,
 * because it carries the reference the showroom must quote on the transfer —
 * but the admin's queues and badges skip it until there is something to look at.
 *
 * ── Nothing is hidden, only unqueued ────────────────────────────
 *
 * An unpresented charge is still in the ledger, still searchable, and has a
 * filter of its own. "The admin does not have to deal with it yet" and "the
 * admin cannot find it" are different, and only the first is wanted: a showroom
 * ringing to ask what happened to its request must not be met with a screen
 * saying no such request exists.
 *
 * A REJECTED receipt un-presents the charge again, which is the point of
 * rejecting one: the ball is back with the showroom, and the queue should say
 * so rather than counting a row nobody here can move.
 */
export function isPresented(charge, hasReceipt, requireProof) {
  // Only ever gates what is still owed. A paid or cancelled charge is history,
  // and history is always visible.
  if (!charge || charge.state !== 'due') return true;
  if (!requireProof) return true;

  return hasReceipt === true;
}

/**
 * Is a receipt with the platform for this charge?
 *
 * The second argument `isPresented` wants, derived from a proof row. Its own
 * function because the two callers hold different things — one has the row, the
 * other only a set of charge ids — and the definition of "with us" (sent, or
 * already accepted; a REJECTED one is back with the showroom) should not be
 * written out twice and then disagree.
 */
export const hasReceiptWithUs = (proof) =>
  proof?.state === 'submitted' || proof?.state === 'accepted';
