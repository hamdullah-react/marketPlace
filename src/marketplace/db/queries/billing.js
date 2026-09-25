import 'server-only';

/**
 * Vendor billing — what showrooms owe the platform, and what has been paid.
 *
 * ── Not `payouts`, and the difference is the whole point ─────────────────────
 *
 * queries/seller.ts already has getVendorPayouts/getPayoutTotals, reading the
 * `payouts` table: money the platform owes a SHOWROOM, from orders it collected
 * on their behalf. There are no orders, so there are no payouts, and those two
 * readers have always returned nothing.
 *
 * This file is the direction money actually moves here: a showroom pays the
 * platform to feature a car. See the VENDOR BILLING section of schema.sql.
 *
 * ── Every read survives a database without the table ────────────────────────
 *
 * `vendor_charges` arrives with schema.sql and code ships first. A missing table
 * gives a reader its empty answer and a `ready: false`, so the Finance screen
 * can say "run the SQL" instead of showing a 500 or, worse, a confident zero.
 */

import { getMarketplaceDb } from '@/marketplace/db/client';
import { isMissingSchema } from './engagement';
import { totals, DUE_DAYS } from '@/marketplace/lib/billing';

const BASE = `
  id, ref, vendor_id, kind, boost_id, listing_id, description, amount, state,
  issued_at, due_at, paid_at, payment_method, payment_ref, recorded_by,
  void_reason, note, created_at
`;

/**
 * BASE plus the column added after it.
 *
 * `paid_into` arrives with a later line of schema.sql, and PostgREST fails the
 * WHOLE query when a select names a column the database does not have — so a
 * Finance screen would go blank over the name of a bank account. Every reader
 * asks for it and falls back, the same shape as queries/reviews.ts.
 */
const SELECT = `${BASE}, paid_into, access_days, plan_id`;

/** 42703 — that column is not there yet. Anything else is a real failure. */
const retryWithout = (error) => error?.code === '42703';

const PARTIES = `,
  vendors ( id, slug, name, logo_url, contact_phone, contact_email ),
  listings ( id, slug, name, media )
`;

const WITH_PARTIES = `${SELECT}${PARTIES}`;
const WITH_PARTIES_BASE = `${BASE}${PARTIES}`;

const DAY = 86_400_000;

/**
 * Raise the charge for an approved boost.
 *
 * Called by the admin's approve action, because approval is the moment the
 * showroom owes the money — not the request, which they may cancel, and not the
 * start date, which can be weeks later when an existing boost is still running.
 *
 * ── It never fails the approval ─────────────────────────────────────────────
 *
 * Returns a result rather than throwing. A boost that has been approved is
 * featured on the site already; refusing to complete that because a billing row
 * could not be written would leave the admin pressing Approve on a promotion
 * that is visibly running. A missing charge is a figure to reconcile, and the
 * action says so — see decideBoost, which reports it.
 *
 * The 23505 case is expected, not exceptional: vendor_charges_boost_once means
 * a second approval of the same boost cannot bill twice, which is the guard
 * working.
 */
export async function raiseBoostCharge(boost, { recordedBy = null } = {}) {
  if (!boost?.id || !boost.vendor_id) return { ok: false, error: 'NO_BOOST' };

  /* An absent `price` KEY and a price of nothing are different facts, and
     collapsing them is what let a billing bug hide in plain sight for nine
     approvals: a caller that forgot to select the column got back "free boost,
     nothing owed, no error" and carried on.
     null or 0 mean free, which an admin may legitimately grant.
     undefined means nobody read the column — a programming error, and it says
     so loudly enough for decideBoost to surface it. */
  if (boost.price === undefined) return { ok: false, error: 'BOOST_PRICE_MISSING' };

  const amount = Number(boost.price ?? 0);
  // A free boost is a real thing an admin may grant, and it is not a debt.
  if (!Number.isFinite(amount) || amount <= 0) return { ok: true, skipped: 'FREE' };

  const now = Date.now();

  const { data, error } = await getMarketplaceDb()
    .from('vendor_charges')
    .insert({
      vendor_id: boost.vendor_id,
      kind: 'boost',
      boost_id: boost.id,
      listing_id: boost.listing_id ?? null,
      description: {
        ar: `تمييز سيارة لمدة ${boost.days} يوم`,
        en: `Featured listing for ${boost.days} days`,
      },
      amount,
      due_at: new Date(now + DUE_DAYS * DAY).toISOString(),
      recorded_by: recordedBy,
    })
    .select('id, ref')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') return { ok: true, skipped: 'ALREADY_RAISED' };
    if (isMissingSchema(error)) return { ok: false, error: 'BILLING_NOT_MIGRATED' };
    return { ok: false, error: 'SAVE_FAILED', detail: error.message };
  }

  return { ok: true, charge: data ?? null };
}

/**
 * The admin's Finance screen: the whole position, in one read.
 *
 * Same reasoning as getAdminOverview — this is one screen answering one
 * question, so it is one round trip rather than a reader per panel. The charges
 * come back whole and the totals are counted here, by the same function the
 * showroom's own page uses, so the two screens can never disagree.
 */
export async function getBillingOverview({ days = 30, recent = 50, kind = 'all' } = {}) {
  const db = getMarketplaceDb();

  /* TWO reads, and the split is the point.
     The totals have to be over EVERY charge — a headline "outstanding" figure
     computed from the most recent fifty is wrong the moment there are
     fifty-one, and wrong in the direction that matters. So the money is counted
     from four narrow columns of the whole table, and only the rows actually
     DISPLAYED carry the showroom and the car with them.
     Showrooms come back whole rather than embedded per charge: there are a
     handful of them against however many charges, so one small read beats
     repeating a name on every row. */
  const recentRows = (select) => {
    let q = db.from('vendor_charges').select(select).order('issued_at', { ascending: false }).limit(recent);
    if (kind !== 'all') q = q.eq('kind', kind);
    return q;
  };

  let [all, latest, vendors] = await Promise.all([
    /* `kind` comes back on every row even when only one kind is on screen,
       because the split below reports BOTH however the page is filtered. */
    db.from('vendor_charges').select('amount, state, due_at, paid_at, vendor_id, kind'),
    recentRows(WITH_PARTIES),
    db.from('vendors').select('id, slug, name, logo_url, contact_phone, contact_email'),
  ]);

  if (retryWithout(latest.error)) latest = await recentRows(WITH_PARTIES_BASE);

  if (all.error) {
    return {
      ready: !isMissingSchema(all.error),
      charges: [],
      totals: totals([]),
      collectedInPeriod: 0,
      byVendor: [],
      split: { boost: totals([]), subscription: totals([]), other: totals([]) },
      kind,
      days,
    };
  }

  const everyKind = all.data ?? [];
  const now = Date.now();
  const since = now - days * DAY;

  /* Everything below answers the question actually being asked — promotions or
     subscriptions — rather than blending the two into a figure that describes
     neither of them. */
  const every = kind === 'all' ? everyKind : everyKind.filter((c) => c.kind === kind);

  /* Collected IN THE PERIOD, by payment date rather than issue date. "How much
     came in this month" is a question about when the money arrived, not about
     when the charge was raised — a charge issued in March and paid in April is
     April's income. */
  const collectedInPeriod = every
    .filter((c) => c.state === 'paid' && Date.parse(c.paid_at ?? '') >= since)
    .reduce((sum, c) => sum + Number(c.amount ?? 0), 0);

  /* Per showroom, worst debt first — the list an admin works down. A showroom
     that has paid everything is kept, at zero, because "who have we billed"
     matters as well as "who owes". */
  const byId = new Map((vendors.data ?? []).map((v) => [v.id, v]));
  const groups = new Map();

  for (const c of every) {
    const entry = groups.get(c.vendor_id) ?? { vendorId: c.vendor_id, charges: [] };
    entry.charges.push(c);
    groups.set(c.vendor_id, entry);
  }

  const byVendor = [...groups.values()]
    .map((entry) => ({
      ...entry,
      vendor: byId.get(entry.vendorId) ?? null,
      ...totals(entry.charges, now),
    }))
    .sort((a, b) => b.outstanding - a.outstanding || b.collected - a.collected);

  return {
    ready: true,
    charges: latest.data ?? [],
    totals: totals(every, now),
    collectedInPeriod,
    byVendor,
    /* Both kinds, always — so a screen filtered onto promotions can still say
       that subscriptions are owed, instead of hiding them behind a tab. */
    split: {
      boost: totals(everyKind.filter((c) => c.kind === 'boost'), now),
      subscription: totals(everyKind.filter((c) => c.kind === 'subscription'), now),
      other: totals(everyKind.filter((c) => c.kind === 'other'), now),
    },
    kind,
    days,
  };
}

/**
 * How many payments are waiting to be confirmed — the number on the sidebar.
 *
 * ── Why a count and not a list ──────────────────────────────────────────────
 *
 * This is read by the admin LAYOUT, on every page of the panel. A list would be
 * fifty rows fetched to render a single digit; `head: true` with an exact count
 * asks the database for the number and transfers no rows at all.
 *
 * ── Split by kind, because they are not equally urgent ──────────────────────
 *
 * An unpaid promotion is a car that is not on the grid yet. An unpaid
 * SUBSCRIPTION is a showroom sitting in front of a locked dashboard believing it
 * has paid — so the two get their own figures, and the sidebar puts each on the
 * page that deals with it rather than one merged badge on both.
 *
 * Silent on failure, and 0 is the honest answer when the table is not there: a
 * badge is decoration on top of a panel that has to keep working, and the
 * pages themselves say plainly when billing has not been set up.
 */
export async function countAwaitingPayments() {
  const empty = { total: 0, subscription: 0, boost: 0, other: 0 };

  try {
    const db = getMarketplaceDb();

    const due = (kind) => {
      const q = db.from('vendor_charges').select('id', { count: 'exact', head: true }).eq('state', 'due');
      return kind ? q.eq('kind', kind) : q;
    };

    const [all, subscription, boost] = await Promise.all([due(null), due('subscription'), due('boost')]);

    if (all.error) return empty;

    const total = all.count ?? 0;
    const subs = subscription.error ? 0 : (subscription.count ?? 0);
    const boosts = boost.error ? 0 : (boost.count ?? 0);

    return {
      total,
      subscription: subs,
      boost: boosts,
      // Anything of a kind this function does not name, so a hand-entered
      // charge is still counted somewhere instead of vanishing.
      other: Math.max(0, total - subs - boosts),
    };
  } catch {
    return empty;
  }
}

/** One page of charges, filtered by kind and state — the Finance list's tabs. */
export async function listCharges({ state = 'all', kind = 'all', vendorId = null, limit = 50, offset = 0 } = {}) {
  const build = (select) => {
    let query = getMarketplaceDb()
      .from('vendor_charges')
      .select(select, { count: 'exact' })
      .order('issued_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (state !== 'all' && state !== 'overdue') query = query.eq('state', state);
    /* Overdue is `due` plus a date in the past, which PostgREST can express —
       unlike the JS-side isOverdue() the totals use. Both mean the same thing;
       this one is the version a database can filter on. */
    if (state === 'overdue') query = query.eq('state', 'due').lt('due_at', new Date().toISOString());
    if (vendorId) query = query.eq('vendor_id', vendorId);
    /* A promotion and a subscription are different debts and never share a
       list — see CHARGE_KINDS. */
    if (kind !== 'all') query = query.eq('kind', kind);

    return query;
  };

  let { data, error, count } = await build(WITH_PARTIES);
  if (retryWithout(error)) ({ data, error, count } = await build(WITH_PARTIES_BASE));

  if (error) return { ready: !isMissingSchema(error), items: [], total: 0 };
  return { ready: true, items: data ?? [], total: count ?? 0 };
}

/**
 * One showroom's statement.
 *
 * Void charges are INCLUDED and marked. A showroom that was billed and then had
 * the charge cancelled should be able to see that happened — otherwise the
 * conversation is "you sent me an invoice" against a screen showing nothing.
 */
export async function getVendorCharges(vendorId, { limit = 50, offset = 0, kind = 'all' } = {}) {
  if (!vendorId) return { ready: true, items: [], total: 0 };

  const build = (select) => {
    let q = getMarketplaceDb()
      .from('vendor_charges')
      .select(`${select}, listings ( id, slug, name, media )`, { count: 'exact' })
      .eq('vendor_id', vendorId)
      .order('issued_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (kind !== 'all') q = q.eq('kind', kind);
    return q;
  };

  let { data, error, count } = await build(SELECT);
  if (retryWithout(error)) ({ data, error, count } = await build(BASE));

  if (error) return { ready: !isMissingSchema(error), items: [], total: 0 };
  return { ready: true, items: data ?? [], total: count ?? 0 };
}

/**
 * The showroom's own totals — over EVERY charge, not the page.
 *
 * A statement paginated at fifty rows whose header counted only those fifty
 * would understate what a showroom owes the moment they have fifty-one. Two
 * narrow columns of every row is cheap; being wrong about a debt is not.
 */
export async function getVendorChargeTotals(vendorId) {
  if (!vendorId) return { ready: true, ...totals([]) };

  const { data, error } = await getMarketplaceDb()
    .from('vendor_charges')
    .select('amount, state, due_at, paid_at, kind')
    .eq('vendor_id', vendorId);

  const split = (rows) => ({
    boost: totals((rows ?? []).filter((c) => c.kind === 'boost')),
    subscription: totals((rows ?? []).filter((c) => c.kind === 'subscription')),
    other: totals((rows ?? []).filter((c) => c.kind === 'other')),
  });

  if (error) return { ready: !isMissingSchema(error), ...totals([]), byKind: split([]) };

  /* The combined figures stay, because "what do I owe altogether" is still a
     fair question for a showroom to ask. byKind is what lets the page answer
     the two narrower ones without a second round trip. */
  return { ready: true, ...totals(data ?? []), byKind: split(data) };
}

/**
 * One charge, for the receipt — scoped to the showroom it belongs to.
 *
 * The vendor id is part of the WHERE, not checked after the read: a charge id in
 * a URL must never be enough to read another showroom's finances, and a filter
 * is harder to forget than an if-statement further down the page.
 *
 * The showroom comes with it because a receipt has to say who it is addressed
 * to, including the registration numbers a seller's own accountant will look
 * for.
 */
export async function getVendorCharge(chargeId, vendorId) {
  if (!chargeId || !vendorId) return null;

  const build = (select) =>
    getMarketplaceDb()
      .from('vendor_charges')
      .select(
        `${select},
         vendors ( id, slug, name, logo_url, cr_number, vat_number, contact_email, contact_phone, city, address ),
         listings ( id, slug, name )`
      )
      .eq('id', chargeId)
      .eq('vendor_id', vendorId)
      .maybeSingle();

  let { data, error } = await build(SELECT);
  if (retryWithout(error)) ({ data, error } = await build(BASE));

  if (error) return null;
  return data ?? null;
}
