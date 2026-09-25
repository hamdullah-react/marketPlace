'use server';

/**
 * Recording money — the only code that marks a charge paid.
 *
 * ── Everything here is AUDITED, without exception ───────────────────────────
 *
 * These four actions are the ones that will be questioned months later: who
 * said this was paid, when, against which reference, and who cancelled the
 * charge that is missing from the total. Every one writes to audit_log with the
 * before and after amounts, and the log is written by the service role so its
 * subject cannot edit it (§17.12).
 *
 * ── Marking paid is REVERSIBLE, and that is deliberate ──────────────────────
 *
 * A cheque bounces, a transfer turns out to be from a different showroom, an
 * admin picks the wrong row. The alternative to an undo is a void plus a
 * re-raise, which loses the charge's reference and its history — so the money
 * can be un-recorded, and the audit log keeps both halves.
 *
 * ── A void needs a reason; a payment needs a date ───────────────────────────
 *
 * The showroom is shown the void reason on their own billing page, so "your
 * charge disappeared" is never the whole story. And a payment date is asked for
 * rather than assumed to be today, because an admin recording Thursday's
 * transfer on Monday must not move it into the wrong month.
 */

import { revalidatePath, updateTag } from 'next/cache';
import { adminForAction } from '@/marketplace/auth/session';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { writeAudit } from '@/marketplace/db/queries/admin';
import { isMissingSchema } from '@/marketplace/db/queries/engagement';
import { notifyVendorLeads } from '@/marketplace/lib/realtime';
import { SITE_TAGS } from '@/marketplace/lib/sitePages';
import { billingDetails, validateAccount, cleanIban } from '@/marketplace/lib/billing';
import { extendedTo } from '@/marketplace/lib/access';
import { recordNotification } from '@/marketplace/db/queries/notifications';
import { getVendorAccess } from '@/marketplace/db/queries/access';
import { activateBoost, deactivateBoost } from '@/marketplace/db/queries/boosts';
import { parseInstant, isFuture } from '@/marketplace/lib/datetime';

const str = (fd, k) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};

const stamp = () => Date.now() + Math.random();
const ok = (data = {}) => ({ ok: true, error: null, token: stamp(), ...data });
const bad = (error, extra = {}) => ({ ok: false, error, token: stamp(), ...extra });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const refresh = () => {
  revalidatePath('/[locale]/marketplace/admin/finance', 'page');
  revalidatePath('/[locale]/marketplace/admin', 'page');
  revalidatePath('/[locale]/marketplace/admin/subscriptions', 'page');
  revalidatePath('/[locale]/marketplace/seller/billing', 'page');
  revalidatePath('/[locale]/marketplace/subscription', 'page');
  // A recorded renewal changes what requireVendor() decides, so the dashboard
  // itself has to be re-rendered for a tab that is already open.
  revalidatePath('/[locale]/marketplace/seller', 'layout');
};

/** The charge, or an error result — every action starts here. */
async function load(db, chargeId) {
  const build = (columns) =>
    db.from('vendor_charges').select(columns).eq('id', chargeId).maybeSingle();

  const FULL =
    'id, ref, vendor_id, amount, state, paid_at, payment_method, payment_ref, kind, access_days, boost_id, listing_id';
  const BASE = 'id, ref, vendor_id, amount, state, paid_at, payment_method, payment_ref, boost_id, listing_id';

  // access_days arrives with the RENEWAL section; without it a payment is still
  // recorded, it simply grants no time — and the caller says so.
  let { data, error } = await build(FULL);
  if (error?.code === '42703') ({ data, error } = await build(BASE));

  if (error) return { error: isMissingSchema(error) ? 'BILLING_NOT_MIGRATED' : 'SAVE_FAILED' };
  if (!data) return { error: 'NOT_FOUND' };
  return { charge: data };
}

/** Mark a charge paid. */
export async function recordPayment(prevState, formData) {
  const { viewer, error: denied } = await adminForAction();
  if (denied) return bad(denied);

  const chargeId = str(formData, 'chargeId');
  const method = str(formData, 'method');
  const reference = str(formData, 'reference').slice(0, 120) || null;
  const when = str(formData, 'paidAt');
  // The account's label, snapshotted — see the note on vendor_charges.paid_into.
  const paidInto = str(formData, 'paidInto').slice(0, 80) || null;
  const note = str(formData, 'note').slice(0, 300) || null;

  if (!UUID.test(chargeId)) return bad('NOT_FOUND');
  if (!method) return bad('METHOD_REQUIRED');

  /* ── The date, as an INSTANT ────────────────────────────────────────
     This used to be `new Date(when)` on a zone-less wall clock, with a comment
     saying JS reads it as local time "which is what the admin meant". The
     parsing is local to whoever parses, and here that is the SERVER — UTC in
     production. An admin in Pakistan recording a payment at 09:52 had it read
     as 09:52 UTC, five hours ahead of the real moment, and was told their
     payment could not be dated in the future. It worked on a laptop and only
     on a laptop, because there the two zones agree.

     The browser now converts before sending (see lib/datetime.js), so what
     arrives is an instant and nothing here has to guess a zone. */
  const paidAt = when ? parseInstant(when) : new Date();
  if (!paidAt) return bad('DATE_INVALID');
  // A payment cannot have arrived tomorrow. A wrong date here lands in the
  // wrong month's collected figure and is hard to spot afterwards. The
  // tolerance is for a device clock that runs fast, not for a typo.
  if (isFuture(paidAt)) return bad('DATE_FUTURE');

  const db = getMarketplaceDb();
  const { charge, error: readError } = await load(db, chargeId);
  if (readError) return bad(readError);

  if (charge.state === 'paid') return bad('ALREADY_PAID');
  if (charge.state === 'void') return bad('CHARGE_VOID');

  let { error } = await db
    .from('vendor_charges')
    .update({
      state: 'paid',
      paid_at: paidAt.toISOString(),
      payment_method: method,
      payment_ref: reference,
      paid_into: paidInto,
      note,
      recorded_by: viewer.userId,
    })
    .eq('id', chargeId)
    // Re-checked at the database: between the read and this write another admin
    // may have recorded the same transfer, and it must not be booked twice.
    .eq('state', 'due');

  /* 42703 — paid_into has not been added on this database yet. The payment is
     the point and the account it landed in is an improvement on top, so the
     write is retried without it rather than refusing money that has arrived. */
  if (error?.code === '42703') {
    ({ error } = await db
      .from('vendor_charges')
      .update({
        state: 'paid',
        paid_at: paidAt.toISOString(),
        payment_method: method,
        payment_ref: reference,
        recorded_by: viewer.userId,
      })
      .eq('id', chargeId)
      .eq('state', 'due'));
  }

  if (error) return bad('SAVE_FAILED', { detail: error.message });

  await writeAudit(
    viewer,
    'charge.paid',
    'charge',
    chargeId,
    { state: charge.state },
    { ref: charge.ref, amount: charge.amount, method, reference, into: paidInto, paid_at: paidAt.toISOString() }
  );

  /**
   * ── A SUBSCRIPTION payment buys time, and this is where it lands ─────────
   *
   * The whole renewal loop closes here. A boost charge grants nothing; a
   * subscription charge carries `access_days`, and recording its payment moves
   * `access_until` by exactly that many days and lifts any block.
   *
   * Done in the SAME action rather than leaving the admin to press Extend
   * afterwards, because those two presses are one decision — and the version
   * where somebody records the money and forgets the second step is a showroom
   * that has paid and is still locked out, which is the worst outcome this
   * system can produce.
   *
   * extendedTo() adds to whatever is left rather than replacing it, so renewing
   * a week early keeps that week (lib/access.js).
   *
   * It is deliberately NOT allowed to fail the payment. The money has arrived
   * and that record must stand; a date that did not move is reported back and
   * fixable with one press of Extend.
   */
  let accessUntil = null;
  let accessError = null;

  if (charge.kind === 'subscription' && Number(charge.access_days) > 0) {
    const vendor = await getVendorAccess(charge.vendor_id);

    if (vendor) {
      accessUntil = extendedTo(vendor, Number(charge.access_days));

      const { error: accessFailed } = await db
        .from('vendors')
        .update({
          access_until: accessUntil,
          access_blocked: false,
          access_block_reason: null,
          access_blocked_at: null,
          access_blocked_by: null,
        })
        .eq('id', charge.vendor_id);

      if (accessFailed) {
        accessError = accessFailed.code === '42703' ? 'ACCESS_NOT_MIGRATED' : 'SAVE_FAILED';
        accessUntil = null;
      } else {
        await writeAudit(
          viewer,
          'access.renew',
          'vendor',
          charge.vendor_id,
          { access_until: vendor.access_until, was_blocked: vendor.access_blocked },
          { access_until: accessUntil, days: Number(charge.access_days), charge: charge.ref }
        );
      }
    }
  }

  /**
   * ── A BOOST payment is what puts the car on the grid ──────────────────────
   *
   * Approving a promotion used to feature the car immediately and leave the
   * invoice outstanding, so a showroom got the placement whether or not it ever
   * paid. Approval now only agrees to run it; this is where it starts.
   *
   * The clock starts NOW rather than at approval, so a showroom that pays a
   * week late still gets its full run — what it bought was a number of days on
   * the grid, not a date range it partly missed.
   *
   * Like the access grant below, it is NOT allowed to fail the payment: the
   * money has arrived and that record must stand. A promotion that did not
   * start is reported back and fixable, where a lost payment is not.
   */
  let featuredUntil = null;
  let featuredDays = null;
  let boostError = null;

  if (charge.kind !== 'subscription' && charge.boost_id) {
    const live = await activateBoost(charge.boost_id);

    if (!live.ok) {
      boostError = live.error;
    } else if (live.endsAt) {
      featuredUntil = live.endsAt;
      featuredDays = live.days;
      await writeAudit(
        viewer,
        'boost.start',
        'listing',
        live.listingId,
        { boost: charge.boost_id },
        { days: live.days, ends_at: live.endsAt, charge: charge.ref }
      );
    }
    /* live.skipped — the request was cancelled, or the car is no longer live.
       Neither is an error: the money is still owed and still recorded, and
       there is simply nothing to put on the grid. */
  }

  // Their billing page is open often enough that this is worth a nudge: the
  // showroom's outstanding total has just dropped.
  notifyVendorLeads(charge.vendor_id, 'billing_changed', { id: chargeId, paid: true });

  await recordNotification({
    audience: 'vendor',
    vendorId: charge.vendor_id,
    kind: 'charge_paid',
    data: { ref: charge.ref, amount: charge.amount },
    href: '/marketplace/seller/billing',
  });

  /* Two separate things a payment can buy, and each is worth its own line:
     the promotion going live, and the dashboard reopening. */
  if (featuredUntil) {
    await recordNotification({
      audience: 'vendor',
      vendorId: charge.vendor_id,
      kind: 'boost_started',
      /* The BOOST's length, from the boost. access_days is the subscription
         field and is null on a promotion charge — reading it here would have
         put "for undefined days" in front of a seller. */
      data: { days: featuredDays ?? undefined },
      href: '/marketplace/seller/promotions',
    });
  }

  if (accessUntil) {
    await recordNotification({
      audience: 'vendor',
      vendorId: charge.vendor_id,
      kind: 'access_extended',
      data: { until: accessUntil },
      href: '/marketplace/seller/billing',
    });
  }

  // Their Promotions page shows it going live, and the card picks up its badge.
  if (featuredUntil) {
    notifyVendorLeads(charge.vendor_id, 'boost_changed', {
      id: charge.boost_id,
      decision: 'started',
    });
  }

  /* And, when the payment bought time, the message that reopens the dashboard
     in front of a seller who is watching the blocked screen. Same event the
     admin's Extend button sends — see LiveAccess and useLiveLeads. */
  if (accessUntil) {
    notifyVendorLeads(charge.vendor_id, 'access_changed', { allowed: true, until: accessUntil });
  }

  refresh();
  return ok({ chargeId, ref: charge.ref, accessUntil, accessError, featuredUntil, boostError });
}

/** Un-record a payment — a bounced cheque, or the wrong row. */
export async function undoPayment(prevState, formData) {
  const { viewer, error: denied } = await adminForAction();
  if (denied) return bad(denied);

  const chargeId = str(formData, 'chargeId');
  if (!UUID.test(chargeId)) return bad('NOT_FOUND');

  const db = getMarketplaceDb();
  const { charge, error: readError } = await load(db, chargeId);
  if (readError) return bad(readError);
  if (charge.state !== 'paid') return bad('NOT_PAID');

  const { error } = await db
    .from('vendor_charges')
    .update({ state: 'due', paid_at: null, payment_method: null, payment_ref: null })
    .eq('id', chargeId)
    .eq('state', 'paid');

  if (error) return bad('SAVE_FAILED', { detail: error.message });

  /* The old payment details go into the audit log as they are removed from the
     row — otherwise undoing a payment erases the only record of what was
     recorded, which is precisely what an investigation needs. */
  await writeAudit(
    viewer,
    'charge.unpaid',
    'charge',
    chargeId,
    { ref: charge.ref, amount: charge.amount, method: charge.payment_method, reference: charge.payment_ref, paid_at: charge.paid_at },
    { state: 'due' }
  );

  /* The promotion comes back OFF the grid. A payment recorded by mistake
     must not leave the car featured for the rest of its run — that is the
     whole point of gating the placement on the money. The boost row keeps its
     approved state and simply goes back to waiting to be paid for. */
  if (charge.kind !== 'subscription' && charge.boost_id) {
    const off = await deactivateBoost(charge.boost_id);
    if (off.ok && !off.skipped) {
      await writeAudit(viewer, 'boost.stop', 'listing', off.listingId, { boost: charge.boost_id }, {
        reason: 'payment undone', charge: charge.ref,
      });
      notifyVendorLeads(charge.vendor_id, 'boost_changed', { id: charge.boost_id, decision: 'stopped' });
    }
  }

  notifyVendorLeads(charge.vendor_id, 'billing_changed', { id: chargeId, paid: false });

  refresh();
  return ok({ chargeId, ref: charge.ref });
}

/** Cancel a charge — it was raised in error, or waived. */
export async function voidCharge(prevState, formData) {
  const { viewer, error: denied } = await adminForAction();
  if (denied) return bad(denied);

  const chargeId = str(formData, 'chargeId');
  const reason = str(formData, 'reason').slice(0, 300);

  if (!UUID.test(chargeId)) return bad('NOT_FOUND');
  if (!reason) return bad('REASON_REQUIRED');

  const db = getMarketplaceDb();
  const { charge, error: readError } = await load(db, chargeId);
  if (readError) return bad(readError);

  /* A paid charge is not voided — the money arrived, and cancelling the record
     of a payment received is how a ledger stops matching a bank statement.
     Un-record the payment first if that is really what happened. */
  if (charge.state === 'paid') return bad('CHARGE_PAID');
  if (charge.state === 'void') return bad('ALREADY_VOID');

  const { error } = await db
    .from('vendor_charges')
    .update({ state: 'void', void_reason: reason })
    .eq('id', chargeId)
    .eq('state', 'due');

  if (error) return bad('SAVE_FAILED', { detail: error.message });

  await writeAudit(
    viewer,
    'charge.void',
    'charge',
    chargeId,
    { state: charge.state, amount: charge.amount },
    { ref: charge.ref, reason }
  );

  notifyVendorLeads(charge.vendor_id, 'billing_changed', { id: chargeId, voided: true });

  refresh();
  return ok({ chargeId, ref: charge.ref });
}

/**
 * Remove a charge from the record entirely.
 *
 * ── Why this exists beside Cancel ───────────────────────────────────────────
 *
 * Cancelling (void) keeps the row and marks it, which is right when a showroom
 * was billed and the platform then waived it: they saw the charge, and a screen
 * that silently loses it starts the conversation "you sent me an invoice"
 * against a page showing nothing.
 *
 * It is wrong for a row that should never have existed — a duplicate, a test, a
 * promotion requested and abandoned. Those accumulate in the ledger as
 * permanent noise nobody can clear, and an admin reconciling a month has to
 * read past them every time. So Delete is for the rows that are not history,
 * only clutter.
 *
 * ── A PAID charge is never deleted ──────────────────────────────────────────
 *
 * Money arrived. The row is the record of that, it is what a bank statement is
 * reconciled against, and for a subscription it is also the reason a showroom
 * has the access it has. Un-record the payment first if the money did not
 * actually come — that path exists (undoPayment), it is audited, and it takes
 * back the days it granted. Deleting instead would remove the evidence and
 * leave the access.
 *
 * ── Deleting does NOT take a promotion off the grid ─────────────────────────
 *
 * That is deliberate, and worth being explicit about. A paid promotion cannot
 * reach this action at all, and an unpaid one was never started (see A PROMOTION
 * STARTS WHEN IT IS PAID FOR). So there is no case where deleting a charge
 * should silently un-feature a car — the promotion itself is ended from Boost
 * requests, where an admin can see what they are stopping.
 */
export async function deleteCharge(prevState, formData) {
  const { viewer, error: denied } = await adminForAction();
  if (denied) return bad(denied);

  const chargeId = str(formData, 'chargeId');
  if (!UUID.test(chargeId)) return bad('NOT_FOUND');

  const db = getMarketplaceDb();
  const { charge, error: readError } = await load(db, chargeId);
  if (readError) return bad(readError);

  if (charge.state === 'paid') return bad('CHARGE_PAID_NO_DELETE');

  /* Scoped by state at the DATABASE as well as checked above: between the read
     and the delete another admin may have recorded the payment, and the whole
     point of the rule is that a paid charge survives. */
  const { data: gone, error } = await db
    .from('vendor_charges')
    .delete()
    .eq('id', chargeId)
    .neq('state', 'paid')
    .select('id');

  if (error) return bad('DELETE_FAILED', { detail: error.message });
  // Zero rows means it was paid a moment ago, or is already gone.
  if (!gone?.length) return bad('CHARGE_PAID_NO_DELETE');

  /* The whole row, in `before`. This is the only action here that leaves
     nothing behind to look at, so the audit entry has to BE the record —
     "CHG-2026-00014 for 900 against this showroom was deleted by this admin".
     An audit line naming a row nobody can read any more is not an answer. */
  await writeAudit(
    viewer,
    'charge.delete',
    'charge',
    chargeId,
    {
      ref: charge.ref,
      vendor_id: charge.vendor_id,
      amount: charge.amount,
      state: charge.state,
      kind: charge.kind ?? null,
      access_days: charge.access_days ?? null,
      boost_id: charge.boost_id ?? null,
    },
    null
  );

  // The showroom's billing page is showing this row right now.
  notifyVendorLeads(charge.vendor_id, 'billing_changed', { id: chargeId, deleted: true });

  refresh();
  return ok({ chargeId, ref: charge.ref });
}

/**
 * Where showrooms should send the money — one account at a time.
 *
 * ── Read, change, write ─────────────────────────────────────────────────────
 *
 * The accounts live in one jsonb column, so adding one means reading the list,
 * putting the new account in it and writing it back. That is a read-modify-write
 * and it can lose a change if two admins save at the same moment — accepted
 * deliberately: this is a handful of rows edited by one or two people a few
 * times a year, and the alternative is a table, a migration and a join for
 * something no page ever queries.
 *
 * ── The same action adds and edits ──────────────────────────────────────────
 *
 * An `accountId` that matches an existing row replaces it; anything else is
 * appended. One code path, so the validation and the audit entry cannot drift
 * between the two.
 */

const readBilling = async (db) => {
  const { data, error } = await db.from('site_settings').select('billing').eq('id', true).maybeSingle();
  if (error) return { error: error.code === '42703' ? 'BILLING_NOT_MIGRATED' : 'SAVE_FAILED' };
  return { billing: data?.billing && typeof data.billing === 'object' ? data.billing : {} };
};

const writeBilling = async (db, billing) => {
  const { error } = await db.from('site_settings').update({ billing }).eq('id', true);
  if (error) return error.code === '42703' ? 'BILLING_NOT_MIGRATED' : 'SAVE_FAILED';
  /* getSiteSettings() is cached for an hour behind SITE_TAGS.settings, so
     without this an admin saves an account and both this page and every
     showroom's billing page keep showing the old one — read-your-own-writes,
     the same reason every other site-settings action ends this way. */
  updateTag(SITE_TAGS.settings);
  return null;
};

/** Add a payment destination, or change one. */
export async function savePaymentAccount(prevState, formData) {
  const { viewer, error: denied } = await adminForAction();
  if (denied) return bad(denied);

  const accountId = str(formData, 'accountId');

  const account = {
    kind: str(formData, 'kind') || 'bank',
    label: str(formData, 'label').slice(0, 80),
    bankName: str(formData, 'bankName').slice(0, 120),
    accountName: str(formData, 'accountName').slice(0, 120),
    accountNumber: str(formData, 'accountNumber').slice(0, 40),
    iban: cleanIban(str(formData, 'iban')).slice(0, 34),
    swift: str(formData, 'swift').toUpperCase().slice(0, 11),
    country: str(formData, 'country').toUpperCase().slice(0, 2),
    notes: str(formData, 'notes').slice(0, 200),
  };

  // The same rule the form ran, asked again where it cannot be skipped. No
  // country is privileged — see validateAccount.
  const invalid = validateAccount(account);
  if (invalid) return bad(invalid);

  const db = getMarketplaceDb();
  const { billing, error: readError } = await readBilling(db);
  if (readError) return bad(readError);

  const current = billingDetails(billing).accounts;
  const index = accountId ? current.findIndex((a) => a.id === accountId) : -1;

  const next = [...current];
  if (index >= 0) {
    next[index] = { ...next[index], ...account, id: current[index].id };
  } else {
    // Time-based rather than a counter: deleting the second of three must not
    // hand the next account an id one of them already used.
    next.push({ ...account, id: `acc-${Date.now().toString(36)}` });
  }

  const failed = await writeBilling(db, { ...billing, accounts: next });
  if (failed) return bad(failed);

  await writeAudit(
    viewer,
    index >= 0 ? 'billing.account.update' : 'billing.account.add',
    'site_settings',
    'billing',
    index >= 0 ? { label: current[index].label } : null,
    {
      label: account.label,
      kind: account.kind,
      // The last four only. Every staff member can read the audit log, and a
      // full bank number does not need to be in it to answer "was this changed,
      // by whom, and when".
      iban: account.iban ? `…${account.iban.slice(-4)}` : null,
      accountNumber: account.accountNumber ? `…${account.accountNumber.slice(-4)}` : null,
    }
  );

  refresh();
  return ok({ accountId: index >= 0 ? accountId : next[next.length - 1].id });
}

/** Remove a payment destination. */
export async function deletePaymentAccount(prevState, formData) {
  const { viewer, error: denied } = await adminForAction();
  if (denied) return bad(denied);

  const accountId = str(formData, 'accountId');
  if (!accountId) return bad('NOT_FOUND');

  const db = getMarketplaceDb();
  const { billing, error: readError } = await readBilling(db);
  if (readError) return bad(readError);

  const current = billingDetails(billing).accounts;
  const gone = current.find((a) => a.id === accountId);
  if (!gone) return bad('NOT_FOUND');

  const failed = await writeBilling(db, {
    ...billing,
    accounts: current.filter((a) => a.id !== accountId),
  });
  if (failed) return bad(failed);

  /* The whole account goes into the audit log as it is removed, last four and
     all — after this there is no row left to look at, and "which account did we
     take down in March" is exactly the question that gets asked. */
  await writeAudit(viewer, 'billing.account.remove', 'site_settings', 'billing', {
    label: gone.label,
    kind: gone.kind,
    iban: gone.iban ? `…${gone.iban.slice(-4)}` : null,
  }, null);

  refresh();
  return ok({ accountId });
}

/** The payment terms shown under the accounts, in both languages. */
export async function saveBillingTerms(prevState, formData) {
  const { viewer, error: denied } = await adminForAction();
  if (denied) return bad(denied);

  const terms = {
    ar: str(formData, 'termsAr').slice(0, 500),
    en: str(formData, 'termsEn').slice(0, 500),
  };

  const db = getMarketplaceDb();
  const { billing, error: readError } = await readBilling(db);
  if (readError) return bad(readError);

  const failed = await writeBilling(db, { ...billing, terms });
  if (failed) return bad(failed);

  await writeAudit(viewer, 'billing.terms', 'site_settings', 'billing', null, terms);

  refresh();
  return ok();
}
